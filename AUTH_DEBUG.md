# Authentication Debug Logging

This document explains how to use the comprehensive debug logging system for diagnosing Replit authentication issues.

## Overview

The authentication system now includes detailed logging at every stage of the login/signup process. This helps diagnose issues that users may experience during authentication.

## How to Enable Debug Logging

Debug logging is **automatically enabled in development mode**. In production, you can enable it by setting:

```bash
AUTH_DEBUG=true
```

## Log Categories

All auth logs are prefixed with `[AUTH:CATEGORY]` followed by a timestamp and message. The categories are:

### 1. OIDC Configuration (`[AUTH:OIDC]`)
Logs related to OpenID Connect discovery and configuration:
- Discovery start and parameters
- Successful configuration retrieval
- Errors during OIDC setup

**Example:**
```
[AUTH:OIDC] 2025-11-19T12:14:59.993Z - Starting OIDC configuration discovery
[AUTH:OIDC] 2025-11-19T12:14:59.993Z - Configuration parameters {
  "issuerUrl": "https://replit.com/oidc",
  "replId": "4f8b2e70..."
}
[AUTH:OIDC] 2025-11-19T12:15:00.815Z - OIDC configuration discovery successful
```

### 2. Session Management (`[AUTH:SESSION]`)
Logs related to session initialization and updates:
- Session store configuration
- Session cookie settings
- User session updates (tokens, expiration)

**Example:**
```
[AUTH:SESSION] 2025-11-19T12:14:59.966Z - Initializing session configuration
[AUTH:SESSION] 2025-11-19T12:14:59.992Z - Session configuration created {
  "ttl": 604800000,
  "secure": false,
  "sameSite": "lax",
  "httpOnly": true
}
```

### 3. Setup (`[AUTH:SETUP]`)
Logs during authentication system initialization:
- Passport initialization
- Authentication setup completion

### 4. Strategy Registration (`[AUTH:STRATEGY]`)
Logs when OAuth strategies are registered for different domains:
- New strategy registration
- Existing strategy reuse
- Callback URL configuration

**Example:**
```
[AUTH:STRATEGY] 2025-11-19T12:15:30.123Z - Registering new strategy for domain {
  "domain": "your-repl.replit.app",
  "strategyName": "replitauth:your-repl.replit.app",
  "callbackURL": "https://your-repl.replit.app/api/callback"
}
```

### 5. Login Flow (`[AUTH:LOGIN]`)
Logs when a user initiates login:
- Hostname, IP, user agent
- Session ID

**Example:**
```
[AUTH:LOGIN] 2025-11-19T12:16:00.000Z - Login initiated {
  "hostname": "your-repl.replit.app",
  "ip": "123.45.67.89",
  "userAgent": "Mozilla/5.0...",
  "sessionID": "abc123..."
}
```

### 6. OAuth Callback (`[AUTH:CALLBACK]`)
Logs when OAuth provider redirects back to your app:
- Query parameters received
- Error information (if any)
- Authentication success/failure
- Session establishment

**Example:**
```
[AUTH:CALLBACK] 2025-11-19T12:16:05.000Z - OAuth callback received {
  "hostname": "your-repl.replit.app",
  "query": { "code": "[REDACTED]", "state": "[REDACTED]" },
  "sessionID": "abc123...",
  "hasError": false
}
[AUTH:CALLBACK] 2025-11-19T12:16:05.500Z - Authentication successful, redirecting
```

### 7. Verify Callback (`[AUTH:VERIFY]`)
Logs during the token verification and user creation process:
- Token claims received
- User upsert process
- Success or failure

**Example:**
```
[AUTH:VERIFY] 2025-11-19T12:16:05.250Z - Starting verify callback
[AUTH:VERIFY] 2025-11-19T12:16:05.251Z - Token claims received {
  "sub": "12345678...",
  "email": "user@example.com",
  "hasAccessToken": true,
  "hasRefreshToken": true
}
[AUTH:VERIFY] 2025-11-19T12:16:05.500Z - Verify callback completed successfully
```

### 8. User Upsert (`[AUTH:USER_UPSERT]`)
Logs during user creation/update in database:
- User ID and basic info
- Whether user is new or existing
- Username generation (for new users)
- Success or errors

**Example:**
```
[AUTH:USER_UPSERT] 2025-11-19T12:16:05.300Z - Starting user upsert {
  "userId": "12345678...",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe"
}
[AUTH:USER_UPSERT] 2025-11-19T12:16:05.400Z - User upsert completed successfully {
  "userId": "12345678...",
  "username": "brave_eagle_1234",
  "isNewUser": true
}
```

### 9. Serialize/Deserialize (`[AUTH:SERIALIZE]`, `[AUTH:DESERIALIZE]`)
Logs when user session is saved to or loaded from session store:
- User object structure

