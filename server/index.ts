import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { jobScheduler } from "./jobs/scheduler.js";
import { db } from "./db";
import { botProfiles } from "@shared/schema";
import { sql } from "drizzle-orm";

const serverStartTime = Date.now();
let serverReady = false;

function startupLog(stage: string, message: string) {
  const elapsed = Date.now() - serverStartTime;
  console.log(`[STARTUP +${elapsed}ms] ${stage}: ${message}`);
}

startupLog('INIT', 'Server starting...');

const app = express();

// Health check endpoint - always available, even during startup
app.get('/api/health', (_req, res) => {
  const uptime = Date.now() - serverStartTime;
  res.json({
    status: serverReady ? 'ready' : 'starting',
    uptime,
    uptimeSeconds: Math.floor(uptime / 1000),
    timestamp: new Date().toISOString(),
  });
});

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  startupLog('ROUTES', 'Registering routes...');
  const server = await registerRoutes(app);
  startupLog('ROUTES', 'Routes registered');

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    startupLog('VITE', 'Setting up Vite dev server...');
    await setupVite(app, server);
    startupLog('VITE', 'Vite dev server ready');
  } else {
    startupLog('STATIC', 'Setting up static file serving');
    serveStatic(app);
    startupLog('STATIC', 'Static file serving ready');
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  startupLog('LISTEN', `Starting server on port ${port}...`);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, async () => {
    startupLog('LISTEN', `Server listening on port ${port}`);
    log(`serving on port ${port}`);
    
    // Startup migration: Ensure all bot profiles have unlimited daily limits
    try {
      await db
        .update(botProfiles)
        .set({
          maxDailyOrders: 999999,
          maxDailyVolume: 999999,
        });
      log("Bot profiles updated with unlimited daily limits");
    } catch (error: any) {
      console.error("Failed to update bot profiles:", error.message);
    }
    
    // Always initialize contest jobs (database-only, no API required)
    try {
      await jobScheduler.initializeContestJobs();
      jobScheduler.start();
      log("Contest jobs initialized and started");
    } catch (error: any) {
      console.error("Failed to initialize contest jobs:", error.message);
    }
    
    // Initialize API-dependent jobs only if API key is available
    if (process.env.MYSPORTSFEEDS_API_KEY) {
      try {
        await jobScheduler.initializeApiJobs();
        log("API-dependent jobs initialized and started");
      } catch (error: any) {
        console.error("Failed to initialize API jobs:", error.message);
      }
    } else {
      log("Skipping API-dependent jobs - MYSPORTSFEEDS_API_KEY not set");
      log("Contest jobs will still process data from the database when available");
    }
    
    // Mark server as fully ready
    serverReady = true;
    startupLog('READY', 'Server fully initialized and ready to serve requests');
  });
})();
