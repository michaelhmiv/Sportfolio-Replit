import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback, useRef, createContext, useContext, ReactNode } from "react";
import type { User } from "@shared/schema";
import { getSupabase, resetSupabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import type { Session, SupabaseClient } from "@supabase/supabase-js";

function debugLog(stage: string, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const elapsed = performance.now().toFixed(0);
  console.log(`[AUTH ${elapsed}ms] ${stage}: ${message}`, data || '');
}

interface AuthUserResponse extends User {
  whopSync?: {
    credited: number;
    revoked: number;
    synced: number;
  };
}

interface AuthContextValue {
  session: Session | null;
  isInitialized: boolean;
  supabaseClient: SupabaseClient | null;
  initError: string | null;
  retryInit: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  isInitialized: false,
  supabaseClient: null,
  initError: null,
  retryInit: () => { },
});

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [supabaseClient, setSupabaseClient] = useState<SupabaseClient | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
  const initializingRef = useRef(false);
  const initAttemptRef = useRef(0);

  const initializeAuth = useCallback(async () => {
    const attempt = ++initAttemptRef.current;
    debugLog('PROVIDER', `Starting auth initialization (attempt ${attempt})`);

    try {
      debugLog('PROVIDER', 'Calling getSupabase()...');
      const startTime = performance.now();
      const client = await getSupabase();
      debugLog('PROVIDER', `getSupabase() completed in ${(performance.now() - startTime).toFixed(0)}ms`);

      setSupabaseClient(client);
      setInitError(null);

      debugLog('SESSION', 'Calling client.auth.getSession()...');
      const sessionStart = performance.now();
      const { data: { session: initialSession }, error: sessionError } = await client.auth.getSession();
      debugLog('SESSION', `getSession() completed in ${(performance.now() - sessionStart).toFixed(0)}ms`, {
        hasSession: !!initialSession,
        error: sessionError?.message
      });

      if (sessionError) {
        debugLog('SESSION', 'Session error:', sessionError.message);
      }

      setSession(initialSession);
      setIsInitialized(true);
      debugLog('PROVIDER', 'Auth initialized successfully', { hasSession: !!initialSession });

      debugLog('LISTENER', 'Setting up onAuthStateChange listener...');
      const { data: { subscription } } = client.auth.onAuthStateChange(
        async (event, newSession) => {
          debugLog('STATE_CHANGE', `Auth state changed: ${event}`, { hasSession: !!newSession });
          setSession(newSession);

          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
          } else if (event === 'SIGNED_OUT') {
            queryClient.setQueryData(['/api/auth/user'], null);
          }
        }
      );

      subscriptionRef.current = subscription;
      debugLog('LISTENER', 'Auth state listener registered');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debugLog('ERROR', `Auth initialization FAILED (attempt ${attempt})`, { error: errorMessage });
      setInitError(errorMessage);
      setIsInitialized(true);
    }
  }, [queryClient]);

  const retryInit = useCallback(() => {
    debugLog('RETRY', 'User triggered auth retry');
    // Clean up existing subscription before retry
    if (subscriptionRef.current) {
      debugLog('RETRY', 'Cleaning up existing auth listener');
      subscriptionRef.current.unsubscribe();
      subscriptionRef.current = null;
    }
    setInitError(null);
    setIsInitialized(false);
    setSupabaseClient(null);
    setSession(null);
    initializingRef.current = false;
    resetSupabase();
    initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    if (initializingRef.current) {
      debugLog('PROVIDER', 'Skipping duplicate initialization');
      return;
    }
    initializingRef.current = true;

    debugLog('PROVIDER', 'AuthProvider mounted, starting initialization');
    initializeAuth();

    return () => {
      debugLog('PROVIDER', 'AuthProvider unmounting, cleaning up');
      subscriptionRef.current?.unsubscribe();
    };
  }, [initializeAuth]);

  return (
    <AuthContext.Provider value={{ session, isInitialized, supabaseClient, initError, retryInit }}>
      {children}
    </AuthContext.Provider>
  );
}

// Dev mode bypass - automatically authenticate with mock user
const DEV_BYPASS_ENABLED = import.meta.env.DEV;

// DEV_MOCK_USER removed - we now fetch the actual dev user from the backend

