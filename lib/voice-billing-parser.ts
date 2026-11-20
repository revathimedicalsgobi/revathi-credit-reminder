/**
 * Voice Billing Parser for Revathi Medicals & Distributors
 * Supports:
 * - English, Tamil, and Tanglish speech inputs
 * - Decimals with "point", "pulli", "புள்ளி", "dot", "ரூபாய் ... பைசா"
 * - Step-by-step field advance (Product Name -> Qty -> MRP -> Discount -> Next Row)
 * - All-in-one full sentence parsing ("Dolo 650 1 strip MRP 33.50 discount 15%")
 */

export type VoiceBillingField = 'itemName' | 'quantity' | 'mrp' | 'discount';

export const TAMIL_NUMBER_WORDS: Array<[string, number]> = [
  ['இருபத்தைந்து', 25],
  ['இருபத்து ஐந்து', 25],
  ['பதினொன்று', 11],
  ['பதினொன்னு', 11],
  ['பன்னிரண்டு', 12],
  ['பன்னெண்டு', 12],
  ['பதின்மூன்று', 13],
  ['பதின்மூணு', 13],
  ['பதினான்கு', 14],
  ['பதினாங்கு', 14],
  ['பதினைந்து', 15],
  ['பதினஞ்சு', 15],
  ['பதினாறு', 16],
  ['பதினேழு', 17],
  ['பதினெட்டு', 18],
  ['பத்தொன்பது', 19],
  ['இருபது', 20],
  ['முப்பது', 30],
  ['நாற்பது', 40],
  ['ஐம்பது', 50],
  ['அறுபது', 60],
  ['எழுபது', 70],
  ['எண்பது', 80],
  ['தொண்ணூறு', 90],
  ['நூறு', 100],
  ['பூஜ்ஜியம்', 0],
  ['ஜீரோ', 0],
  ['zero', 0],
  ['ஒன்று', 1],
  ['ஒன்னு', 1],
  ['ஒரு', 1],
  ['one', 1],
  ['single', 1],
  ['இரண்டு', 2],
  ['ரெண்டு', 2],
  ['two', 2],
  ['மூன்று', 3],
  ['மூணு', 3],
  ['three', 3],
  ['நான்கு', 4],
  ['நாலு', 4],
  ['four', 4],
  ['ஐந்து', 5],
  ['அஞ்சு', 5],
  ['five', 5],
  ['ஆறு', 6],
  ['six', 6],
  ['ஏழு', 7],
  ['seven', 7],
  ['எட்டு', 8],
  ['eight', 8],
  ['ஒன்பது', 9],
  ['nine', 9],
  ['பத்து', 10],
  ['ten', 10],
  ['eleven', 11],
  ['twelve', 12],
  ['fifteen', 15],
  ['twenty', 20],
  ['fifty', 50],
  ['hundred', 100],
];

/**
 * Normalizes speech text:
 * - Converts "point", "புள்ளி", "pulli", "dot" to "."
 * - Converts "33 ரூபாய் 50 பைசா/காசு" to "33.50"
 * - Replaces Tamil number words with digits
 */
export function normalizeVoiceText(text: string): string {
  if (!text) return '';
  let str = text.toLowerCase().trim();

  // Replace decimal terms: "point", "புள்ளி", "pulli", "dot" with "."
  str = str.replace(/\s*(?:point|புள்ளி|pulli|dot)\s*/gi, '.');

  // Replace "ரூபாய் ... பைசா/காசு" e.g. "33 ரூபாய் 50 பைசா" -> "33.50"
  str = str.replace(/(\d+)\s*(?:ரூபாய்|rupees?|rs\.?)\s*(\d+)\s*(?:பைசா|காசு|paise?|cents?)/gi, '$1.$2');

  // Replace "ரூபாய்" e.g. "33 ரூபாய்" -> "33"
  str = str.replace(/(\d+)\s*(?:ரூபாய்|rupees?|rs\.?)/gi, '$1');

  // Replace Tamil & English number words
  for (const [word, val] of TAMIL_NUMBER_WORDS) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const reg = new RegExp(`(^|\\s|[.,!?])${escaped}($|\\s|[.,!?])`, 'gi');
    str = str.replace(reg, `$1${val}$2`);
  }

  return str.trim();
}

/**
 * Extracts a price or decimal number from voice input (e.g. "33.50", "45", "10")
 */
export function parseVoicePriceOrNumber(raw: string): string | null {
  const normalized = normalizeVoiceText(raw);
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  return match ? match[1] : null;
}

/**
 * Common phonetic misrecognitions where English speech recognition transforms
 * Indian / Tamil customer names into common English words.
 */
