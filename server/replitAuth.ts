import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

// Debug logging utility for authentication
const AUTH_DEBUG = process.env.AUTH_DEBUG === "true" || process.env.NODE_ENV === "development";

function authLog(category: string, message: string, data?: any) {
  if (AUTH_DEBUG) {
    const timestamp = new Date().toISOString();
    const logMessage = `[AUTH:${category}] ${timestamp} - ${message}`;
    if (data) {
      console.log(logMessage, JSON.stringify(data, null, 2));
    } else {
      console.log(logMessage);
    }
  }
}

// Browser detection helper for Chrome-specific debugging
function detectBrowser(userAgent: string | undefined): { browser: string; isChrome: boolean; version: string | null } {
  if (!userAgent) return { browser: 'unknown', isChrome: false, version: null };
  
  // Chrome detection (but not Edge/Opera which also contain "Chrome")
  if (userAgent.includes('Chrome') && !userAgent.includes('Edg') && !userAgent.includes('OPR')) {
    const match = userAgent.match(/Chrome\/(\d+)/);
    return { browser: 'Chrome', isChrome: true, version: match ? match[1] : null };
  }
  if (userAgent.includes('Firefox')) {
    const match = userAgent.match(/Firefox\/(\d+)/);
    return { browser: 'Firefox', isChrome: false, version: match ? match[1] : null };
  }
  if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
    const match = userAgent.match(/Version\/(\d+)/);
    return { browser: 'Safari', isChrome: false, version: match ? match[1] : null };
  }
  if (userAgent.includes('Edg')) {
    const match = userAgent.match(/Edg\/(\d+)/);
    return { browser: 'Edge', isChrome: false, version: match ? match[1] : null };
  }
  return { browser: 'other', isChrome: false, version: null };
}

// Cookie analysis helper
function analyzeCookies(cookieHeader: string | undefined): { count: number; hasSession: boolean; sessionIdPrefix: string | null } {
  if (!cookieHeader) return { count: 0, hasSession: false, sessionIdPrefix: null };
  
  const cookies = cookieHeader.split(';').map(c => c.trim());
  const sessionCookie = cookies.find(c => c.startsWith('connect.sid='));
  
  return {
    count: cookies.length,
    hasSession: !!sessionCookie,
    sessionIdPrefix: sessionCookie ? sessionCookie.substring(12, 32) + '...' : null,
  };
}

// PWA detection helper - detects if request comes from installed PWA vs browser
function detectPWAContext(req: any): { isPWA: boolean; context: 'pwa' | 'browser' | 'unknown'; indicators: string[] } {
  const indicators: string[] = [];
  
  // Check Sec-Fetch-Dest header (modern browsers)
  const secFetchDest = req.get('sec-fetch-dest');
  if (secFetchDest === 'document') {
    indicators.push('sec-fetch-dest: document');
  }
  
  // Check Sec-Fetch-Mode header
  const secFetchMode = req.get('sec-fetch-mode');
  if (secFetchMode) {
    indicators.push(`sec-fetch-mode: ${secFetchMode}`);
  }
  
  // Check for display-mode query param (we'll add this on the frontend)
  const displayMode = req.query['display-mode'];
  if (displayMode === 'standalone') {
    indicators.push('display-mode: standalone (query param)');
    return { isPWA: true, context: 'pwa', indicators };
  }
  
  // Check Referer for PWA indicators
  const referer = req.get('referer') || '';
  if (referer.includes('?source=pwa') || referer.includes('&source=pwa')) {
    indicators.push('referer contains source=pwa');
    return { isPWA: true, context: 'pwa', indicators };
  }
  
  // Check for Service-Worker header
  const serviceWorker = req.get('service-worker');
  if (serviceWorker) {
    indicators.push(`service-worker: ${serviceWorker}`);
  }
  
  // Default to browser context if no PWA indicators
  return { isPWA: false, context: 'browser', indicators };
}