### 10. Authentication Checks (`[AUTH:AUTH_CHECK]`)
Logs on every protected API request:
- Request path
- Session status
- Token expiration status
- Whether refresh is needed

**Example:**
```
[AUTH:AUTH_CHECK] 2025-11-19T12:17:00.000Z - Checking authentication {
  "path": "/api/dashboard",
  "sessionID": "abc123...",
  "isAuthenticated": true,
  "hasUser": true
}
[AUTH:AUTH_CHECK] 2025-11-19T12:17:00.001Z - Token expiration check {
  "path": "/api/dashboard",
  "now": 1700395020,
  "expiresAt": 1700398620,
  "timeUntilExpiry": 3600,
  "isExpired": false
}
[AUTH:AUTH_CHECK] 2025-11-19T12:17:00.002Z - Token still valid {
  "path": "/api/dashboard",
  "timeUntilExpiry": 3600
}
```

### 11. Token Refresh (`[AUTH:TOKEN_REFRESH]`)
Logs when access token is refreshed using refresh token:
- Refresh initiation
- Success with new expiration
- Errors during refresh

**Example:**
```
[AUTH:TOKEN_REFRESH] 2025-11-19T13:16:00.000Z - Starting token refresh {
  "path": "/api/dashboard"
}
[AUTH:TOKEN_REFRESH] 2025-11-19T13:16:00.500Z - Token refresh successful {
  "path": "/api/dashboard",
  "newExpiresAt": 1700402220
}
```

### 12. Logout (`[AUTH:LOGOUT]`)
Logs during logout process:
- Session destruction
- Redirect to OIDC logout

**Example:**
```
[AUTH:LOGOUT] 2025-11-19T14:00:00.000Z - Logout initiated {
  "sessionID": "abc123...",
  "userId": "12345678..."
}
[AUTH:LOGOUT] 2025-11-19T14:00:00.100Z - Session destroyed, redirecting to OIDC logout
```

## Common Issues and What to Look For

### Issue: User Cannot Log In

**Check these log sequences:**

1. **Login initiation** - Look for `[AUTH:LOGIN]` to confirm user reached the login endpoint
2. **OIDC redirect** - User should be redirected to Replit OAuth
3. **Callback received** - Look for `[AUTH:CALLBACK]` with query parameters
4. **Verify process** - Check `[AUTH:VERIFY]` for token processing
5. **User upsert** - Look for `[AUTH:USER_UPSERT]` success or errors

**Common error patterns:**
- Missing `[AUTH:CALLBACK]` → User didn't complete OAuth flow
- Error in `[AUTH:VERIFY]` → Token verification failed
- Error in `[AUTH:USER_UPSERT]` → Database issue saving user

### Issue: User Logged Out Unexpectedly

**Check these logs:**

1. **Authentication checks** - Look for `[AUTH:AUTH_CHECK]` on API requests
2. **Session status** - Check if `isAuthenticated` is false
3. **Token expiration** - Look at `timeUntilExpiry` and `isExpired` values
4. **Refresh attempts** - Check for `[AUTH:TOKEN_REFRESH]` and any errors

**Common patterns:**
- `isAuthenticated: false` → Session was destroyed or never created
- `isExpired: true` with no refresh → Refresh token missing or expired
- Errors in `[AUTH:TOKEN_REFRESH]` → Token refresh failed

### Issue: Session Not Persisting

**Check these logs:**

1. **Session configuration** - Look at `[AUTH:SESSION]` initialization
2. **Serialize/Deserialize** - Check `[AUTH:SERIALIZE]` and `[AUTH:DESERIALIZE]`
3. **Session store** - Look for database connection messages

**Common patterns:**
- Session store not connecting to database
- Cookie settings (secure, sameSite) not compatible with environment
- Missing `SESSION_SECRET` or `DATABASE_URL`

## Viewing Logs

### In Development (Replit)
Logs appear in the Console/Shell output automatically.

### In Production
If you've enabled `AUTH_DEBUG=true`, logs will appear in your application logs.

## Privacy Note

⚠️ **Important:** Auth logs are designed to be privacy and security-safe:
- User IDs are truncated (e.g., `12345678...`)
- Only first 8 characters of sensitive IDs shown
- Tokens are never logged, only their presence is indicated
- OAuth authorization codes and state parameters are redacted as `[REDACTED]`
- Access tokens and refresh tokens are never logged
- Full email addresses may be visible in some logs

For production use, consider:
- Only enabling when debugging specific issues
- Limiting log retention
- Sanitizing logs before sharing with external parties
- Reviewing logs for any remaining sensitive information before distribution

## Disabling Debug Logs

To disable in production:

```bash
unset AUTH_DEBUG
# or
AUTH_DEBUG=false
```

Debug logs are always enabled in development mode regardless of this setting.
