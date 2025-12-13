import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";
import { getQueryFn } from "@/lib/queryClient";
import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";

interface AuthUserResponse extends User {
  whopSync?: {
    credited: number;
    revoked: number;
    synced: number;
  };
}

export function useAuth() {
  const { toast } = useToast();
  const hasShownSyncToast = useRef(false);
  
  const { data: user, isLoading } = useQuery<AuthUserResponse>({
    queryKey: ["/api/auth/user?sync=true"],
    queryFn: getQueryFn({ on401: "returnNull" }),
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

  return {
    user: user as User | undefined,
    isLoading,
    isAuthenticated: !!user,
  };
}
