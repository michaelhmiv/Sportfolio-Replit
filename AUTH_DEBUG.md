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
- **Redirect URI debugging** - exact callback URL being generated
- Protocol and full request URL
- Session and cookie status

**Example:**
```
[AUTH:LOGIN] 2025-11-19T12:16:00.000Z - Login initiated {
  "hostname": "your-repl.replit.app",
  "protocol": "https",
  "host": "your-repl.replit.app",
  "fullUrl": "https://your-repl.replit.app/api/login",
  "callbackURL": "https://your-repl.replit.app/api/callback",
  "ip": "123.45.67.89",
  "userAgent": "Mozilla/5.0...",
  "sessionID": "abc123...",
  "hasSession": true,
  "cookies": ["connect.sid"]
}
```

**Key Field:** `callbackURL` shows the exact OAuth callback URL being registered for this login attempt.

### 6. OAuth Callback (`[AUTH:CALLBACK]`)
Logs when OAuth provider redirects back to your app:
- **Redirect URI validation** - expected vs actual callback URL
- Query parameters received (sanitized)
- OAuth provider errors
- Session and cookie status
- Authentication success/failure

**Example:**
```
[AUTH:CALLBACK] 2025-11-19T12:16:05.000Z - OAuth callback received {
  "hostname": "your-repl.replit.app",
  "protocol": "https",
  "host": "your-repl.replit.app",
  "fullUrl": "https://your-repl.replit.app/api/callback?code=...",
  "expectedCallbackURL": "https://your-repl.replit.app/api/callback",
  "query": { "code": "[REDACTED]", "state": "[REDACTED]" },
  "sessionID": "abc123...",
  "hasSession": true,
  "hasError": false,
  "cookies": ["connect.sid"]
}
[AUTH:CALLBACK] 2025-11-19T12:16:05.500Z - Authentication successful, redirecting {
  "sessionID": "abc123...",
  "isAuthenticated": true,
  "hasUser": true,
  "userClaims": ["sub", "email", "first_name", "last_name"]
}
```

**OAuth Provider Errors:**
If the OAuth provider returns an error, you'll see:
```
[AUTH:CALLBACK] OAuth provider returned error {
  "error": "access_denied",
  "errorDescription": "User denied authorization",
  "errorUri": "https://..."
}
```

**Key Fields:**
- `expectedCallbackURL` - What your app expects
- `fullUrl` - The actual URL the user was redirected to
- Compare these to debug redirect URI mismatches

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
- Missing `[AUTH:CALLBACK]` → User didn't complete OAuth flow or was blocked
- OAuth provider error in callback → User denied access or provider issue
- Error in `[AUTH:VERIFY]` → Token verification failed
- Error in `[AUTH:USER_UPSERT]` → Database issue saving user
- Redirect to `/auth/error` → Check error code and description in URL

### Issue: "Window Closes Immediately" After Clicking Allow

**What this actually means:**
- User clicks "Allow" on Replit OAuth screen
- Instead of returning to your app, they see an error or blank page
- Users interpret this as "the window closing"

**Debug steps:**

1. **Check for OAuth provider errors:**
```
[AUTH:CALLBACK] OAuth provider returned error {
  "error": "access_denied",
  "errorDescription": "..."
}
```
This means the user denied access or there's a provider-side issue.

2. **Check for redirect URI mismatch:**
Compare these log fields:
```
[AUTH:LOGIN] callbackURL: "https://yourapp-xyz.replit.app/api/callback"
[AUTH:CALLBACK] expectedCallbackURL: "https://yourapp-abc.replit.app/api/callback"
```
If the domains differ (`.app` vs `.dev`, different subdomain), that's your problem!

3. **Check for callback authentication failures:**
```
[AUTH:CALLBACK] Authentication FAILED in callback {
  "error": "...",
  "errorName": "...",
  "errorCode": "..."
}
```

4. **Verify session persistence:**
```
[AUTH:LOGIN] hasSession: true, cookies: ["connect.sid"]
[AUTH:CALLBACK] hasSession: false, cookies: []
```
If session is lost between login and callback, cookies aren't working.

**Solutions:**
- Ensure user accesses app from consistent URL (always use `.replit.app`, not `.dev`)
- Check cookie settings (secure, sameSite) in `[AUTH:SESSION]` logs
- Look for error page redirect: user should see `/auth/error` with error details

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
2. **Cookie settings** - Verify they're appropriate for your environment:
```
[AUTH:SESSION] Session configuration created {
  "ttl": 604800000,
  "secure": false,  // Should be true in production
  "sameSite": "lax",
  "httpOnly": true
}
```
3. **Session presence during OAuth flow:**
```
[AUTH:LOGIN] hasSession: true, cookies: ["connect.sid"]
[AUTH:CALLBACK] hasSession: true, cookies: ["connect.sid"]
```
Both should have session and cookies.

4. **Serialize/Deserialize** - Check `[AUTH:SERIALIZE]` and `[AUTH:DESERIALIZE]`
5. **Session store** - Look for database connection messages

**Common patterns:**
- Session store not connecting to database
- `secure: true` in development (should be false for http)
- Cross-domain cookie issues (check `sameSite` setting)
- Missing `SESSION_SECRET` or `DATABASE_URL`
- Session lost between login and callback (cookies not being sent)

## User-Facing Error Messages

When OAuth fails, users are redirected to `/auth/error` with a friendly error page instead of seeing technical errors. The page shows:

- **User-friendly error title and description**
- **Actionable suggestions** (what the user can do)
- **Error code** (for support/debugging)
- **Retry and Home buttons**

Common error codes shown to users:
- `access_denied` - User clicked "Deny" on OAuth screen
- `server_error` - Server configuration issue
- `callback_failed` - Authentication callback failed
- `auth_failed` - General authentication failure
- `redirect_uri_mismatch` - OAuth configuration problem

**Error URL format:**
```
/auth/error?error=access_denied&description=You%20denied%20the%20request
```

## Viewing Logs

### In Development (Replit)
Logs appear in the Console/Shell output automatically.

### In Production
If you've enabled `AUTH_DEBUG=true`, logs will appear in your application logs.

### Filtering Logs
Use grep to filter specific auth events:
```bash
# View all auth logs
grep "\[AUTH:" logs.txt

# View only callback logs
grep "\[AUTH:CALLBACK\]" logs.txt

# View only errors
grep "FAILED\|ERROR" logs.txt | grep "\[AUTH:"

# View redirect URI debugging
grep "callbackURL\|expectedCallbackURL" logs.txt
```

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
