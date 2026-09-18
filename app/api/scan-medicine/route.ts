import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageBase64, customApiKey } = body;

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
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;

        const prompt = `You are an expert Indian pharmacist and medical packaging reader.
Examine this medicine strip, tablet blister pack, or medicine box photo.
Extract the following information with 100% precision:
1. Brand Name: The primary commercial brand/trade name (e.g. "DOLO 650", "PAN-D", "AUGMENTIN 625 DUO", "CALPOL 500", "TELMA 40", "MONTEK-LC", "CLAVAM 625", "ZERODOL-SP"). Exclude statutory warnings, manufacturers, and license info.
2. MRP: The Maximum Retail Price numeric amount (e.g. "45.00" or "120.50"). Exclude batch numbers, expiry years, and quantity counts.
3. Salt Composition: The generic formulation if visible (e.g. "Paracetamol Tablets IP 650mg").
4. Candidate Words: List of prominent brand and price words visible on the pack.

Return ONLY a valid JSON object matching this exact schema:
{
  "brandName": "string",
  "mrp": "string (digits and decimal only, e.g. 45.00)",
  "saltComposition": "string",
  "candidates": ["string", "string"]
}`;

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
            try {
              const parsed = JSON.parse(candidateText);
              return NextResponse.json({
                success: true,
                engine: 'gemini-ai',
                brandName: parsed.brandName || '',
                mrp: parsed.mrp ? parsed.mrp.replace(/[^0-9.]/g, '') : '',
                saltComposition: parsed.saltComposition || '',
                candidates: Array.isArray(parsed.candidates) ? parsed.candidates : [],
              });
            } catch {
              // JSON parse fallback
            }
          }
        }
      } catch (geminiErr) {
        console.warn('Gemini API call failed, falling back to client OCR:', geminiErr);
      }
    }

    return NextResponse.json({
      success: false,
      engine: 'fallback',
      message: 'AI Vision key not provided. Used local high-accuracy scanner.',
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal scanner error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