const getOidcConfig = memoize(
  async () => {
    authLog("OIDC", "Starting OIDC configuration discovery");
    const issuerUrl = process.env.ISSUER_URL ?? "https://replit.com/oidc";
    const replId = process.env.REPL_ID;
    
    authLog("OIDC", "Configuration parameters", { 
      issuerUrl, 
      replId: replId ? `${replId.substring(0, 8)}...` : "MISSING"
    });

    try {
      const config = await client.discovery(
        new URL(issuerUrl),
        replId!
      );
      authLog("OIDC", "OIDC configuration discovery successful", {
        issuer: config.serverMetadata().issuer,
        authorizationEndpoint: config.serverMetadata().authorization_endpoint,
        tokenEndpoint: config.serverMetadata().token_endpoint,
      });
      return config;
    } catch (error: any) {
      authLog("OIDC", "OIDC configuration discovery FAILED", {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  authLog("SESSION", "Initializing session configuration");
  
  // 30 days session lifetime for "stay logged in" experience like Facebook
  const sessionTtl = 30 * 24 * 60 * 60 * 1000; // 30 days
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl / 1000, // connect-pg-simple expects seconds, not milliseconds
    tableName: "sessions",
  });

  // Log session store events
  sessionStore.on('connect', () => {
    authLog("SESSION", "Session store connected to database");
  });

  sessionStore.on('disconnect', () => {
    authLog("SESSION", "Session store disconnected from database");
  });

  const sessionConfig = {
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: true, // Enable resave to ensure session is updated on each request
    saveUninitialized: true, // Save new sessions immediately (fixes first-login race condition)
    rolling: true, // Refresh session cookie on each request (extends session on activity)
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      maxAge: sessionTtl,
    },
  };

  authLog("SESSION", "Session configuration created", {
    ttlDays: 30,
    ttlMs: sessionTtl,
    secure: sessionConfig.cookie.secure,
    sameSite: sessionConfig.cookie.sameSite,
    httpOnly: sessionConfig.cookie.httpOnly,
    rolling: sessionConfig.rolling,
  });

  return session(sessionConfig);
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  const claims = tokens.claims();
  user.claims = claims;
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = claims?.exp;

  authLog("SESSION", "User session updated", {
    userId: claims?.sub?.substring(0, 8) + "...",
    expiresAt: claims?.exp ? new Date(claims.exp * 1000).toISOString() : "N/A",
    hasAccessToken: !!tokens.access_token,
    hasRefreshToken: !!tokens.refresh_token,
  });
}

// Generate a random username
function generateUsername(): string {
  const adjectives = ['swift', 'brave', 'wise', 'bold', 'quick', 'clever', 'mighty', 'pro', 'super', 'elite'];
  const nouns = ['trader', 'player', 'investor', 'champion', 'star', 'hawk', 'wolf', 'eagle', 'tiger', 'bear'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 10000);
  return `${adj}_${noun}_${num}`;
}

async function upsertUser(claims: any) {
  const userId = claims["sub"];
  authLog("USER_UPSERT", "Starting user upsert", {
    userId: userId?.substring(0, 8) + "...",
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
  });

  try {
    // Check if user already exists
    const existingUser = await storage.getUser(userId);
    
    if (existingUser) {
      authLog("USER_UPSERT", "Existing user found", {
        userId: userId?.substring(0, 8) + "...",
        username: existingUser.username,
      });
    } else {
      authLog("USER_UPSERT", "New user - will generate username", {
        userId: userId?.substring(0, 8) + "...",
      });
    }
    
    // Only generate a new random username for new users (not on updates)
    const username = existingUser?.username || generateUsername();
    
    await storage.upsertUser({
      id: userId,
      email: claims["email"],
      firstName: claims["first_name"],
      lastName: claims["last_name"],
      profileImageUrl: claims["profile_image_url"],
      username,
    });

    authLog("USER_UPSERT", "User upsert completed successfully", {
      userId: userId?.substring(0, 8) + "...",
      username,
      isNewUser: !existingUser,
    });
  } catch (error: any) {
    authLog("USER_UPSERT", "User upsert FAILED", {
      userId: userId?.substring(0, 8) + "...",
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

export async function setupAuth(app: Express) {
  authLog("SETUP", "Starting authentication setup");
  
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  authLog("SETUP", "Passport initialized");

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    authLog("VERIFY", "Starting verify callback");
    
    try {
      const claims = tokens.claims();
      authLog("VERIFY", "Token claims received", {
        sub: claims?.sub?.substring(0, 8) + "...",
        email: claims?.email,
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
      });

      const user = {};
      updateUserSession(user, tokens);
      await upsertUser(claims);
      
      authLog("VERIFY", "Verify callback completed successfully");
      verified(null, user);
    } catch (error: any) {
      authLog("VERIFY", "Verify callback FAILED", {
        error: error.message,
        stack: error.stack,
      });
      verified(error, false);
    }
  };

  // Keep track of registered strategies
  const registeredStrategies = new Set<string>();

  // Helper function to ensure strategy exists for a domain
  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    
    if (!registeredStrategies.has(strategyName)) {
      authLog("STRATEGY", "Registering new strategy for domain", {
        domain,
        strategyName,
        callbackURL: `https://${domain}/api/callback`,
      });

      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify,
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
      
      authLog("STRATEGY", "Strategy registered successfully", { domain, strategyName });
    } else {
      authLog("STRATEGY", "Strategy already exists for domain", { domain, strategyName });
    }
  };

  passport.serializeUser((user: Express.User, cb) => {
    authLog("SERIALIZE", "Serializing user", {
      hasUser: !!user,
      userKeys: user ? Object.keys(user) : [],
    });
    cb(null, user);
  });
  
  passport.deserializeUser((user: Express.User, cb) => {
    authLog("DESERIALIZE", "Deserializing user", {
      hasUser: !!user,
      userKeys: user ? Object.keys(user) : [],
    });
    cb(null, user);
  });

  app.get("/api/login", (req, res, next) => {
    const callbackURL = `https://${req.hostname}/api/callback`;
    const protocol = req.protocol;
    const host = req.get('host');
    const fullUrl = `${protocol}://${host}${req.originalUrl}`;
    const userAgent = req.get("user-agent");
    const browserInfo = detectBrowser(userAgent);
    const cookieInfo = analyzeCookies(req.get("cookie"));
    const pwaContext = detectPWAContext(req);
    
    authLog("LOGIN", "Login initiated", {
      hostname: req.hostname,
      protocol,
      host,
      fullUrl,
      callbackURL,
      ip: req.ip,
      browser: browserInfo,
      pwaContext,
      sessionID: req.sessionID,
      hasSession: !!req.session,
      cookieAnalysis: cookieInfo,
      rawCookieHeader: req.get("cookie") ? `[${req.get("cookie")?.length} chars]` : 'NONE',
    });
    
    // Extra Chrome-specific warning
    if (browserInfo.isChrome) {
      authLog("LOGIN", "CHROME DETECTED - Monitoring cookie behavior", {
        chromeVersion: browserInfo.version,
        cookiesReceived: cookieInfo.count,
        hasExistingSession: cookieInfo.hasSession,
        isPWA: pwaContext.isPWA,
      });
    }
    
    // PWA context logging
    if (pwaContext.isPWA) {
      authLog("LOGIN", "PWA CONTEXT DETECTED - Login started from installed app", {
        context: pwaContext.context,
        indicators: pwaContext.indicators,
      });
    }

    // Validate that we can create a callback URL
    if (!req.hostname) {
      authLog("LOGIN", "ERROR: Missing hostname for callback URL", {
        headers: req.headers,
      });
      return res.status(500).send("Server configuration error: cannot determine hostname");
    }

    ensureStrategy(req.hostname);
    
    // Store the login context in session for callback verification
    (req.session as any).loginContext = {
      startedAt: Date.now(),
      browser: browserInfo.browser,
      browserVersion: browserInfo.version,
      isPWA: pwaContext.isPWA,
      context: pwaContext.context,
      sessionID: req.sessionID,
    };
    
    // Ensure session is saved before redirecting to OIDC provider
    // This fixes the race condition where the callback fails on first attempt
    req.session.save((err) => {
      if (err) {
        authLog("LOGIN", "Failed to save session before redirect", { error: err.message });
      } else {
        authLog("LOGIN", "Session saved with login context", {
          loginContext: (req.session as any).loginContext,
        });
      }
      
      passport.authenticate(`replitauth:${req.hostname}`, {
        prompt: "login consent",
        scope: ["openid", "email", "profile", "offline_access"],
      })(req, res, next);
    });
  });

  app.get("/api/callback", (req, res, next) => {
    const callbackURL = `https://${req.hostname}/api/callback`;
    const protocol = req.protocol;
    const host = req.get('host');
    const fullUrl = `${protocol}://${host}${req.originalUrl}`;
    const userAgent = req.get("user-agent");
    const browserInfo = detectBrowser(userAgent);
    const cookieInfo = analyzeCookies(req.get("cookie"));
    const pwaContext = detectPWAContext(req);
    const loginContext = (req.session as any)?.loginContext;
    
    // Sanitize query params - never log sensitive OAuth codes or state
    const sanitizedQuery = {
      ...req.query,
      code: req.query.code ? '[REDACTED]' : undefined,
      state: req.query.state ? '[REDACTED]' : undefined,
    };
    
    authLog("CALLBACK", "OAuth callback received", {
      hostname: req.hostname,
      protocol,
      host,
      fullUrl,
      expectedCallbackURL: callbackURL,
      query: sanitizedQuery,
      browser: browserInfo,
      pwaContext,
      sessionID: req.sessionID,
      hasSession: !!req.session,
      hasLoginContext: !!loginContext,
      loginContext: loginContext || 'MISSING',
      hasError: !!req.query.error,
      error: req.query.error,
      errorDescription: req.query.error_description,
      cookieAnalysis: cookieInfo,
      rawCookieHeader: req.get("cookie") ? `[${req.get("cookie")?.length} chars]` : 'NONE',
    });
    
    // Check for PWA/Browser context mismatch - this is the likely cause of Chrome mobile failures!
    if (loginContext) {
      const contextMismatch = loginContext.isPWA !== pwaContext.isPWA;
      const sessionMismatch = loginContext.sessionID !== req.sessionID;
      
      if (contextMismatch || sessionMismatch) {
        authLog("CALLBACK", "CONTEXT MISMATCH DETECTED - This is likely the auth failure cause!", {
          loginStartedIn: loginContext.context,
          callbackReceivedIn: pwaContext.context,
          loginSessionID: loginContext.sessionID?.substring(0, 20) + '...',
          callbackSessionID: req.sessionID?.substring(0, 20) + '...',
          contextMismatch,
          sessionMismatch,
          timeSinceLogin: Date.now() - loginContext.startedAt,
          explanation: contextMismatch 
            ? "Login started in browser but callback arrived in PWA (or vice versa). These have separate cookie stores!"
            : "Session ID changed between login and callback - session was lost or regenerated.",
        });
      } else {
        authLog("CALLBACK", "Context check passed - same context as login", {
          context: pwaContext.context,
          isPWA: pwaContext.isPWA,
        });
      }
    } else {
      authLog("CALLBACK", "WARNING: No login context found in session!", {
        possibleCauses: [
          "Session was lost during OAuth redirect",
          "Session cookie not sent with callback request",
          "PWA/Browser context mismatch caused different session",
          "Session expired during OAuth flow"
        ],
        hasSessionCookie: cookieInfo.hasSession,
        isPWA: pwaContext.isPWA,
      });
    }
    
    // Chrome-specific callback debugging
    if (browserInfo.isChrome) {
      authLog("CALLBACK", "CHROME CALLBACK - Cookie state analysis", {
        chromeVersion: browserInfo.version,
        cookiesReceived: cookieInfo.count,
        hasSessionCookie: cookieInfo.hasSession,
        sessionIdMatch: cookieInfo.sessionIdPrefix,
        expectedSessionID: req.sessionID?.substring(0, 20) + '...',
        sessionMismatch: cookieInfo.hasSession && cookieInfo.sessionIdPrefix !== (req.sessionID?.substring(0, 20) + '...'),
        isPWA: pwaContext.isPWA,
      });
      
      // Critical: Check if Chrome lost the session cookie between login and callback
      if (!cookieInfo.hasSession) {
        authLog("CALLBACK", "CHROME WARNING: No session cookie received in callback!", {
          possibleCauses: [
            "SameSite cookie policy blocking",
            "Third-party cookie blocking", 
            "Cookie expired or cleared",
            "Cross-domain redirect issue",
            "PWA and Browser have separate cookie stores - LOGIN IN SAME CONTEXT AS APP"
          ],
          isPWA: pwaContext.isPWA,
        });
      }
    }

    // Check for OAuth provider errors in query params
    if (req.query.error) {
      authLog("CALLBACK", "OAuth provider returned error", {
        error: req.query.error,
        errorDescription: req.query.error_description,
        errorUri: req.query.error_uri,
      });
      
      // Redirect to error page with details
      return res.redirect(
        `/auth/error?error=${encodeURIComponent(req.query.error as string)}&description=${encodeURIComponent((req.query.error_description as string) || 'Authentication failed')}`
      );
    }

    // Validate hostname
    if (!req.hostname) {
      authLog("CALLBACK", "ERROR: Missing hostname", {
        headers: req.headers,
      });
      return res.redirect('/auth/error?error=server_error&description=Cannot%20determine%20server%20hostname');
    }

    ensureStrategy(req.hostname);
    
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/auth/error?error=auth_failed&description=Authentication%20failed%2C%20please%20try%20again",
    })(req, res, (err: any) => {
      if (err) {
        authLog("CALLBACK", "Authentication FAILED in callback", {
          error: err.message,
          errorName: err.name,
          errorCode: (err as any).code,
          stack: err.stack,
          sessionID: req.sessionID,
        });
        
        // Redirect to error page instead of throwing
        return res.redirect(
          `/auth/error?error=callback_failed&description=${encodeURIComponent(err.message || 'Authentication callback failed')}`
        );
      }
      
      // Log success but don't call next() - Passport already handled the redirect
      authLog("CALLBACK", "Authentication successful, redirecting", {
        sessionID: req.sessionID,
        isAuthenticated: req.isAuthenticated(),
        hasUser: !!req.user,
        userClaims: req.user ? Object.keys((req.user as any).claims || {}) : [],
      });
      // Passport's successReturnToOrRedirect will handle the redirect, we just return
    });
  });

  app.get("/api/logout", (req, res) => {
    const sessionID = req.sessionID;
    const userId = (req.user as any)?.claims?.sub;
    
    authLog("LOGOUT", "Logout initiated", {
      sessionID,
      userId: userId?.substring(0, 8) + "...",
    });

    req.logout((err) => {
      if (err) {
        authLog("LOGOUT", "Logout error", {
          error: err.message,
          stack: err.stack,
        });
      }
      
      authLog("LOGOUT", "Session destroyed, redirecting to OIDC logout");
      
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });

  authLog("SETUP", "Authentication setup completed");
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const path = req.path;
  const sessionID = req.sessionID;

  // DEV MODE BYPASS: Allow testing without OAuth in development
  // Enabled by default in development mode for easier testing on .replit.dev domains
  const isDev = process.env.NODE_ENV === 'development';
  const bypassAuth = process.env.DEV_BYPASS_AUTH !== 'false'; // Enabled by default, set to 'false' to disable
  
  if (isDev && bypassAuth) {
    if (!req.user) {
      // Create a mock dev user session
      const mockUser = {
        claims: {
          sub: 'dev-user-12345678',
          email: 'dev@example.com',
          first_name: 'Dev',
          last_name: 'User',
        },
        expires_at: Math.floor(Date.now() / 1000) + 86400, // 24 hours from now
        access_token: 'dev-mock-token',
        refresh_token: 'dev-mock-refresh',
      };
      
      req.user = mockUser;
      
      // Only upsert user once per session using a session flag
      // This prevents 200-400ms overhead on EVERY request
      if (!(req.session as any).userHydrated) {
        try {
          await upsertUser(mockUser.claims);
          (req.session as any).userHydrated = true;
        } catch (error) {
          console.error('[DEV_BYPASS] Failed to create dev user:', error);
        }
        console.log('[DEV_BYPASS] Dev mode auth bypass active - using mock user');
      }
    }
    return next();
  }

  authLog("AUTH_CHECK", "Checking authentication", {
    path,
    sessionID,
    isAuthenticated: req.isAuthenticated(),
    hasUser: !!req.user,
  });

  if (!req.isAuthenticated() || !req.user) {
    authLog("AUTH_CHECK", "Not authenticated - no session or user", {
      path,
      sessionID,
      isAuthenticated: req.isAuthenticated(),
      hasUser: !!req.user,
    });
    return res.status(401).json({ message: "Unauthorized" });
  }

  const user = req.user as any;

  if (!user.expires_at) {
    authLog("AUTH_CHECK", "No expiration time in user session", {
      path,
      sessionID,
      userKeys: Object.keys(user),
    });
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  const timeUntilExpiry = user.expires_at - now;

  authLog("AUTH_CHECK", "Token expiration check", {
    path,
    now,
    expiresAt: user.expires_at,
    timeUntilExpiry,
    isExpired: now > user.expires_at,
  });

  if (now <= user.expires_at) {
    authLog("AUTH_CHECK", "Token still valid", {
      path,
      timeUntilExpiry,
    });
    return next();
  }

  authLog("AUTH_CHECK", "Token expired, attempting refresh", {
    path,
    hasRefreshToken: !!user.refresh_token,
  });

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    authLog("AUTH_CHECK", "No refresh token available", { path });
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    authLog("TOKEN_REFRESH", "Starting token refresh", { path });
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    
    authLog("TOKEN_REFRESH", "Token refresh successful", {
      path,
      newExpiresAt: user.expires_at,
    });
    
    return next();
  } catch (error: any) {
    authLog("TOKEN_REFRESH", "Token refresh FAILED", {
      path,
      error: error.message,
      stack: error.stack,
    });
    return res.status(401).json({ message: "Unauthorized" });
  }
};

// Optional authentication middleware - populates req.user if authenticated but doesn't reject
export const optionalAuth: RequestHandler = async (req, res, next) => {
  const isDev = process.env.NODE_ENV === 'development';
  const bypassAuth = process.env.DEV_BYPASS_AUTH !== 'false';
  
  // In dev mode, populate mock user
  if (isDev && bypassAuth && !req.user) {
    const mockUser = {
      claims: {
        sub: 'dev-user-12345678',
        email: 'dev@example.com',
        first_name: 'Dev',
        last_name: 'User',
      },
      expires_at: Math.floor(Date.now() / 1000) + 86400,
      access_token: 'dev-mock-token',
      refresh_token: 'dev-mock-refresh',
    };
    
    req.user = mockUser;
    
    // Only upsert user once per session using a session flag
    // This prevents 200-400ms overhead on EVERY request
    if (!(req.session as any).userHydrated) {
      try {
        await upsertUser(mockUser.claims);
        (req.session as any).userHydrated = true;
      } catch (error) {
        console.error('[DEV_BYPASS] Failed to create dev user:', error);
      }
    }
  }
  
  // Continue regardless of authentication status
  next();
};
