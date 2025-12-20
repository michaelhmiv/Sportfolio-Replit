import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getSupabase } from "./supabase";

function debugLog(stage: string, message: string, data?: any) {
  const elapsed = performance.now().toFixed(0);
  console.log(`[QUERY ${elapsed}ms] ${stage}: ${message}`, data || '');
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

async function getAuthHeaders(): Promise<HeadersInit> {
  try {
    const supabase = await getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return { 'Authorization': `Bearer ${session.access_token}` };
    }
  } catch (error) {
    debugLog('AUTH_HEADERS', 'Failed to get auth headers', { error: (error as Error).message });
  }
  return {};
}

export async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const authHeaders = await getAuthHeaders();
  return fetch(url, {
    ...options,
    headers: {
      ...authHeaders,
      ...options.headers,
    },
    credentials: 'include',
  });
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(url, {
    method,
    headers: {
      ...authHeaders,
      ...(data ? { "Content-Type": "application/json" } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/") as string;
    const startTime = performance.now();
    debugLog('FETCH', `Starting request: ${url}`);
    
    try {
      const authHeaders = await getAuthHeaders();
      
      if (unauthorizedBehavior === "returnNull") {
        const maxRetries = 3;
        const retryDelays = [500, 1000, 1500];
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => {
            debugLog('FETCH', `TIMEOUT on attempt ${attempt + 1}: ${url}`);
            controller.abort();
          }, 15000);
          
          try {
            const res = await fetch(url, { 
              credentials: "include",
              headers: authHeaders,
              signal: controller.signal,
            });
            clearTimeout(timeoutId);
            
            const elapsed = (performance.now() - startTime).toFixed(0);
            
            if (res.status === 401) {
              debugLog('FETCH', `Got 401 on attempt ${attempt + 1}, ${attempt < maxRetries ? 'retrying...' : 'giving up'}`);
              if (attempt < maxRetries) {
                await sleep(retryDelays[attempt]);
                continue;
              }
              return null;
            }
            
            debugLog('FETCH', `Completed in ${elapsed}ms: ${url}`, { status: res.status });
            await throwIfResNotOk(res);
            return await res.json();
          } catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof Error && error.name === 'AbortError') {
              debugLog('FETCH', `Request aborted (timeout) on attempt ${attempt + 1}: ${url}`);
              if (attempt < maxRetries) {
                await sleep(retryDelays[attempt]);
                continue;
              }
            }
            throw error;
          }
        }
        return null;
      }
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        debugLog('FETCH', `TIMEOUT: ${url}`);
        controller.abort();
      }, 15000);
      
      const res = await fetch(url, { 
        credentials: "include",
        headers: authHeaders,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      const elapsed = (performance.now() - startTime).toFixed(0);
      debugLog('FETCH', `Completed in ${elapsed}ms: ${url}`, { status: res.status });
      
      await throwIfResNotOk(res);
      return await res.json();
    } catch (error) {
      const elapsed = (performance.now() - startTime).toFixed(0);
      debugLog('FETCH', `FAILED after ${elapsed}ms: ${url}`, { 
        error: error instanceof Error ? error.message : 'Unknown error',
        isAbort: error instanceof Error && error.name === 'AbortError'
      });
      throw error;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 10000,
      retry: (failureCount, error) => {
        if (error instanceof Error && error.name === 'AbortError') {
          return failureCount < 2;
        }
        return false;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
    },
    mutations: {
      retry: false,
    },
  },
});
