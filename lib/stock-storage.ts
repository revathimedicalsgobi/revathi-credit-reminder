import fs from 'fs';
import path from 'path';
import { createAdminClient } from '@/lib/supabase/admin';
import { StockRequest, StockRequestStatus, CreateStockRequestInput, UpdateStockRequestInput } from '@/lib/types';
import { formatPhoneForGateway } from '@/lib/whatsapp-gateway';

const FALLBACK_FILE_PATH = path.join(process.cwd(), '.stock_requests_data.json');

function getFallbackStore(): StockRequest[] {
  try {
    if (fs.existsSync(FALLBACK_FILE_PATH)) {
      const content = fs.readFileSync(FALLBACK_FILE_PATH, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn('Could not read fallback stock requests file:', err);
  }
  return [];
}

function saveFallbackStore(data: StockRequest[]): void {
  try {
    fs.writeFileSync(FALLBACK_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Could not write fallback stock requests file:', err);
  }
}

/**
 * Fetch stock requests with search and status filtering
 */
export async function getStockRequests({
  status,
  search,
}: {
  status?: string;
  search?: string;
}): Promise<{
  stock_requests: StockRequest[];
  stats: {
    total: number;
    requested: number;
    arrived: number;
    notified: number;
    fulfilled: number;
  };
}> {
  const supabase = createAdminClient();

  try {
    let query = supabase
      .from('stock_requests')
      .select('*, customer:customers(*)')
      .order('created_at', { ascending: false });

    if (status && status !== 'ALL') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (!error && data) {
      let items = data as StockRequest[];

      if (search && search.trim()) {
        const s = search.toLowerCase().trim();
        items = items.filter(
          (item) =>
            item.customer_name.toLowerCase().includes(s) ||
            item.whatsapp_number.includes(s) ||
            item.product_name.toLowerCase().includes(s) ||
            (item.notes && item.notes.toLowerCase().includes(s))
        );
      }

      // Compute stats
      const { data: allData } = await supabase.from('stock_requests').select('status');
      const allList = (allData || []) as Array<{ status: StockRequestStatus }>;
      const stats = {
        total: allList.length,
        requested: allList.filter((x) => x.status === 'REQUESTED').length,
        arrived: allList.filter((x) => x.status === 'ARRIVED').length,
        notified: allList.filter((x) => x.status === 'NOTIFIED').length,
        fulfilled: allList.filter((x) => x.status === 'FULFILLED').length,
      };

      return { stock_requests: items, stats };
    }
  } catch (err) {
    console.warn('Supabase stock_requests table not available, using file fallback:', err);
  }

  // Fallback store
  let items = getFallbackStore();
  const allCount = items.length;
  const stats = {
    total: allCount,
    requested: items.filter((x) => x.status === 'REQUESTED').length,
    arrived: items.filter((x) => x.status === 'ARRIVED').length,
    notified: items.filter((x) => x.status === 'NOTIFIED').length,
    fulfilled: items.filter((x) => x.status === 'FULFILLED').length,
  };

  if (status && status !== 'ALL') {
    items = items.filter((x) => x.status === status);
  }

  if (search && search.trim()) {
    const s = search.toLowerCase().trim();
    items = items.filter(
      (item) =>
        item.customer_name.toLowerCase().includes(s) ||
        item.whatsapp_number.includes(s) ||
        item.product_name.toLowerCase().includes(s) ||
        (item.notes && item.notes.toLowerCase().includes(s))
    );
  }

  // Sort newest first
  items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return { stock_requests: items, stats };
}

/**
 * Get single stock request by ID
 */
export async function getStockRequestById(id: string): Promise<StockRequest | null> {
  const supabase = createAdminClient();

  try {
    const { data, error } = await supabase
      .from('stock_requests')
      .select('*, customer:customers(*)')
      .eq('id', id)
      .maybeSingle();

    if (!error && data) {
      return data as StockRequest;
    }
  } catch {
    // Fallback
  }

  const store = getFallbackStore();
  return store.find((x) => x.id === id) || null;
}

/**
 * Create a new stock request
 */
export async function createStockRequest(input: CreateStockRequestInput): Promise<StockRequest> {
  const supabase = createAdminClient();
  const phone = formatPhoneForGateway(input.whatsapp_number);
  const now = new Date().toISOString();

  // Try to find or create customer in customers table
  let customerId: string | null = null;
  try {
    const { data: existingCust } = await supabase
      .from('customers')
      .select('id')
      .eq('whatsapp_number', phone)
      .limit(1)
      .maybeSingle();

    if (existingCust?.id) {
      customerId = existingCust.id;
    } else {
      const { data: newCust } = await supabase
        .from('customers')
        .insert({
          name: input.customer_name.trim(),
          whatsapp_number: phone,
        })
        .select('id')
        .single();
      if (newCust?.id) {
        customerId = newCust.id;
      }
    }
  } catch (custErr) {
    console.warn('Customer upsert for stock request notice:', custErr);
  }

  const payload = {
    customer_id: customerId,
    customer_name: input.customer_name.trim(),
    whatsapp_number: phone,
    product_name: input.product_name.trim(),
    quantity: input.quantity?.trim() || '1',
    notes: input.notes?.trim() || null,
    image_url: input.image_url?.trim() || null,
    status: 'REQUESTED' as StockRequestStatus,
    requested_date: now,
    whatsapp_status: 'PENDING' as const,
    created_at: now,
    updated_at: now,
  };

  try {
    const { data, error } = await supabase
      .from('stock_requests')
      .insert(payload)
      .select('*, customer:customers(*)')
      .single();

    if (!error && data) {
      return data as StockRequest;
    }
  } catch (err) {
    console.warn('Supabase stock_requests insert fallback:', err);
  }

  // Fallback
  const newItem: StockRequest = {
    id: `sr_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    ...payload,
  };

  const store = getFallbackStore();
  store.unshift(newItem);
  saveFallbackStore(store);

  return newItem;
}

/**
 * Update stock request
 */
export async function updateStockRequest(
  id: string,
  input: UpdateStockRequestInput
): Promise<StockRequest | null> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const updateData: Record<string, any> = {
    updated_at: now,
  };

  if (input.customer_name !== undefined) updateData.customer_name = input.customer_name.trim();
  if (input.whatsapp_number !== undefined) updateData.whatsapp_number = formatPhoneForGateway(input.whatsapp_number);
  if (input.product_name !== undefined) updateData.product_name = input.product_name.trim();
  if (input.quantity !== undefined) updateData.quantity = input.quantity.trim();
  if (input.notes !== undefined) updateData.notes = input.notes ? input.notes.trim() : null;
  if (input.image_url !== undefined) updateData.image_url = input.image_url ? input.image_url.trim() : null;
  if (input.status !== undefined) {
    updateData.status = input.status;
    if (input.status === 'ARRIVED') updateData.arrived_at = now;
    if (input.status === 'NOTIFIED') updateData.notified_at = now;
  }

  try {
    const { data, error } = await supabase
      .from('stock_requests')
      .update(updateData)
      .eq('id', id)
      .select('*, customer:customers(*)')
      .single();

    if (!error && data) {
      return data as StockRequest;
    }
  } catch (err) {
    console.warn('Supabase stock_requests update fallback:', err);
  }

  // Fallback
  const store = getFallbackStore();
  const idx = store.findIndex((x) => x.id === id);
  if (idx === -1) return null;

  store[idx] = {
    ...store[idx],
    ...updateData,
  };
  saveFallbackStore(store);
  return store[idx];
}

/**
 * Delete stock request
 */
export async function deleteStockRequest(id: string): Promise<boolean> {
  const supabase = createAdminClient();

  try {
    const { error } = await supabase.from('stock_requests').delete().eq('id', id);
    if (!error) return true;
  } catch {
    // Fallback
  }

  const store = getFallbackStore();
  const filtered = store.filter((x) => x.id !== id);
  if (filtered.length !== store.length) {
    saveFallbackStore(filtered);
    return true;
  }
  return false;
}
