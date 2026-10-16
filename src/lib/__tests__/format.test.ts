import { describe, it, expect } from 'vitest';
import { formatMeters, parseDecimalInput } from '../format';

describe('formatMeters', () => {
  it('should format 2 with 2 digits as "2,00"', () => {
    expect(formatMeters(2)).toBe('2,00');
  });

  it('should format 1.5 with 1 digit as "1,5"', () => {
    expect(formatMeters(1.5, 1)).toBe('1,5');
  });

  it('should format 0 with 2 digits as "0,00"', () => {
    expect(formatMeters(0)).toBe('0,00');
  });
});

describe('parseDecimalInput', () => {
  it('akzeptiert Komma und Punkt als Dezimaltrennzeichen', () => {
    expect(parseDecimalInput('1,5')).toBe(1.5);
    expect(parseDecimalInput('1.5')).toBe(1.5);
  });

  it('ignoriert Leerzeichen am Rand', () => {
    expect(parseDecimalInput(' 2 ')).toBe(2);
  });

  it('akzeptiert negative Werte', () => {
    expect(parseDecimalInput('-0,5')).toBe(-0.5);
  });

  it('liefert null bei leerer oder nur aus Leerzeichen bestehender Eingabe', () => {
    expect(parseDecimalInput('')).toBeNull();
    expect(parseDecimalInput('   ')).toBeNull();
  });

  it('liefert null bei ungültiger Eingabe', () => {
    expect(parseDecimalInput('abc')).toBeNull();
    expect(parseDecimalInput('1,2,3')).toBeNull();
    expect(parseDecimalInput('Infinity')).toBeNull();
    expect(parseDecimalInput('NaN')).toBeNull();
  });
});
