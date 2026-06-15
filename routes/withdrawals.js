import dotenv from "dotenv";
dotenv.config();

import express from "express";
import supabase from "../supabase.js";

const router = express.Router();

// Mounted at: app.use("/api/withdrawals", withdrawalRoutes)
// Final URLs:
//   POST /api/withdrawals/request
//   GET  /api/withdrawals/:email

const MIN_WITHDRAWAL  = 300;  // KES — updated from 500
const WITHDRAWAL_FEE  = 40;   // KES platform fee per withdrawal

// ─── REQUEST WITHDRAWAL ──────────────────────────────────────────────────────
router.post("/request", async (req, res) => {
  try {
    const { user_email, amount, phone_number, method = "mpesa" } = req.body;

    if (!user_email || !amount || !phone_number) {
      return res.status(400).json({
        message: "user_email, amount and phone_number are required",
      });
    }

    const numAmount = Number(amount);

    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ message: "Amount must be a positive number" });
    }

    if (numAmount < MIN_WITHDRAWAL) {
      return res.status(400).json({
        message: `Minimum withdrawal is KES ${MIN_WITHDRAWAL}`,
      });
    }

    // Fetch wallet
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("balance, pending_earnings")
      .eq("user_email", user_email)
      .maybeSingle();

    if (walletError) {
      return res.status(500).json({ message: walletError.message });
    }

    if (!wallet || wallet.balance < numAmount) {
      return res.status(400).json({
        message: `Insufficient balance. Available: KES ${wallet?.balance || 0}`,
      });
    }

    // Deduct balance immediately and move to pending
    const { error: updateError } = await supabase
      .from("wallets")
      .update({
        balance:          wallet.balance - numAmount,
        pending_earnings: (wallet.pending_earnings || 0) + numAmount,
        updated_at:       new Date().toISOString(),
      })
      .eq("user_email", user_email);

    if (updateError) {
      return res.status(500).json({ message: updateError.message });
    }

    // Create withdrawal record (net after fee deducted on payout by admin)
    const { data, error } = await supabase
      .from("withdrawals")
      .insert([{
        user_email,
        amount:       numAmount,
        fee:          WITHDRAWAL_FEE,
        net_amount:   numAmount - WITHDRAWAL_FEE,
        method,
        phone_number,
        status:       "pending",
      }])
      .select()
      .single();

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    console.log(`✅ Withdrawal requested: KES ${numAmount} (net KES ${numAmount - WITHDRAWAL_FEE}) for ${user_email}`);
    return res.status(200).json({
      message:    "Withdrawal request submitted successfully",
      withdrawal: data,
      note:       `A KES ${WITHDRAWAL_FEE} processing fee will be deducted. You will receive KES ${numAmount - WITHDRAWAL_FEE}.`,
    });
  } catch (error) {
    console.error("❌ Withdrawal request error:", error.message);
    return res.status(500).json({ message: "Failed to submit withdrawal" });
  }
});

// ─── GET USER WITHDRAWALS ────────────────────────────────────────────────────
router.get("/:email", async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase().trim();

    const { data, error } = await supabase
      .from("withdrawals")
      .select("*")
      .eq("user_email", email)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    return res.status(200).json({ withdrawals: data || [] });
  } catch (error) {
    console.error("❌ Get withdrawals error:", error.message);
    return res.status(500).json({ message: "Failed to fetch withdrawals" });
  }
});

export default router;