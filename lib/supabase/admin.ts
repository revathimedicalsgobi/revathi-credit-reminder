import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://ixfjgmzdrwvxrczplfme.supabase.co';
const DEFAULT_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4ZmpnbXpkcnd2eHJjenBsZm1lIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODUxNDI0NywiZXhwIjoyMTA0MDkwMjQ3fQ.QJC-C7OmezSwvRU4VdneVzbM12FSS7KLwF_55VbmAcM';
const DEFAULT_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4ZmpnbXpkcnd2eHJjenBsZm1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1MTQyNDcsImV4cCI6MjEwNDA5MDI0N30.55SUhDaiWsAOzrQ-EpfG6BjugU5bVxht80BGFFa7rzM';

export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || DEFAULT_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
