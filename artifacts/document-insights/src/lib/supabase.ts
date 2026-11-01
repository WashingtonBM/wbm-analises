import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// createClient throws on an empty URL, which would blank the whole app; the login screen reports missing configuration instead.
export const supabase = createClient(supabaseUrl || 'http://localhost', supabaseAnonKey || 'not-configured');
