import dotenv from "dotenv";
dotenv.config();

import express from "express";
import supabase from "../supabase.js";

const router = express.Router();

// Mounted at: app.use("/api/user", walletRoutes)
// Final URL:  GET /api/user/wallet/:email

router.get("/wallet/:email", async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase().trim();

    const { data, error } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_email", email)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    return res.status(200).json(
      data ?? {
        user_email:         email,
        balance:            0,
        total_earnings:     0,
        pending_earnings:   0,
        completed_earnings: 0,
      }
    );
  } catch (error) {
    console.error("❌ Get wallet error:", error.message);
    return res.status(500).json({ message: "Failed to fetch wallet" });
  }
});

export default router;