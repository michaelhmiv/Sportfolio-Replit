import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback, useRef } from "react";
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

let supabaseClient: SupabaseClient | null = null;
let globalSession: Session | null = null;
let globalIsInitialized = false;

export function useAuth() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const hasShownSyncToast = useRef(false);
  const [session, setSession] = useState<Session | null>(globalSession);
  const [isInitialized, setIsInitialized] = useState(globalIsInitialized);
  
  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;
    
    async function initializeAuth() {
      if (globalIsInitialized && supabaseClient) {
        setSession(globalSession);
        setIsInitialized(true);
        
        const { data: { subscription: authSubscription } } = supabaseClient.auth.onAuthStateChange(
          async (event, newSession) => {
            console.log('[AUTH] Auth state changed:', event);
            globalSession = newSession;
            setSession(newSession);
            
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
              queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
            } else if (event === 'SIGNED_OUT') {
              globalSession = null;
              queryClient.setQueryData(['/api/auth/user'], null);
            }
          }
        );
        subscription = authSubscription;
        return;
      }
      
      try {
        const client = await getSupabase();
        supabaseClient = client;
        
        const { data: { session: initialSession } } = await client.auth.getSession();
        globalSession = initialSession;
        globalIsInitialized = true;
        setSession(initialSession);
        setIsInitialized(true);
        
        const { data: { subscription: authSubscription } } = client.auth.onAuthStateChange(
          async (event, newSession) => {
            console.log('[AUTH] Auth state changed:', event);
            globalSession = newSession;
            setSession(newSession);
            
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
              queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
            } else if (event === 'SIGNED_OUT') {
              globalSession = null;
              queryClient.setQueryData(['/api/auth/user'], null);
            }
          }
        );
        
        subscription = authSubscription;
      } catch (error) {
        console.error('[AUTH] Failed to initialize auth:', error);
        globalIsInitialized = true;
        setIsInitialized(true);
      }
    }
    
    initializeAuth();
    
    return () => {
      subscription?.unsubscribe();
    };
  }, [queryClient]);

  const fetchUserWithToken = useCallback(async (): Promise<AuthUserResponse | null> => {
    try {
      if (!supabaseClient) {
        supabaseClient = await getSupabase();
      }
      
      const { data: { session: currentSession } } = await supabaseClient.auth.getSession();
      
      if (!currentSession?.access_token) {
        return null;
      }
      
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
  }, []);

  const { data: user, isLoading: isQueryLoading } = useQuery<AuthUserResponse | null>({
    queryKey: ['/api/auth/user'],
    queryFn: fetchUserWithToken,
    enabled: isInitialized,
    staleTime: 5 * 60 * 1000,
  });
  
  useEffect(() => {
    if (user?.whopSync?.credited && user.whopSync.credited > 0 && !hasShownSyncToast.current) {
      hasShownSyncToast.current = true;
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
        supabaseClient = await getSupabase();
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
  }, []);

  const signup = useCallback(async (email: string, password: string) => {
    try {
      if (!supabaseClient) {
        supabaseClient = await getSupabase();
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
  }, []);

  const logout = useCallback(async () => {
    try {
      if (!supabaseClient) {
        supabaseClient = await getSupabase();
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
  }, [queryClient]);

  const loginWithGoogle = useCallback(async () => {
    try {
      if (!supabaseClient) {
        supabaseClient = await getSupabase();
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
  }, []);

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
