/**
 * Plan teilen über den URL-Hash (ohne Server): ein Plan wird als Token in `#plan=...` kodiert.
 *
 * Token-Form: `${kind}.${codec}.${payload}`
 * - codec 'z': deflate-raw über das JSON der Plan-Daten, dann base64url (kleiner, Normalfall).
 * - codec 'j': base64url über das JSON der Plan-Daten (Rückfall, wenn CompressionStream fehlt).
 *
 * Druckbilder sind nie Teil von data, die Aufrufer übergeben currentSavedState (ohne Druckbilder).
 * Die Plan-Felder selbst bleiben unverändert (heightCm, pieces, forexPanels ...).
 */
import type { PlanKind } from '../domain/migrations';

/** Schlüssel im URL-Hash: `#plan=TOKEN`. */
export const SHARE_HASH_KEY = 'plan';
/** z = deflate-raw + base64url, j = base64url(JSON) als Rückfall. */
export type ShareCodec = 'z' | 'j';
/** Ab dieser Länge warnt die Oberfläche vor zu langen Links (Browser und Messenger kürzen sonst). */
export const SHARE_URL_WARN_LENGTH = 8000;

function isPlanKind(v: unknown): v is PlanKind {
  return v === 'kastenbuehne' || v === 'tresen';
}

/** Bytes als base64url ohne Auffüllzeichen. In Blöcken, damit String.fromCharCode bei großen Arrays nicht überläuft. */
function bytesToBase64Url(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let bin = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Gegenstück zu bytesToBase64Url. Wirft bei ungültigem base64 (der Aufrufer fängt das ab). */
function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deflateRaw(json: string): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflateRaw(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

/**
 * Kodiert Plan-Daten in ein Token. Ohne Codec: 'z', wenn CompressionStream verfügbar ist, sonst 'j'.
 * Wirft, wenn der gewünschte Codec 'z' ohne CompressionStream angefordert wird.
 */
export async function encodePlanToken(kind: PlanKind, data: unknown, codec?: ShareCodec): Promise<string> {
  const c: ShareCodec = codec ?? (typeof CompressionStream !== 'undefined' ? 'z' : 'j');
  const json = JSON.stringify(data) ?? 'null';
  const payload = c === 'z'
    ? bytesToBase64Url(await deflateRaw(json))
    : bytesToBase64Url(new TextEncoder().encode(json));
  return `${kind}.${c}.${payload}`;
}

/**
 * Dekodiert ein Token. Jeder Fehler (falsches Format, unbekannter Plan-Typ, kaputtes base64,
 * falscher Codec, kaputtes JSON) liefert null — nie eine Ausnahme.
 */
export async function decodePlanToken(token: string): Promise<{ kind: PlanKind; data: unknown } | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [kind, codec, payload] = parts;
    if (!isPlanKind(kind)) return null;
    let json: string;
    if (codec === 'z') {
      json = await inflateRaw(base64UrlToBytes(payload));
    } else if (codec === 'j') {
      json = new TextDecoder('utf-8', { fatal: true }).decode(base64UrlToBytes(payload));
    } else {
      return null;
    }
    return { kind, data: JSON.parse(json) };
  } catch {
    return null;
  }
}

/** Holt das Token aus einem Hash wie `#plan=TOKEN` (auch mit weiteren `&`-Teilen). Kein Token → null. */
export function readShareToken(hash: string): string | null {
  const body = hash.startsWith('#') ? hash.slice(1) : hash;
  for (const part of body.split('&')) {
    const eq = part.indexOf('=');
    if (eq < 0 || part.slice(0, eq) !== SHARE_HASH_KEY) continue;
    const token = part.slice(eq + 1);
    return token === '' ? null : token;
  }
  return null;
}

/** Baut die Teilen-URL: vorhandenen Hash ersetzt, Rest der Adresse bleibt. */
export function buildShareUrl(href: string, token: string): string {
  return `${href.split('#')[0]}#${SHARE_HASH_KEY}=${token}`;
}
