// routes/wallets.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import supabase from "../supabase.js";

const router = express.Router();

router.get("/wallet/:email", async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase().trim();

    const { data: wallet } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_email", email)
      .maybeSingle();

    return res.status(200).json({
      user_email:          email,
      balance:             Number(wallet?.balance)             || 0,
      pending_earnings:    Number(wallet?.pending_earnings)    || 0,
      completed_earnings:  Number(wallet?.completed_earnings)  || 0,
      platform_balance:    Number(wallet?.platform_balance)    || 0,
      referral_earned:     Number(wallet?.referral_earned)     || 0,
      total_earnings:      Number(wallet?.total_earnings)      || 0,
      total_withdrawn:     Number(wallet?.total_withdrawn)     || 0,
      membership_paid:     wallet?.membership_paid              || false,
      task_access_paid:    wallet?.task_access_paid             || false,
      currency:            "KES",
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch wallet" });
  }
});

export default router;
