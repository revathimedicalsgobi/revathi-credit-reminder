import { describe, it, expect } from 'vitest';
import {
  normalizeVoiceText,
  parseVoicePriceOrNumber,
  parseSingleFieldVoiceInput,
  parseAllInOneVoiceSentence,
  cleanVoiceMedicineName,
} from '../lib/voice-billing-parser';

describe('Voice Billing Parser Tests', () => {
  it('correctly normalizes decimals spoken with point, pulli, புள்ளி, and rupees/paise', () => {
    // English 'point'
    expect(parseVoicePriceOrNumber('33 point 50')).toBe('33.50');
    expect(parseVoicePriceOrNumber('120 point 75')).toBe('120.75');

    // Tanglish 'pulli'
    expect(parseVoicePriceOrNumber('33 pulli 50')).toBe('33.50');
    expect(parseVoicePriceOrNumber('45 pulli 00')).toBe('45.00');

    // Tamil 'புள்ளி'
    expect(parseVoicePriceOrNumber('33 புள்ளி 50')).toBe('33.50');
    expect(parseVoicePriceOrNumber('99 புள்ளி 25')).toBe('99.25');

    // Rupees & Paise
    expect(parseVoicePriceOrNumber('33 ரூபாய் 50 பைசா')).toBe('33.50');
    expect(parseVoicePriceOrNumber('50 ரூபாய் 25 காசு')).toBe('50.25');

    // Spoken Tamil number words
    expect(parseVoicePriceOrNumber('பதினைந்து')).toBe('15');
    expect(parseVoicePriceOrNumber('இருபது')).toBe('20');
    expect(parseVoicePriceOrNumber('இருபத்தைந்து')).toBe('25');
  });

  it('handles step-by-step guided voice input advancement', () => {
    // 1. Medicine Name -> Advances to quantity
    const nameResult = parseSingleFieldVoiceInput('Dolo 650', 'itemName');
    expect(nameResult).not.toBeNull();
    expect(nameResult?.value).toBe('Dolo 650');
    expect(nameResult?.nextField).toBe('quantity');

    // 2. Quantity (direct number without saying 'qty') -> Advances to mrp
    const qtyResult = parseSingleFieldVoiceInput('2', 'quantity');
    expect(qtyResult).not.toBeNull();
    expect(qtyResult?.value).toBe('2');
    expect(qtyResult?.nextField).toBe('mrp');

    const qtyTamilResult = parseSingleFieldVoiceInput('இரண்டு அட்டை', 'quantity');
    expect(qtyTamilResult?.value).toBe('2');

    // 3. MRP (decimal with point or pulli) -> Advances to discount
    const mrpPointResult = parseSingleFieldVoiceInput('33 point 50', 'mrp');
    expect(mrpPointResult?.value).toBe('33.50');
    expect(mrpPointResult?.nextField).toBe('discount');

    const mrpPulliResult = parseSingleFieldVoiceInput('33 புள்ளி 50', 'mrp');
    expect(mrpPulliResult?.value).toBe('33.50');
    expect(mrpPulliResult?.nextField).toBe('discount');

    // 4. Discount -> Advances to nextRow
    const discResult = parseSingleFieldVoiceInput('15', 'discount');
    expect(discResult?.value).toBe('15');
    expect(discResult?.nextField).toBe('nextRow');

    const noDiscResult = parseSingleFieldVoiceInput('no discount', 'discount');
    expect(noDiscResult?.value).toBe('0');
    expect(noDiscResult?.nextField).toBe('nextRow');
  });

  it('correctly parses all-in-one spoken sentences into 4 fields', () => {
    const full1 = parseAllInOneVoiceSentence('Dolo 650 1 strip mrp 33 point 50 discount 15%');
    expect(full1).not.toBeNull();
    expect(full1?.itemName).toContain('Dolo 650');
    expect(full1?.quantity).toBe('1');
    expect(full1?.mrp).toBe('33.50');
    expect(full1?.discount).toBe('15');

    const full2 = parseAllInOneVoiceSentence('Paracetamol 500 2 attai mrp 45 discount 10');
    expect(full2).not.toBeNull();
    expect(full2?.itemName).toContain('Paracetamol 500');
    expect(full2?.quantity).toBe('2');
    expect(full2?.mrp).toBe('45');
    expect(full2?.discount).toBe('10');

    const full3 = parseAllInOneVoiceSentence('Azithromycin 500mg 1 box mrp 120 புள்ளி 50 discount 20');
    expect(full3).not.toBeNull();
    expect(full3?.itemName).toContain('Azithromycin 500mg');
    expect(full3?.quantity).toBe('1');
    expect(full3?.mrp).toBe('120.50');
    expect(full3?.discount).toBe('20');
  });

  it('cleans spoken medicine names', () => {
    expect(cleanVoiceMedicineName('medicine name is Dolo 650')).toBe('Dolo 650');
    expect(cleanVoiceMedicineName('டேப்லெட் பாராசிட்டமால்')).toBe('பாராசிட்டமால்');
  });
});
