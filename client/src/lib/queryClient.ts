import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getSupabase } from "./supabase";

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
    console.error('[AUTH] Failed to get auth headers:', error);
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
    const authHeaders = await getAuthHeaders();
    
    // For returnNull behavior, retry a few times with delays to let session sync up
    if (unauthorizedBehavior === "returnNull") {
      const maxRetries = 3;
      const retryDelays = [500, 1000, 1500];
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const res = await fetch(url, { 
          credentials: "include",
          headers: authHeaders,
        });
        
        if (res.status === 401) {
          if (attempt < maxRetries) {
            await sleep(retryDelays[attempt]);
            continue;
          }
          return null;
        }
        
        await throwIfResNotOk(res);
        return await res.json();
      }
      return null;
    }
    
    // Standard behavior - no retry
    const res = await fetch(url, { 
      credentials: "include",
      headers: authHeaders,
    });
    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 10000, // 10 seconds default - balance between freshness and performance
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
