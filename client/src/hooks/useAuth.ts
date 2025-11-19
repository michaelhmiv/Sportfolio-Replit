import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading, error, refetch } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: (failureCount, error: any) => {
      // Retry up to 3 times for non-401 errors (network issues, etc)
      // Don't retry 401s - that means user is genuinely not authenticated
      if (error?.message?.includes('401')) {
        return false;
      }
      return failureCount < 3;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
    staleTime: 30000, // Consider auth data fresh for 30 seconds
  });

  // Log auth errors for debugging (except 401s which are expected)
  if (error && !error?.message?.includes('401')) {
    console.error('[Auth] Error fetching user:', error);
  }

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    error,
    refetch,
  };
}
