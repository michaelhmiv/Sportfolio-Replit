import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;
let initializationPromise: Promise<SupabaseClient> | null = null;

async function initializeSupabase(): Promise<SupabaseClient> {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  try {
    // Add 2-second timeout to prevent infinite loading in production
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    
    const response = await fetch('/api/auth/config', {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    
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
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('Supabase config fetch timed out after 2 seconds');
    } else {
      console.error('Failed to initialize Supabase:', error);
    }
    throw error;
  }
}

export function getSupabase(): Promise<SupabaseClient> {
  if (!initializationPromise) {
    initializationPromise = initializeSupabase().catch((error) => {
      // Clear the promise so retry is possible on next attempt (e.g., when user clicks login)
      initializationPromise = null;
      throw error;
    });
  }
  return initializationPromise;
}

export { supabaseInstance as supabase };