export function useAuth() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { session, isInitialized, supabaseClient, initError, retryInit } = useContext(AuthContext);

  // In dev mode, return mock user immediately
  const fetchUserWithToken = useCallback(async (): Promise<AuthUserResponse | null> => {
    // In dev mode, we might not have a session, but backend allows bypass.
    // So we should try fetching user even without a token if we're in dev mode.
    if (!session?.access_token && !DEV_BYPASS_ENABLED) {
      debugLog('FETCH_USER', 'No session or access token, returning null');
      return null;
    }

    debugLog('FETCH_USER', 'fetchUserWithToken called', {
      hasSession: !!session,
      hasClient: !!supabaseClient,
      hasToken: !!session?.access_token,
      isDev: DEV_BYPASS_ENABLED
    });

    try {
      debugLog('FETCH_USER', 'Fetching /api/auth/user...');
      const startTime = performance.now();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        debugLog('FETCH_USER', 'TIMEOUT - Aborting after 10 seconds');
        controller.abort();
      }, 10000);

      const headers: HeadersInit = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      } else if (DEV_BYPASS_ENABLED) {
        // In dev mode without token, backend will auto-authenticate as mock user
        debugLog('FETCH_USER', 'Dev mode: Fetching without token to trigger backend bypass');
      }

      const response = await fetch('/api/auth/user?sync=true', {
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const elapsed = (performance.now() - startTime).toFixed(0);
      debugLog('FETCH_USER', `Response received in ${elapsed}ms, status: ${response.status}`);

      if (!response.ok) {
        if (response.status === 401) {
          debugLog('FETCH_USER', 'Got 401, returning null');
          return null;
        }
        throw new Error(`Failed to fetch user: ${response.status}`);
      }

      const userData = await response.json();
      debugLog('FETCH_USER', 'User data received', { username: userData?.username });
      return userData;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        debugLog('FETCH_USER', 'ERROR - Request timed out after 10 seconds');
      } else {
        debugLog('FETCH_USER', 'ERROR - Fetch failed', { error: (error as Error).message });
      }
      return null;
    }
  }, [session, supabaseClient]);

  const { data: user, isLoading: isQueryLoading, error: queryError } = useQuery<AuthUserResponse | null>({
    queryKey: ['/api/auth/user'],
    queryFn: fetchUserWithToken,
    // In dev mode, always enable the query; in production, require session
    enabled: DEV_BYPASS_ENABLED || (isInitialized && !!supabaseClient && !!session),
    staleTime: 5 * 60 * 1000,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
  });

  useEffect(() => {
    if (user?.whopSync?.credited && user.whopSync.credited > 0) {
      toast({
        title: "Premium Shares Credited!",
        description: `${user.whopSync.credited} Premium Share${user.whopSync.credited > 1 ? 's' : ''} from your Whop purchase${user.whopSync.credited > 1 ? 's' : ''} ${user.whopSync.credited > 1 ? 'have' : 'has'} been added to your account.`,
        duration: 8000,
      });
    }
  }, [user?.whopSync?.credited, toast]);

  const login = useCallback(async (email: string, password: string) => {
    debugLog('LOGIN', 'Login attempt', { email });
    try {
      if (!supabaseClient) {
        throw new Error('Auth not initialized');
      }

      const { error } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      debugLog('LOGIN', 'Login successful');
      return { success: true };
    } catch (error: any) {
      debugLog('LOGIN', 'Login failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }, [supabaseClient]);

  const signup = useCallback(async (email: string, password: string) => {
    debugLog('SIGNUP', 'Signup attempt', { email });
    try {
      if (!supabaseClient) {
        throw new Error('Auth not initialized');
      }

      const { error } = await supabaseClient.auth.signUp({
        email,
        password,
      });

      if (error) throw error;
      debugLog('SIGNUP', 'Signup successful');
      return { success: true };
    } catch (error: any) {
      debugLog('SIGNUP', 'Signup failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }, [supabaseClient]);

  const logout = useCallback(async () => {
    debugLog('LOGOUT', 'Logout attempt');
    try {
      if (!supabaseClient) {
        throw new Error('Auth not initialized');
      }

      await supabaseClient.auth.signOut();

      queryClient.removeQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          if (typeof key !== 'string') return false;
          const userScopedPaths = [
            '/api/auth',
            '/api/dashboard',
            '/api/holdings',
            '/api/orders',
            '/api/portfolio',
            '/api/mining',
            '/api/admin',
            '/api/contest',
            '/api/whop',
          ];
          return userScopedPaths.some(path => key.startsWith(path));
        },
      });

      debugLog('LOGOUT', 'Logout successful');
      return { success: true };
    } catch (error: any) {
      debugLog('LOGOUT', 'Logout failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }, [supabaseClient, queryClient]);

  const loginWithGoogle = useCallback(async () => {
    debugLog('GOOGLE_LOGIN', 'Google login attempt');
    try {
      if (!supabaseClient) {
        throw new Error('Auth not initialized');
      }

      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;
      debugLog('GOOGLE_LOGIN', 'Google OAuth initiated');
      return { success: true };
    } catch (error: any) {
      debugLog('GOOGLE_LOGIN', 'Google login failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }, [supabaseClient]);

  // In dev mode, we're never loading and always authenticated
  const isLoading = DEV_BYPASS_ENABLED ? false : (!isInitialized || isQueryLoading);

  return {
    user: user as User | undefined,
    session,
    isLoading,
    // In dev mode, authenticated once user query returns; in production, require session
    isAuthenticated: DEV_BYPASS_ENABLED ? !!user : (!!session && !!user),
    login,
    signup,
    logout,
    loginWithGoogle,
    initError,
    retryInit,
  };
}
