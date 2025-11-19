import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
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
  // Check if user already exists
  const existingUser = await storage.getUser(claims["sub"]);
  
  // Only generate a new random username for new users (not on updates)
  const username = existingUser?.username || generateUsername();
  
  await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
    username,
  });
}

// HTML escape function to prevent XSS
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  // Keep track of registered strategies
  const registeredStrategies = new Set<string>();

  // Helper function to ensure strategy exists for a domain
  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
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
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    console.log("[Auth] Login initiated:", {
      hostname: req.hostname,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      timestamp: new Date().toISOString()
    });

    try {
      ensureStrategy(req.hostname);
      passport.authenticate(`replitauth:${req.hostname}`, {
        prompt: "login consent",
        scope: ["openid", "email", "profile", "offline_access"],
      })(req, res, next);
    } catch (error: any) {
      console.error("[Auth] Login error:", error);
      res.status(500).send(`
        <html>
          <body style="font-family: system-ui; max-width: 600px; margin: 100px auto; padding: 20px; text-align: center;">
            <h2>Authentication Error</h2>
            <p>We encountered an issue starting the login process.</p>
            <p style="color: #666; font-size: 14px;">Error: ${escapeHtml(error?.message || 'Unknown error')}</p>
            <a href="/" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #0066cc; color: white; text-decoration: none; border-radius: 5px;">Return to Home</a>
          </body>
        </html>
      `);
    }
  });

  app.get("/api/callback", (req, res, next) => {
    const startTime = Date.now();
    console.log("[Auth] Callback received:", {
      hostname: req.hostname,
      hasCode: !!req.query.code,
      hasState: !!req.query.state,
      hasError: !!req.query.error,
      error: req.query.error,
      errorDescription: req.query.error_description,
      timestamp: new Date().toISOString()
    });

    // Set timeout to prevent hanging - 30 seconds max
    const timeoutId = setTimeout(() => {
      console.error("[Auth] Callback timeout - exceeded 30 seconds");
      if (!res.headersSent) {
        res.status(504).send(`
          <html>
            <body style="font-family: system-ui; max-width: 600px; margin: 100px auto; padding: 20px; text-align: center;">
              <h2>Authentication Timeout</h2>
              <p>The authentication process took too long to complete.</p>
              <p style="color: #666; font-size: 14px;">Please try again.</p>
              <a href="/api/login" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #0066cc; color: white; text-decoration: none; border-radius: 5px;">Try Again</a>
            </body>
          </html>
        `);
      }
    }, 30000);

    try {
      ensureStrategy(req.hostname);
      
      passport.authenticate(`replitauth:${req.hostname}`, (err: any, user: any, info: any) => {
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;

        if (err) {
          console.error("[Auth] Callback authentication error:", {
            error: err.message,
            stack: err.stack,
            duration: `${duration}ms`
          });
          return res.status(500).send(`
            <html>
              <body style="font-family: system-ui; max-width: 600px; margin: 100px auto; padding: 20px; text-align: center;">
                <h2>Authentication Failed</h2>
                <p>We couldn't complete your sign-in.</p>
                <p style="color: #666; font-size: 14px;">Error: ${escapeHtml(err?.message || 'Unknown error')}</p>
                <a href="/api/login" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #0066cc; color: white; text-decoration: none; border-radius: 5px;">Try Again</a>
              </body>
            </html>
          `);
        }

        if (!user) {
          console.error("[Auth] Callback failed - no user returned:", {
            info,
            duration: `${duration}ms`
          });
          return res.redirect("/api/login");
        }

        // Log in the user and verify session
        req.logIn(user, (loginErr) => {
          if (loginErr) {
            console.error("[Auth] Session creation error:", {
              error: loginErr.message,
              userId: (user as any)?.claims?.sub,
              duration: `${duration}ms`
            });
            return res.status(500).send(`
              <html>
                <body style="font-family: system-ui; max-width: 600px; margin: 100px auto; padding: 20px; text-align: center;">
                  <h2>Session Error</h2>
                  <p>We couldn't create your session. Please try again.</p>
                  <a href="/api/login" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #0066cc; color: white; text-decoration: none; border-radius: 5px;">Try Again</a>
                </body>
              </html>
            `);
          }

          // Verify session is actually saved before redirecting
          req.session.save((saveErr) => {
            if (saveErr) {
              console.error("[Auth] Session save error:", {
                error: saveErr.message,
                userId: (user as any)?.claims?.sub,
                duration: `${duration}ms`
              });
              return res.status(500).send(`
                <html>
                  <body style="font-family: system-ui; max-width: 600px; margin: 100px auto; padding: 20px; text-align: center;">
                    <h2>Session Storage Error</h2>
                    <p>We couldn't save your session. Please try again.</p>
                    <a href="/api/login" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #0066cc; color: white; text-decoration: none; border-radius: 5px;">Try Again</a>
                  </body>
                </html>
              `);
            }

            console.log("[Auth] Callback successful:", {
              userId: (user as any)?.claims?.sub,
              email: (user as any)?.claims?.email,
              duration: `${duration}ms`,
              sessionId: req.sessionID
            });

            // Successfully authenticated - redirect to dashboard
            res.redirect("/");
          });
        });
      })(req, res, next);
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error("[Auth] Callback exception:", {
        error: error.message,
        stack: error.stack
      });
      res.status(500).send(`
        <html>
          <body style="font-family: system-ui; max-width: 600px; margin: 100px auto; padding: 20px; text-align: center;">
            <h2>Unexpected Error</h2>
            <p>Something went wrong during authentication.</p>
            <p style="color: #666; font-size: 14px;">Error: ${escapeHtml(error?.message || 'Unknown error')}</p>
            <a href="/" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #0066cc; color: white; text-decoration: none; border-radius: 5px;">Return to Home</a>
          </body>
        </html>
      `);
    }
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const user = req.user as any;

  if (!user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized" });
  }
};
