import { NextRequest, NextResponse } from 'next/server';
import { getStockRequests, createStockRequest } from '@/lib/stock-storage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('search') || undefined;

    const result = await getStockRequests({ status, search });
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch stock requests';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customer_name, whatsapp_number, product_name, quantity, notes, image_url } = body;

    if (!customer_name || !customer_name.trim()) {
      return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });
    }

    if (!whatsapp_number || !whatsapp_number.trim()) {
      return NextResponse.json({ error: 'WhatsApp number is required' }, { status: 400 });
    }

    if (!product_name || !product_name.trim()) {
      return NextResponse.json({ error: 'Product name is required' }, { status: 400 });
    }

    const newRequest = await createStockRequest({
      customer_name,
      whatsapp_number,
      product_name,
      quantity,
      notes,
      image_url,
    });

    return NextResponse.json({
      success: true,
      message: 'Stock request created successfully',
      stock_request: newRequest,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create stock request';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
