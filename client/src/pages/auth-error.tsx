import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Home, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function AuthError() {
  const [, setLocation] = useLocation();
  
  // Parse error from URL query params
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error') || 'unknown_error';
  const description = params.get('description') || 'An unexpected authentication error occurred';

  // Map error codes to user-friendly messages
  const getErrorMessage = () => {
    switch (error) {
      case 'access_denied':
        return {
          title: 'Access Denied',
          message: 'You denied the authentication request. To use Sportfolio, you need to allow access.',
          suggestion: 'Click "Try Again" and allow access when prompted.',
        };
      case 'server_error':
        return {
          title: 'Server Error',
          message: 'We encountered a server configuration issue.',
          suggestion: 'Please try again in a few moments. If the problem persists, contact support.',
        };
      case 'callback_failed':
        return {
          title: 'Authentication Failed',
          message: description,
          suggestion: 'This might be a temporary issue. Please try logging in again.',
        };
      case 'auth_failed':
        return {
          title: 'Login Failed',
          message: 'We were unable to complete your login.',
          suggestion: 'Please try again. Make sure you\'re using a valid Replit account.',
        };
      case 'redirect_uri_mismatch':
        return {
          title: 'Configuration Error',
          message: 'There\'s a mismatch in the authentication configuration.',
          suggestion: 'Please contact support with this error code.',
        };
      default:
        return {
          title: 'Authentication Error',
          message: description,
          suggestion: 'Please try logging in again. If this continues, try using a different browser or clearing your cookies.',
        };
    }
  };

  const errorInfo = getErrorMessage();

  const handleRetry = () => {
    window.location.href = '/api/login';
  };

  const handleGoHome = () => {
    setLocation('/');
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
          <Alert>
            <AlertTitle>What you can do:</AlertTitle>
            <AlertDescription data-testid="text-error-suggestion">
              {errorInfo.suggestion}
            </AlertDescription>
          </Alert>

          {error !== 'access_denied' && (
            <div className="text-sm text-muted-foreground text-center">
              <p>Error Code: <code className="bg-muted px-2 py-1 rounded" data-testid="text-error-code">{error}</code></p>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex flex-col sm:flex-row gap-3">
          <Button 
            onClick={handleRetry} 
            className="w-full sm:w-auto flex-1"
            data-testid="button-retry-login"
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
