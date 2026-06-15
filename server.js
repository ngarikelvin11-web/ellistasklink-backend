import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";

// ─── ROUTE IMPORTS ───────────────────────────────────────────────────────────
import authRoutes      from "./routes/auth.js";
import paymentRoutes   from "./routes/payments.js";
import taskRoutes      from "./routes/tasks.js";
import userRoutes      from "./routes/user.js";
import walletRoutes    from "./routes/wallets.js";
import referralRoutes  from "./routes/referrals.js";
import withdrawalRoutes from "./routes/withdrawals.js";
import adminRoutes     from "./routes/admin.js";

// ─── APP SETUP ───────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 5000;

console.log("✅ Server file loaded");

// ─── MIDDLEWARE ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  return res.status(200).json({
    message: "EllisTaskLink Backend Running",
    version: "5.0.0",
    status:  "healthy",
    routes: {
      auth:        "/api/auth/register  |  /api/auth/login  |  /api/auth/me",
      tasks:       "/api/tasks  |  /api/tasks/start  |  /api/tasks/complete  |  /api/tasks/user/:email",
      wallet:      "/api/user/wallet/:email",
      referrals:   "/api/user/referrals/:email  |  /api/user/track",
      withdrawals: "/api/withdrawals/request  |  /api/withdrawals/:email",
      payments:    "/api/payments/create  |  /api/payments/token  |  /api/payments/callback",
      admin:       "/api/admin/stats  |  /api/admin/users  |  /api/admin/withdrawals",
    },
  });
});

// ─── API ROUTES ──────────────────────────────────────────────────────────────
//
//  Mount point          File             Final URLs produced
//  -------------------  ---------------  ------------------------------------------
//  /api/auth            auth.js          /api/auth/register, /api/auth/login, /api/auth/me
//  /api/payments        payments.js      /api/payments/create, /api/payments/token …
//  /api/tasks           tasks.js         /api/tasks, /api/tasks/start, /api/tasks/complete, /api/tasks/user/:email
//  /api/user            user.js          /api/user/profile/:email, /api/user/test
//  /api/user            wallets.js       /api/user/wallet/:email
//  /api/user            referrals.js     /api/user/referrals/:email, /api/user/track
//  /api/withdrawals     withdrawals.js   /api/withdrawals/request, /api/withdrawals/:email
//  /api/admin           admin.js         /api/admin/stats, /api/admin/users …

app.use("/api/auth",        authRoutes);
app.use("/api/payments",    paymentRoutes);
app.use("/api/tasks",       taskRoutes);
app.use("/api/user",        userRoutes);
app.use("/api/user",        walletRoutes);
app.use("/api/user",        referralRoutes);
app.use("/api/withdrawals", withdrawalRoutes);
app.use("/api/admin",       adminRoutes);

// ─── 404 HANDLER ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  return res.status(404).json({
    message: "Route not found",
    path:    req.originalUrl,
  });
});

// ─── GLOBAL ERROR HANDLER ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err);
  return res.status(500).json({ message: "Internal server error", error: err.message });
});

// ─── START SERVER ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  const envVars = [
    process.env.JWT_SECRET,
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY,
    process.env.PESAPAL_CONSUMER_KEY,
    process.env.PESAPAL_CONSUMER_SECRET,
    process.env.PESAPAL_IPN_ID,
    process.env.PESAPAL_CALLBACK_URL,
  ];
  const loadedCount = envVars.filter(Boolean).length;

  console.log(`◇ injected env (${loadedCount}) from .env`);
  console.log(`🚀 EllisTaskLink server running on port ${PORT}`);
  console.log("──────────────────────────────────────");
  console.log("version:                 5.0.0");
  console.log("JWT_SECRET loaded:      ", !!process.env.JWT_SECRET);
  console.log("SUPABASE_URL loaded:    ", !!process.env.SUPABASE_URL);
  console.log("SUPABASE_KEY loaded:    ", !!process.env.SUPABASE_KEY);
  console.log("PESAPAL_KEY loaded:     ", !!process.env.PESAPAL_CONSUMER_KEY);
  console.log("PESAPAL_SECRET loaded:  ", !!process.env.PESAPAL_CONSUMER_SECRET);
  console.log("PESAPAL_IPN_ID loaded:  ", !!process.env.PESAPAL_IPN_ID);
  console.log("CALLBACK_URL loaded:    ", !!process.env.PESAPAL_CALLBACK_URL);
  console.log("──────────────────────────────────────");
});