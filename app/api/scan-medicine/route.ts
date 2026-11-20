import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageBase64, customApiKey, scanType = 'medicine' } = body;

    if (!imageBase64) {
      return NextResponse.json(
        { error: 'Missing imageBase64 in request body.' },
        { status: 400 }
      );
    }

    // Clean base64 prefix if present (e.g. data:image/jpeg;base64,...)
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
    const geminiKey = customApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

    if (geminiKey) {
      const prompt = scanType === 'invoice'
        ? `You are an expert Indian billing and invoice reader.
Examine this paper receipt, pharmacy cash memo, or medical invoice photo.
Extract the following information:
1. Bill / Invoice Number: The invoice or bill reference number (e.g., "BILL-1042", "INV-2026/04", "1245", "A-501").
2. Total Amount: The net payable amount in Indian Rupees (e.g., "380.00").
3. Customer Name: Name of the customer/patient if visible.
4. Date: Date of the bill if visible (YYYY-MM-DD format).
5. Candidate Words: Key alphanumeric numbers, bill numbers, and amounts visible.

Return ONLY a valid JSON object matching this exact schema:
{
  "billNumber": "string",
  "totalAmount": "string (numeric e.g. 380.00)",
  "customerName": "string",
  "date": "string",
  "candidates": ["string", "string"]
}`
        : `You are an expert Indian pharmacist and medical packaging reader.
Examine this medicine strip, tablet blister pack, ointment tube, syrup bottle, or medicine box photo.
Extract the following information with 100% precision:
1. Brand Name: The primary commercial brand/trade name (e.g. "DOLO 650", "PAN-D", "AUGMENTIN 625 DUO", "CALPOL 500", "TELMA 40", "MONTEK-LC", "CLAVAM 625", "ZERODOL-SP", "SHELCAL 500"). Exclude statutory warnings, manufacturers, and license info.
2. MRP: The Maximum Retail Price numeric amount (e.g. "45.00" or "120.50"). Exclude batch numbers, expiry years, and quantity counts.
3. Salt Composition: The generic formulation if visible (e.g. "Paracetamol Tablets IP 650mg").
4. Bill / Batch Number: Any batch number or bill number if present.
5. Candidate Words: List of prominent brand, dosage, and price words visible on the pack.

Return ONLY a valid JSON object matching this exact schema:
{
  "brandName": "string",
  "mrp": "string (digits and decimal only, e.g. 45.00)",
  "saltComposition": "string",
  "billNumber": "string",
  "candidates": ["string", "string"]
}`;

      const modelsToTry = [
        'gemini-1.5-flash',
        'gemini-2.0-flash',
        'gemini-2.5-flash',
      ];

      for (const model of modelsToTry) {
        try {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

          const response = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { text: prompt },
                    {
                      inline_data: {
                        mime_type: 'image/jpeg',
                        data: cleanBase64,
                      },
                    },
                  ],
                },
              ],
              generationConfig: {
                response_mime_type: 'application/json',
                temperature: 0.1,
              },
            }),
          });

          if (response.ok) {
            const resData = await response.json();
            const candidateText = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (candidateText) {
              const parsed = JSON.parse(candidateText);
              return NextResponse.json({
                success: true,
                engine: `gemini-${model}`,
                brandName: parsed.brandName || '',
                mrp: parsed.mrp ? parsed.mrp.replace(/[^0-9.]/g, '') : '',
                billNumber: parsed.billNumber || '',
                totalAmount: parsed.totalAmount ? parsed.totalAmount.replace(/[^0-9.]/g, '') : '',
                customerName: parsed.customerName || '',
                saltComposition: parsed.saltComposition || '',
                candidates: Array.isArray(parsed.candidates) ? parsed.candidates : [],
              });
            }
          }
        } catch {
          // try next model
        }
      }
    }

    return NextResponse.json({
      success: false,
      engine: 'fallback',
      message: 'AI Vision key not provided or unavailable. Using high-precision local OCR engine.',
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal scanner error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