export const PHONETIC_NAME_MAPPINGS: Array<[RegExp, string]> = [
  // "money building" -> "Mani Building"
  [/\bmoney\s*building\b/gi, 'Mani Building'],
  // "money kandan" -> "Manikandan"
  [/\bmoney\s*kandan\b/gi, 'Manikandan'],
  // "money maran" -> "Manimaran"
  [/\bmoney\s*maran\b/gi, 'Manimaran'],
  // "money vel" -> "Manivel"
  [/\bmoney\s*vel(?:an)?\b/gi, 'Manivel'],
  // "money" -> "Mani" (very common Tamil name மணி transcribed as "money" by English ASR)
  [/\bmoney\b/gi, 'Mani'],
  // "dollar" -> "Dolo" (sometimes spoken in context)
  [/\bdollar\b/gi, 'Dolo'],
  // "doctor" / "dr"
  [/\b(?:doctor|dr)\.?\s+/gi, 'Dr. '],
];

/**
 * Cleans a spoken customer name:
 * - Strips voice filler prefixes like "customer name is", "name is", "customer", etc.
 * - Replaces phonetic ASR confusions like "money" -> "Mani", "money building" -> "Mani Building"
 * - Properly capitalizes and formats the name
 */
export function cleanVoiceCustomerName(raw: string): string {
  if (!raw) return '';
  let str = raw.trim();

  // Strip common voice filler prefixes
  str = str.replace(
    /^(?:customer\s*name\s*is|customer\s*is|customer|client|வாடிக்கையாளர்\s*பெயர்|வாடிக்கையாளர்|பெயர்\s*என்னன்னா|பெயர்|பேர்)\s*[:=]?\s*/gi,
    ''
  );

  // Apply phonetic mappings (e.g. "money building" -> "Mani Building", "money" -> "Mani")
  for (const [pattern, replacement] of PHONETIC_NAME_MAPPINGS) {
    str = str.replace(pattern, replacement);
  }

  // Clean unwanted special characters except hyphens and dots (e.g. Dr.)
  str = str.replace(/[^\w\s\u0B80-\u0BFF.-]/gi, ' ').replace(/\s+/g, ' ').trim();

  if (!str) return '';

  // Capitalize each word nicely
  return str
    .split(' ')
    .map((w) => {
      if (w.toLowerCase() === 'dr.') return 'Dr.';
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

/**
 * Normalizes a customer name for robust comparison:
 * e.g. "money building" and "Mani Building" normalize to "manibuilding"
 */
export function normalizeCustomerComparisonKey(text: string): string {
  if (!text) return '';
  let key = text.toLowerCase().trim();
  for (const [pattern, replacement] of PHONETIC_NAME_MAPPINGS) {
    key = key.replace(pattern, replacement.toLowerCase());
  }
  // Remove non-alphanumeric
  return key.replace(/[^a-z0-9\u0B80-\u0BFF]/g, '');
}

/**
 * Cleans a spoken medicine name by removing voice filler commands
 */
export function cleanVoiceMedicineName(raw: string): string {
  if (!raw) return '';
  let cleaned = raw
    .replace(/^(?:item|medicine|product|மருந்து|பொருள்|டேப்லெட்|tablet)\s*(?:name|பெயர்)?\s*(?:is|என்|ஆகும்)?\s*[:=]?/gi, '')
    .replace(/\b(?:போடு|சேர்|add|enter|type|please)\b/gi, '')
    .replace(/[^\w\s\u0B80-\u0BFF-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';

  // Capitalize nicely
  return cleaned
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Parses input when the user speaks specifically for the current active field
 */
export function parseSingleFieldVoiceInput(
  rawText: string,
  currentField: VoiceBillingField
): { value: string; nextField: VoiceBillingField | 'nextRow' } | null {
  if (!rawText || !rawText.trim()) return null;

  // 1. If currently on itemName:
  if (currentField === 'itemName') {
    const cleaned = cleanVoiceMedicineName(rawText);
    if (cleaned.length >= 2) {
      return { value: cleaned, nextField: 'quantity' };
    }
    return null;
  }

  // 2. If currently on quantity:
  if (currentField === 'quantity') {
    const num = parseVoicePriceOrNumber(rawText);
    if (num) {
      const intVal = Math.max(1, parseInt(num, 10) || 1);
      return { value: String(intVal), nextField: 'mrp' };
    }
    if (/(?:attai|அட்டை|strip|box)/i.test(rawText)) {
      return { value: '1', nextField: 'mrp' };
    }
    return null;
  }

  // 3. If currently on mrp:
  if (currentField === 'mrp') {
    const price = parseVoicePriceOrNumber(rawText);
    if (price && Number(price) > 0) {
      return { value: price, nextField: 'discount' };
    }
    return null;
  }

  // 4. If currently on discount:
  if (currentField === 'discount') {
    const disc = parseVoicePriceOrNumber(rawText);
    if (disc !== null) {
      const discNum = Math.min(100, Math.max(0, Number(disc) || 0));
      return { value: String(discNum), nextField: 'nextRow' };
    }
    // If user says "no discount" / "இல்லை" / "zero" / "nil"
    if (/(?:no|zero|இல்லை|nil|none|free)/i.test(rawText)) {
      return { value: '0', nextField: 'nextRow' };
    }
    return null;
  }

  return null;
}

/**
 * Parses all-in-one full spoken sentence into all 4 item fields:
 * e.g. "Dolo 650 1 strip MRP 33 point 50 discount 15%"
 */
export function parseAllInOneVoiceSentence(rawText: string): {
  itemName: string;
  quantity: string;
  mrp: string;
  discount: string;
} | null {
  if (!rawText || !rawText.trim()) return null;
  const normalized = normalizeVoiceText(rawText);

  let discount = '0';
  let mrp = '';
  let quantity = '1';
  let itemName = '';

  let working = normalized;

  // 1. Extract discount if present, e.g. "discount 15%" or "15% discount" or "தள்ளுபடி 10%"
  const discMatch =
    working.match(/(?:discount|தள்ளுபடி|disc|off)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*%?/i) ||
    working.match(/(\d+(?:\.\d+)?)\s*%\s*(?:discount|தள்ளுபடி|off)?/i);
  if (discMatch) {
    discount = discMatch[1];
    working = working.replace(discMatch[0], ' ');
  }

  // 2. Extract MRP if present, e.g. "mrp 33.50" or "price 45" or "விலை 50"
  const mrpMatch = working.match(/(?:mrp|price|விலை|rate|cost)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  if (mrpMatch) {
    mrp = mrpMatch[1];
    working = working.replace(mrpMatch[0], ' ');
  }

  // 3. Extract Quantity, e.g. "2 strip", "1 attai", "3 box", "qty 2"
  const qtyMatch =
    working.match(/(?:qty|quantity|அளவு|எண்ணிக்கை)\s*[:=]?\s*(\d+)/i) ||
    working.match(/(\d+)\s*(?:strip|strips|attai|அட்டை|box|boxes|பாக்கெட்|packet|nos?|piece|pieces)/i);
  if (qtyMatch) {
    quantity = qtyMatch[1];
    working = working.replace(qtyMatch[0], ' ');
  }

  // 4. If MRP wasn't matched with keyword but there's a standalone price-like number left
  if (!mrp) {
    const numbersLeft = working.match(/(\d+(?:\.\d+)?)/g);
    if (numbersLeft && numbersLeft.length > 0) {
      // If there's a decimal number or large number, take as MRP
      const possibleMrp = numbersLeft.find((n) => n.includes('.')) || numbersLeft[numbersLeft.length - 1];
      if (possibleMrp) {
        mrp = possibleMrp;
        working = working.replace(possibleMrp, ' ');
      }
    }
  }

  // 5. Whatever remains is the Item Name
  itemName = working
    .replace(/\b(?:strip|strips|attai|அட்டை|box|boxes|பாக்கெட்|packet|mrp|discount|தள்ளுபடி|qty|quantity)\b/gi, '')
    .replace(/[^\w\s\u0B80-\u0BFF-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Capitalize words nicely
  itemName = itemName
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  // Require at least an item name and an MRP
  if (!itemName || !mrp) return null;

  return {
    itemName,
    quantity: String(Math.max(1, parseInt(quantity, 10) || 1)),
    mrp,
    discount: String(Math.min(100, Math.max(0, Number(discount) || 0))),
  };
}

/**
 * Checks if the spoken text is a command to conclude medicine entry ("Complete", "Done", "முடிந்தது")
 */
export function isCompleteCommand(rawText: string): boolean {
  if (!rawText) return false;
  const str = rawText.toLowerCase().trim();

  // English keywords
  if (
    /\b(?:complete|completed|finish|finished|done|over|all done|bill complete|end|stop adding|enough)\b/i.test(
      str
    )
  ) {
    return true;
  }

  // Tamil keywords
  if (
    /(?:முடிந்தது|முடிஞ்சிது|முடிஞ்சுது|முடிச்சிட்டேன்|போதும்|பில் முடிந்தது|முற்றும்|முடித்துவிடு)/i.test(
      str
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Checks if the spoken text indicates affirmative confirmation ("Yes", "Process", "ஆம்")
 */
export function isProcessYes(rawText: string): boolean {
  if (!rawText) return false;
  const str = rawText.toLowerCase().trim();

  // English affirmative keywords
  if (
    /\b(?:yes|yeah|yup|sure|ok|okay|correct|proceed|process|save|submit|confirm|yes process|do it)\b/i.test(
      str
    )
  ) {
    return true;
  }

  // Tamil affirmative keywords
  if (
    /(?:ஆம்|ஆமா|ஆமாம்|சரி|ப்ராசஸ்|சேமி|போடு|பில் போடு|பில் சேமி|அனுப்பு|சரிதான்|செயலாக்கு)/i.test(
      str
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Checks if the spoken text indicates negative / hold response ("No", "Wait", "இல்லை")
 */
export function isProcessNo(rawText: string): boolean {
  if (!rawText) return false;
  const str = rawText.toLowerCase().trim();

  // English negative keywords
  if (
    /\b(?:no|nope|wait|hold|stop|cancel|don't|dont|not now|later|manual|pause|wait wait)\b/i.test(
      str
    )
  ) {
    return true;
  }

  // Tamil negative keywords
  if (
    /(?:இல்லை|இல்ல|வேண்டாம்|வேணாம்|நில்லு|பொறு|காத்திரு|வெயிட்|நிறுத்து|அப்புறம்)/i.test(
      str
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Extracts a valid 10-digit Indian phone number from spoken voice text
 * Handles spoken digits, words in Tamil/English, and standard prefixes (+91, 91, 0)
 */
export function extract10DigitPhoneNumber(rawText: string): string | null {
  if (!rawText) return null;
  const normalized = normalizeVoiceText(rawText);

  // Extract all digit characters
  const digitsOnly = normalized.replace(/\D/g, '');

  if (!digitsOnly) return null;

  // Handle +91 or 91 country code (12 digits)
  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    const candidate = digitsOnly.slice(2);
    if (/^[6-9]\d{9}$/.test(candidate)) return candidate;
  }

  // Handle leading 0 (11 digits)
  if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
    const candidate = digitsOnly.slice(1);
    if (/^[6-9]\d{9}$/.test(candidate)) return candidate;
  }

  // Handle direct 10 digits
  if (digitsOnly.length === 10) {
    if (/^[6-9]\d{9}$/.test(digitsOnly)) return digitsOnly;
  }

  // Check if any substring of 10 digits matches valid Indian mobile pattern
  const subMatch = digitsOnly.match(/[6-9]\d{9}/);
  if (subMatch) {
    return subMatch[0];
  }

  return null;
}

export interface VoiceCustomerMatch {
  id: string;
  name: string;
  whatsapp_number: string;
}

/**
 * Finds a customer from the saved master list based on voice input name or phone
 * Uses phonetic normalization (e.g. "money building" matches "Mani Building")
 */
export function findMatchingCustomer<T extends { id: string; name: string; whatsapp_number: string }>(
  spokenQuery: string,
  customers: T[]
): T | null {
  if (!spokenQuery || !spokenQuery.trim() || !customers.length) return null;
  const q = spokenQuery.toLowerCase().trim();

  // 1. Try matching phone number if digits are present
  const extractedPhone = extract10DigitPhoneNumber(spokenQuery);
  if (extractedPhone) {
    const phoneMatch = customers.find(
      (c) => c.whatsapp_number.replace(/\D/g, '').endsWith(extractedPhone)
    );
    if (phoneMatch) return phoneMatch;
  }

  // 2. Exact name match (case-insensitive)
  const exactMatch = customers.find(
    (c) => c.name.toLowerCase().trim() === q
  );
  if (exactMatch) return exactMatch;

  // 3. Phonetic key comparison (e.g. "money building" vs "Mani Building")
  const queryKey = normalizeCustomerComparisonKey(spokenQuery);
  if (queryKey) {
    const phoneticExact = customers.find(
      (c) => normalizeCustomerComparisonKey(c.name) === queryKey
    );
    if (phoneticExact) return phoneticExact;

    const phoneticPartial = customers.find((c) => {
      const cKey = normalizeCustomerComparisonKey(c.name);
      return cKey && (cKey.includes(queryKey) || queryKey.includes(cKey));
    });
    if (phoneticPartial) return phoneticPartial;
  }

  // 4. Name contains query or query contains name
  const partialMatch = customers.find((c) => {
    const cName = c.name.toLowerCase().trim();
    return cName.includes(q) || q.includes(cName);
  });
  if (partialMatch) return partialMatch;

  return null;
}

