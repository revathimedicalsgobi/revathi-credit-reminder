import { createAdminClient } from '@/lib/supabase/admin';
import { StockRequest, StockRequestStatus, CreateStockRequestInput, UpdateStockRequestInput } from '@/lib/types';
import { formatPhoneForGateway } from '@/lib/whatsapp-gateway';

// In-memory memory cache for fast sub-millisecond responses
let memoryCache: StockRequest[] | null = null;
let lastCacheFetchTime = 0;
const CACHE_TTL_MS = 2000; // 2 seconds TTL

/**
 * Fetch from Supabase cloud settings fallback store
 */
async function getCloudStore(supabase: ReturnType<typeof createAdminClient>): Promise<StockRequest[]> {
  const now = Date.now();
  if (memoryCache && now - lastCacheFetchTime < CACHE_TTL_MS) {
    return memoryCache;
  }

  try {
    const { data } = await supabase
      .from('settings')
      .select('display_name')
      .eq('pharmacy_name', 'STOCK_REQUESTS_STORE')
      .maybeSingle();

    if (data?.display_name) {
      const parsed = JSON.parse(data.display_name);
      if (Array.isArray(parsed)) {
        memoryCache = parsed;
        lastCacheFetchTime = now;
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Error reading cloud stock store:', err);
  }

  return memoryCache || [];
}

/**
 * Save to Supabase cloud settings fallback store
 */
async function saveCloudStore(supabase: ReturnType<typeof createAdminClient>, data: StockRequest[]): Promise<void> {
  memoryCache = data;
  lastCacheFetchTime = Date.now();

  try {
    const jsonStr = JSON.stringify(data);
    const { data: existing } = await supabase
      .from('settings')
      .select('id')
      .eq('pharmacy_name', 'STOCK_REQUESTS_STORE')
      .maybeSingle();

    if (existing?.id) {
      await supabase
        .from('settings')
        .update({
          display_name: jsonStr,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await supabase.from('settings').insert({
        pharmacy_name: 'STOCK_REQUESTS_STORE',
        display_name: jsonStr,
        reminders_enabled: false,
        max_reminder_days: 1,
      });
    }
  } catch (err) {
    console.error('Error writing to cloud stock store:', err);
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

  // Try direct table first
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
            item.customer_name?.toLowerCase().includes(s) ||
            item.whatsapp_number?.includes(s) ||
            item.product_name?.toLowerCase().includes(s) ||
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
  } catch {
    // Fall through to cloud store
  }

  // Cloud Store Fallback
  let items = await getCloudStore(supabase);
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
        item.customer_name?.toLowerCase().includes(s) ||
        item.whatsapp_number?.includes(s) ||
        item.product_name?.toLowerCase().includes(s) ||
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

  const store = await getCloudStore(supabase);
  return store.find((x) => x.id === id) || null;
}

/**
 * Create a new stock request
 */
export async function createStockRequest(input: CreateStockRequestInput): Promise<StockRequest> {
  const supabase = createAdminClient();
  const phone = formatPhoneForGateway(input.whatsapp_number);
  const now = new Date().toISOString();

  // Try to find or link customer in customers table
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
        .maybeSingle();
      if (newCust?.id) {
        customerId = newCust.id;
      }
    }
  } catch (custErr) {
    console.warn('Customer lookup notice for stock request:', custErr);
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
    console.warn('Supabase stock_requests insert notice:', err);
  }

  // Save to Cloud Settings Store
  const newItem: StockRequest = {
    id: `sr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    ...payload,
  };

  const store = await getCloudStore(supabase);
  const updated = [newItem, ...store];
  await saveCloudStore(supabase, updated);

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
    console.warn('Supabase stock_requests update notice:', err);
  }

  // Update in Cloud Store
  const store = await getCloudStore(supabase);
  const idx = store.findIndex((x) => x.id === id);
  if (idx === -1) return null;

  store[idx] = {
    ...store[idx],
    ...updateData,
  };
  await saveCloudStore(supabase, store);
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

  const store = await getCloudStore(supabase);
  const filtered = store.filter((x) => x.id !== id);
  if (filtered.length !== store.length) {
    await saveCloudStore(supabase, filtered);
    return true;
  }
  return false;
}
