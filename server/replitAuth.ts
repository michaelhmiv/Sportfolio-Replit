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
  
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
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
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      maxAge: sessionTtl,
    },
  };

  authLog("SESSION", "Session configuration created", {
    ttl: sessionTtl,
    secure: sessionConfig.cookie.secure,
    sameSite: sessionConfig.cookie.sameSite,
    httpOnly: sessionConfig.cookie.httpOnly,
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
    authLog("LOGIN", "Login initiated", {
      hostname: req.hostname,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      sessionID: req.sessionID,
    });

    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    // Sanitize query params - never log sensitive OAuth codes or state
    const sanitizedQuery = {
      ...req.query,
      code: req.query.code ? '[REDACTED]' : undefined,
      state: req.query.state ? '[REDACTED]' : undefined,
    };
    
    authLog("CALLBACK", "OAuth callback received", {
      hostname: req.hostname,
      query: sanitizedQuery,
      sessionID: req.sessionID,
      hasError: !!req.query.error,
      errorDescription: req.query.error_description,
    });

    ensureStrategy(req.hostname);
    
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, (err: any) => {
      if (err) {
        authLog("CALLBACK", "Authentication FAILED in callback", {
          error: err.message,
          stack: err.stack,
        });
        return next(err);
      }
      
      authLog("CALLBACK", "Authentication successful, redirecting", {
        sessionID: req.sessionID,
        isAuthenticated: req.isAuthenticated(),
      });
      next();
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
