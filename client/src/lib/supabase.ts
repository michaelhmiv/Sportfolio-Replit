import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;
let initializationPromise: Promise<SupabaseClient> | null = null;

function debugLog(stage: string, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const elapsed = performance.now().toFixed(0);
  console.log(`[SUPABASE ${elapsed}ms] ${stage}: ${message}`, data || '');
}

async function initializeSupabase(): Promise<SupabaseClient> {
  debugLog('INIT', 'Starting Supabase initialization');
  
  if (supabaseInstance) {
    debugLog('INIT', 'Returning cached Supabase instance');
    return supabaseInstance;
  }

  try {
    debugLog('CONFIG', 'Fetching /api/auth/config...');
    const startTime = performance.now();
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      debugLog('CONFIG', 'TIMEOUT - Aborting after 5 seconds');
      controller.abort();
    }, 5000);
    
    const response = await fetch('/api/auth/config', {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    
    const elapsed = (performance.now() - startTime).toFixed(0);
    debugLog('CONFIG', `Response received in ${elapsed}ms, status: ${response.status}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch Supabase config: ${response.status}`);
    }
    
    const config = await response.json();
    debugLog('CONFIG', 'Config parsed successfully', { url: config.url?.substring(0, 30) + '...' });
    
    debugLog('CLIENT', 'Creating Supabase client...');
    supabaseInstance = createClient(config.url, config.anonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
    debugLog('CLIENT', 'Supabase client created successfully');
    
    return supabaseInstance;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      debugLog('ERROR', 'Config fetch TIMED OUT after 5 seconds - server may be down');
    } else {
      debugLog('ERROR', 'Failed to initialize Supabase', { error: (error as Error).message });
    }
    throw error;
  }
}

export function getSupabase(): Promise<SupabaseClient> {
  debugLog('GET', 'getSupabase() called', { hasPromise: !!initializationPromise });
  
  if (!initializationPromise) {
    debugLog('GET', 'Creating new initialization promise');
    initializationPromise = initializeSupabase().catch((error) => {
      debugLog('GET', 'Initialization failed, clearing promise for retry');
      initializationPromise = null;
      throw error;
    });
  }
  return initializationPromise;
}

export function resetSupabase() {
  debugLog('RESET', 'Resetting Supabase instance for retry');
  supabaseInstance = null;
  initializationPromise = null;
}

export { supabaseInstance as supabase };
