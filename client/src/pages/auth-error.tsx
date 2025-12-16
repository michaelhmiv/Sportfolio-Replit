import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Home, RefreshCw, Smartphone, Clock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function AuthError() {
  const [, setLocation] = useLocation();
  const [autoRetryCount, setAutoRetryCount] = useState(0);
  const [countdown, setCountdown] = useState(0);
  
  // Parse error from URL query params
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error') || 'unknown_error';
  const description = params.get('description') || 'An unexpected authentication error occurred';

  // Detect mobile browser
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // Map error codes to user-friendly messages
  const getErrorMessage = () => {
    switch (error) {
      case 'access_denied':
        return {
          title: 'Access Denied',
          message: 'You denied the authentication request. To use Sportfolio, you need to allow access.',
          suggestion: 'Click "Try Again" and allow access when prompted.',
          canAutoRetry: false,
          isMobileIssue: false,
        };
      case 'server_error':
        return {
          title: 'Server Error',
          message: 'We encountered a server configuration issue.',
          suggestion: 'Please try again in a few moments. If the problem persists, contact support.',
          canAutoRetry: true,
          isMobileIssue: false,
        };
      case 'callback_failed':
        return {
          title: 'Authentication Failed',
          message: description,
          suggestion: 'This might be a temporary issue. Please try logging in again.',
          canAutoRetry: true,
          isMobileIssue: false,
        };
      case 'session_lost':
        return {
          title: 'Session Expired',
          message: 'Your login session was lost during authentication.',
          suggestion: isMobile 
            ? 'This can happen on mobile browsers due to cookie settings. Try opening Sportfolio in your default browser (Safari on iPhone, Chrome on Android) instead of in-app browsers.'
            : 'This can happen if cookies are blocked. Make sure third-party cookies are enabled.',
          canAutoRetry: true,
          isMobileIssue: true,
        };
      case 'state_mismatch':
        return {
          title: 'Security Check Failed',
          message: 'A security validation check failed during login.',
          suggestion: 'This usually happens when the login page was open too long. Please try again.',
          canAutoRetry: true,
          isMobileIssue: false,
        };
      case 'login_failed':
        return {
          title: 'Session Error',
          message: 'We could not establish your login session.',
          suggestion: 'Please try again. If this persists, try clearing your browser cookies.',
          canAutoRetry: true,
          isMobileIssue: false,
        };
      case 'auth_failed':
        return {
          title: 'Login Failed',
          message: 'We were unable to complete your login.',
          suggestion: isMobile
            ? 'Please try again. If using an in-app browser (like from Twitter or Discord), try opening in Safari or Chrome instead.'
            : 'Please try again. Make sure you\'re using a valid Replit account.',
          canAutoRetry: true,
          isMobileIssue: isMobile,
        };
      case 'redirect_uri_mismatch':
        return {
          title: 'Configuration Error',
          message: 'There\'s a mismatch in the authentication configuration.',
          suggestion: 'Please contact support with this error code.',
          canAutoRetry: false,
          isMobileIssue: false,
        };
      default:
        return {
          title: 'Authentication Error',
          message: description,
          suggestion: 'Please try logging in again. If this continues, try using a different browser or clearing your cookies.',
          canAutoRetry: true,
          isMobileIssue: false,
        };
    }
  };

  const errorInfo = getErrorMessage();

  // Check sessionStorage to prevent auto-retry loops across page reloads
  const hasAutoRetried = typeof window !== 'undefined' && 
    sessionStorage.getItem('auth_auto_retry_attempted') === 'true';

  // Auto-retry logic for recoverable errors (only on first attempt, once per session)
  useEffect(() => {
    if (errorInfo.canAutoRetry && !hasAutoRetried && autoRetryCount === 0) {
      // Start countdown for auto-retry
      setCountdown(3);
      const interval = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            setAutoRetryCount(1);
            // Mark that we've attempted auto-retry in sessionStorage (persists across page loads)
            sessionStorage.setItem('auth_auto_retry_attempted', 'true');
            window.location.href = '/login';
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [errorInfo.canAutoRetry, hasAutoRetried, autoRetryCount]);
  
  // Clear the auto-retry flag when user manually clicks retry or goes home
  const clearRetryFlag = () => {
    sessionStorage.removeItem('auth_auto_retry_attempted');
  };

  const handleRetry = () => {
    clearRetryFlag(); // Allow auto-retry again on next failure
    window.location.href = '/login';
  };

  const handleGoHome = () => {
    clearRetryFlag(); // Clear retry flag when leaving
    setLocation('/');
  };

  const cancelAutoRetry = () => {
    setAutoRetryCount(1); // Prevent auto-retry this session
    setCountdown(0);
    sessionStorage.setItem('auth_auto_retry_attempted', 'true'); // Prevent future auto-retries
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background to-muted">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="w-6 h-6 text-destructive" data-testid="icon-error" />
          </div>
          <CardTitle className="text-2xl" data-testid="text-error-title">
            {errorInfo.title}
          </CardTitle>
          <CardDescription className="text-base" data-testid="text-error-message">
            {errorInfo.message}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {countdown > 0 && (
            <Alert className="border-primary/50 bg-primary/5">
              <Clock className="h-4 w-4" />
              <AlertTitle>Retrying automatically...</AlertTitle>
              <AlertDescription className="flex items-center justify-between">
                <span>Trying again in {countdown} second{countdown !== 1 ? 's' : ''}...</span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={cancelAutoRetry}
                  data-testid="button-cancel-retry"
                >
                  Cancel
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <Alert>
            <AlertTitle>What you can do:</AlertTitle>
            <AlertDescription data-testid="text-error-suggestion">
              {errorInfo.suggestion}
            </AlertDescription>
          </Alert>

          {isMobile && errorInfo.isMobileIssue && (
            <Alert className="border-amber-500/50 bg-amber-500/5">
              <Smartphone className="h-4 w-4" />
              <AlertTitle>Mobile Browser Tip</AlertTitle>
              <AlertDescription>
                If you're having trouble logging in on mobile, try these steps:
                <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                  <li>Use Safari (iPhone) or Chrome (Android) directly</li>
                  <li>Avoid in-app browsers from social media apps</li>
                  <li>Make sure cookies are enabled in your browser settings</li>
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {error !== 'access_denied' && (
            <div className="text-sm text-muted-foreground text-center">
              <p>Error Code: <code className="bg-muted px-2 py-1 rounded" data-testid="text-error-code">{error}</code></p>
              {hasAutoRetried && (
                <p className="mt-1">Auto-retry was attempted</p>
              )}
            </div>
          )}
        </CardContent>

        <CardFooter className="flex flex-col sm:flex-row gap-3">
          <Button 
            onClick={handleRetry} 
            className="w-full sm:w-auto flex-1"
            data-testid="button-retry-login"
            disabled={countdown > 0}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
          <Button 
            variant="outline" 
            onClick={handleGoHome}
            className="w-full sm:w-auto flex-1"
            data-testid="button-go-home"
          >
            <Home className="w-4 h-4 mr-2" />
            Go Home
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
