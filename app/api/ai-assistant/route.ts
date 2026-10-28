import { NextRequest, NextResponse } from 'next/server';
import {
  geminiToolDeclarations,
  executeCreateBill,
  executeGetCustomerPending,
  executeRecordPayment,
  executeGetBusinessStats,
  executeSendReminder,
  executeFallbackRuleParser,
  ActionResult,
} from '@/lib/ai-agent/tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, history = [], customApiKey } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const geminiKey =
      customApiKey ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_AI_API_KEY;

    // If no Gemini key is available, use our high-accuracy fallback parser
    if (!geminiKey) {
      const fallbackResult = await executeFallbackRuleParser(message);
      return NextResponse.json({
        success: true,
        engine: 'smart-fallback',
        reply: fallbackResult.reply,
        actionResult: fallbackResult.actionResult,
      });
    }

    // Call Gemini 1.5 Flash with Function Calling Tools
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;

    // Format previous history for Gemini
    const contents = [];
    if (Array.isArray(history) && history.length > 0) {
      for (const msg of history.slice(-6)) {
        if (msg.role === 'user' || msg.role === 'model') {
          contents.push({
            role: msg.role,
            parts: [{ text: msg.text || msg.content || '' }],
          });
        }
      }
    }
    contents.push({
      role: 'user',
      parts: [{ text: message }],
    });

    const systemInstruction = {
      parts: [
        {
          text: `You are the smart AI Business Assistant for Revathi Medicals & Distributors / Pharmacy Credit Manager.
The pharmacy owner (Boopathy) interacts with you via voice and text to:
1. Create new purchase bills (create_bill)
2. Check customer pending credit / balances (get_customer_balance)
3. Record customer payments received (record_payment)
4. View business summary / today's sales and collections (get_business_stats)
5. Send WhatsApp payment reminders (send_reminder)

Language Guidelines:
- The user will speak or type in Tamil, Tanglish (Tamil in English letters), or English.
- Always respond politely in Tamil (using Tamil script and numbers with ₹), or clean Tanglish if appropriate.
- Always use the tools / function declarations when the user intends to execute any business action.
- If medicine name or customer name is mentioned with price, invoke create_bill.
- Keep responses concise, clear, and actionable.`,
        },
      ],
    };

    const requestPayload = {
      contents,
      tools: [
        {
          function_declarations: geminiToolDeclarations,
        },
      ],
      system_instruction: systemInstruction,
      generationConfig: {
        temperature: 0.2,
      },
    };

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn('Gemini API call failed with status:', response.status, errText);
      // Seamlessly fall back
      const fallbackResult = await executeFallbackRuleParser(message);
      return NextResponse.json({
        success: true,
        engine: 'fallback-after-error',
        reply: fallbackResult.reply,
        actionResult: fallbackResult.actionResult,
        warning: `Gemini API error: ${response.status}. Used local intelligence engine.`,
      });
    }

    const resData = await response.json();
    const candidate = resData?.candidates?.[0];
    const candidateContent = candidate?.content;
    const parts = candidateContent?.parts || [];

    // Look for tool function call
    let functionCallPart = null;
    let textResponse = '';

    for (const p of parts) {
      if (p.functionCall) {
        functionCallPart = p.functionCall;
        break;
      }
      if (p.text) {
        textResponse += p.text;
      }
    }

    // If Gemini requested a tool execution
    if (functionCallPart) {
      const { name, args } = functionCallPart;
      let actionResult: ActionResult | null = null;

      try {
        if (name === 'create_bill') {
          actionResult = await executeCreateBill(args as any);
        } else if (name === 'get_customer_balance') {
          actionResult = await executeGetCustomerPending((args as any)?.query);
        } else if (name === 'record_payment') {
          const a = args as any;
          actionResult = await executeRecordPayment(a.customer_query, a.amount, a.payment_mode, a.notes);
        } else if (name === 'get_business_stats') {
          actionResult = await executeGetBusinessStats();
        } else if (name === 'send_reminder') {
          actionResult = await executeSendReminder((args as any)?.customer_query);
        }
      } catch (toolExecErr: any) {
        console.error('Tool execution error:', toolExecErr);
        return NextResponse.json({
          success: true,
          engine: 'gemini-tool',
          reply: `செயல்பாட்டில் பிழை ஏற்பட்டது: ${toolExecErr?.message || 'Unknown error'}`,
          actionResult: null,
        });
      }

      // Now pass tool result back to Gemini for rich Tamil response, or format nicely
      if (actionResult) {
        try {
          const followUpPayload = {
            contents: [
              ...contents,
              {
                role: 'model',
                parts: [{ functionCall: functionCallPart }],
              },
              {
                role: 'function',
                parts: [
                  {
                    functionResponse: {
                      name,
                      response: {
                        result: actionResult,
                      },
                    },
                  },
                ],
              },
            ],
            system_instruction: systemInstruction,
          };

          const followUpRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(followUpPayload),
          });

          if (followUpRes.ok) {
            const followUpData = await followUpRes.json();
            const followUpText = followUpData?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (followUpText) {
              return NextResponse.json({
                success: true,
                engine: 'gemini-1.5-flash',
                reply: followUpText,
                actionResult,
              });
            }
          }
        } catch {
          // If follow up fails, actionResult.message will be used
        }

        return NextResponse.json({
          success: true,
          engine: 'gemini-1.5-flash',
          reply: actionResult.message,
          actionResult,
        });
      }
    }

    // Direct text response
    return NextResponse.json({
      success: true,
      engine: 'gemini-1.5-flash',
      reply: textResponse || 'உங்களுக்கு எவ்வாறு உதவ முடியும்?',
      actionResult: null,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown AI Assistant error';
    console.error('AI assistant route error:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
