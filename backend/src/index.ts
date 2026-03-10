import express from "express";
import { createServer } from "http";
import path from "path";
import fs from "fs";
import { config } from "./config.js";
import { httpsRedirect } from "./middleware/httpsRedirect.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { setupWsProxy } from "./services/wsProxy.js";
import { initDatabase } from "./db/index.js";
import searchRoutes from "./routes/search.js";
import downloadRoutes from "./routes/downloads.js";
import packageRoutes from "./routes/packages.js";
import installRoutes from "./routes/install.js";
import settingsRoutes from "./routes/settings.js";
import bagRoutes from "./routes/bag.js";
import adminPoolRoutes from "./routes/admin/pool.js";
import adminWhitelistRoutes from "./routes/admin/whitelist.js";
import userAppsRoutes from "./routes/user/apps.js";
import poolRoutes from "./routes/pool.js";

const app = express();

// Middleware
app.use(httpsRedirect);
app.use(express.json({ limit: "50mb" }));

// API routes
app.use("/api", searchRoutes);
app.use("/api", downloadRoutes);
app.use("/api", packageRoutes);
app.use("/api", installRoutes);
app.use("/api", settingsRoutes);
app.use("/api", bagRoutes);

// 账号池 API 路由
app.use("/api/pool", poolRoutes);
app.use("/api/admin/pool", adminPoolRoutes);
app.use("/api/admin/whitelist", adminWhitelistRoutes);
app.use("/api/user", userAppsRoutes);

// Serve static frontend files
const publicDir = path.resolve(import.meta.dirname, "../public");
app.use(express.static(publicDir));

// SPA fallback: serve index.html for non-API routes
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) {
    return next();
  }
  const indexPath = path.join(publicDir, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    next();
  }
});

// Error handler (must be last)
app.use(errorHandler);

// Create HTTP server
const server = createServer(app);

// WebSocket proxy for Apple TCP connections
setupWsProxy(server);

// Ensure data directory exists
fs.mkdirSync(config.dataDir, { recursive: true });

// Initialize database
try {
  initDatabase();
  console.log("✅ Database initialized");
} catch (error) {
  console.error("❌ Database initialization failed:", error);
  process.exit(1);
}

server.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
  console.log(`Data directory: ${path.resolve(config.dataDir)}`);
  
  // 检查环境变量配置
  if (!process.env.ACCOUNT_POOL_KEY) {
    console.warn("⚠️  ACCOUNT_POOL_KEY not configured - account pool features disabled");
  }
  if (!process.env.ADMIN_API_KEY) {
    console.warn("⚠️  ADMIN_API_KEY not configured - admin API disabled");
  }
});

export { app, server };
