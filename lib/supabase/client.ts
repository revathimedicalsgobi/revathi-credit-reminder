import { createBrowserClient } from '@supabase/ssr';

const DEFAULT_SUPABASE_URL = 'https://ixfjgmzdrwvxrczplfme.supabase.co';
const DEFAULT_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4ZmpnbXpkcnd2eHJjenBsZm1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1MTQyNDcsImV4cCI6MjEwNDA5MDI0N30.55SUhDaiWsAOzrQ-EpfG6BjugU5bVxht80BGFFa7rzM';

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
