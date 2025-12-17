import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback, useRef, createContext, useContext, ReactNode } from "react";
import type { User } from "@shared/schema";
import { getSupabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import type { Session, SupabaseClient } from "@supabase/supabase-js";

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
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  isInitialized: false,
  supabaseClient: null,
});

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [supabaseClient, setSupabaseClient] = useState<SupabaseClient | null>(null);
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
  const initializingRef = useRef(false);

  useEffect(() => {
    if (initializingRef.current) return;
    initializingRef.current = true;

    async function initializeAuth() {
      try {
        const client = await getSupabase();
        setSupabaseClient(client);

        const { data: { session: initialSession } } = await client.auth.getSession();
        setSession(initialSession);
        setIsInitialized(true);

        const { data: { subscription } } = client.auth.onAuthStateChange(
          async (event, newSession) => {
            console.log('[AUTH] Auth state changed:', event);
            setSession(newSession);

            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
              queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
            } else if (event === 'SIGNED_OUT') {
              queryClient.setQueryData(['/api/auth/user'], null);
            }
          }
        );

        subscriptionRef.current = subscription;
      } catch (error) {
        console.error('[AUTH] Failed to initialize auth:', error);
        setIsInitialized(true);
      }
    }

    initializeAuth();

    return () => {
      subscriptionRef.current?.unsubscribe();
    };
  }, [queryClient]);

  return (
    <AuthContext.Provider value={{ session, isInitialized, supabaseClient }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { session, isInitialized, supabaseClient } = useContext(AuthContext);

  const fetchUserWithToken = useCallback(async (): Promise<AuthUserResponse | null> => {
    try {
      if (!supabaseClient) {
        return null;
      }

      const { data: { session: currentSession } } = await supabaseClient.auth.getSession();

      if (!currentSession?.access_token) {
        return null;
      }

      // Sync on first load after login/redirect - use sync=true always
      // The server-side atomic crediting prevents double-credits even with multiple sync calls
      const response = await fetch('/api/auth/user?sync=true', {
        headers: {
          'Authorization': `Bearer ${currentSession.access_token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          return null;
        }
        throw new Error('Failed to fetch user');
      }

      return response.json();
    } catch (error) {
      console.error('Error fetching user:', error);
      return null;
    }
  }, [supabaseClient]);

  const { data: user, isLoading: isQueryLoading } = useQuery<AuthUserResponse | null>({
    queryKey: ['/api/auth/user'],
    queryFn: fetchUserWithToken,
    enabled: isInitialized && !!supabaseClient,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    // Only show toast if shares were credited in THIS response (credited > 0)
    // The server only returns non-zero credited count when shares are newly credited
    // So we don't need to track shown toasts - if credited > 0, it's a new credit
    if (user?.whopSync?.credited && user.whopSync.credited > 0) {
      toast({
        title: "Premium Shares Credited!",
        description: `${user.whopSync.credited} Premium Share${user.whopSync.credited > 1 ? 's' : ''} from your Whop purchase${user.whopSync.credited > 1 ? 's' : ''} ${user.whopSync.credited > 1 ? 'have' : 'has'} been added to your account.`,
        duration: 8000,
      });
    }
  }, [user?.whopSync?.credited, toast]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      if (!supabaseClient) {
        throw new Error('Auth not initialized');
      }

      const { error } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      console.error('[AUTH] Login error:', error);
      return { success: false, error: error.message };
    }
  }, [supabaseClient]);

  const signup = useCallback(async (email: string, password: string) => {
    try {
      if (!supabaseClient) {
        throw new Error('Auth not initialized');
      }

      const { error } = await supabaseClient.auth.signUp({
        email,
        password,
      });

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      console.error('[AUTH] Signup error:', error);
      return { success: false, error: error.message };
    }
  }, [supabaseClient]);

  const logout = useCallback(async () => {
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

      return { success: true };
    } catch (error: any) {
      console.error('[AUTH] Logout error:', error);
      return { success: false, error: error.message };
    }
  }, [supabaseClient, queryClient]);

  const loginWithGoogle = useCallback(async () => {
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

      return { success: true };
    } catch (error: any) {
      console.error('[AUTH] Google login error:', error);
      return { success: false, error: error.message };
    }
  }, [supabaseClient]);

  const isLoading = !isInitialized || isQueryLoading;

  return {
    user: user as User | undefined,
    session,
    isLoading,
    isAuthenticated: !!session && !!user,
    login,
    signup,
    logout,
    loginWithGoogle,
  };
}
