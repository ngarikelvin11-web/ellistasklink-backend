// server.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";

import authRoutes       from "./routes/auth.js";
import paymentRoutes    from "./routes/payments.js";
import taskRoutes       from "./routes/tasks.js";
import userRoutes       from "./routes/user.js";
import walletRoutes     from "./routes/wallets.js";
import referralRoutes   from "./routes/referrals.js";
import withdrawalRoutes from "./routes/withdrawals.js";
import adminRoutes      from "./routes/admin.js";

const app  = express();
const PORT = process.env.PORT || 5000;

console.log("✅ Server file loaded");

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// REQUEST LOGGER
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.originalUrl}`);
  next();
});

app.get("/", (req, res) => {
  return res.status(200).json({
    message: "EllisTaskLink Backend Running",
    version: "5.0.2",
    status:  "healthy",
    time:    new Date().toISOString(),
  });
});

// Mount routes
app.use("/api/auth",        authRoutes);
app.use("/api/payments",    paymentRoutes);
app.use("/api/tasks",       taskRoutes);
app.use("/api/user",        userRoutes);
app.use("/api/user",        walletRoutes);
app.use("/api/user",        referralRoutes);
app.use("/api/withdrawals", withdrawalRoutes);
app.use("/api/admin",       adminRoutes);

// 404
app.use((req, res) => {
  console.log(`❌ 404: ${req.method} ${req.originalUrl}`);
  return res.status(404).json({
    message: "Route not found",
    path:    req.originalUrl,
    hint:    "Make sure email is URL-encoded (e.g. %40 for @)",
  });
});

app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err);
  return res.status(500).json({ message: "Internal server error", error: err.message });
});

app.listen(PORT, () => {
  console.log(`🚀 EllisTaskLink server running on port ${PORT}`);
});
