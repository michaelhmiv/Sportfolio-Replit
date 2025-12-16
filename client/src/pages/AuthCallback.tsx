import { useEffect } from "react";
import { useLocation } from "wouter";
import { getSupabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

export default function AuthCallback() {
  const [, navigate] = useLocation();
  
  useEffect(() => {
    async function handleCallback() {
      try {
        const supabase = await getSupabase();
        
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        
        if (accessToken && refreshToken) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        } else {
          const { error } = await supabase.auth.getSession();
          if (error) {
            console.error('[AUTH_CALLBACK] Session error:', error);
          }
        }
        
        navigate("/");
      } catch (error) {
        console.error('[AUTH_CALLBACK] Error:', error);
        navigate("/login");
      }
    }
    
    handleCallback();
  }, [navigate]);
  
  return (
    <div className="flex items-center justify-center min-h-screen" data-testid="auth-callback">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  );
}
