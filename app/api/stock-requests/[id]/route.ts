import { NextRequest, NextResponse } from 'next/server';
import { getStockRequestById, updateStockRequest, deleteStockRequest } from '@/lib/stock-storage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const item = await getStockRequestById(params.id);
    if (!item) {
      return NextResponse.json({ error: 'Stock request not found' }, { status: 404 });
    }
    return NextResponse.json({ stock_request: item });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to retrieve stock request';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const updated = await updateStockRequest(params.id, body);
    if (!updated) {
      return NextResponse.json({ error: 'Stock request not found or update failed' }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      message: 'Stock request updated successfully',
      stock_request: updated,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update stock request';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const success = await deleteStockRequest(params.id);
    if (!success) {
      return NextResponse.json({ error: 'Stock request not found' }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      message: 'Stock request deleted successfully',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete stock request';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
