import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;
let initializationPromise: Promise<SupabaseClient> | null = null;

async function initializeSupabase(): Promise<SupabaseClient> {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  try {
    const response = await fetch('/api/auth/config');
    if (!response.ok) {
      throw new Error('Failed to fetch Supabase config');
    }
    const config = await response.json();
    
    supabaseInstance = createClient(config.url, config.anonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
    
    return supabaseInstance;
  } catch (error) {
    console.error('Failed to initialize Supabase:', error);
    throw error;
  }
}

export function getSupabase(): Promise<SupabaseClient> {
  if (!initializationPromise) {
    initializationPromise = initializeSupabase();
  }
  return initializationPromise;
}

export { supabaseInstance as supabase };
