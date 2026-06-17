// routes/referrals.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import supabase from "../supabase.js";

const router = express.Router();

router.get("/referrals/:email", async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase().trim();

    const { data: user } = await supabase
      .from("users")
      .select("referral_code, full_name")
      .eq("email", email)
      .maybeSingle();

    const { data: referrals } = await supabase
      .from("referrals")
      .select("*")
      .eq("referrer_email", email)
      .order("created_at", { ascending: false });

    const completed = referrals?.filter((r) => r.status === "completed") || [];
    const pending   = referrals?.filter((r) => r.status === "pending")   || [];

    // Calculate total earned
    const { data: wallet } = await supabase
      .from("wallets")
      .select("referral_earned")
      .eq("user_email", email)
      .maybeSingle();

    return res.status(200).json({
      referral_code:        user?.referral_code || null,
      referral_link:        user?.referral_code
        ? `https://ellis-ai-hub.lovable.app/register?ref=${user.referral_code}`
        : null,
      total_referrals:      referrals?.length || 0,
      completed_referrals:  completed.length,
      pending_referrals:    pending.length,
      total_earned:         Number(wallet?.referral_earned) || 0,
      referrals:            referrals || [],
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch referrals" });
  }
});

router.post("/track", async (req, res) => {
  // Same as before — no changes needed
  const { referrer_code, referred_email } = req.body;

  if (!referrer_code || !referred_email) {
    return res.status(400).json({ message: "referrer_code and referred_email are required" });
  }

  const { data: referrer } = await supabase
    .from("users")
    .select("email")
    .eq("referral_code", referrer_code)
    .maybeSingle();

  if (!referrer) return res.status(404).json({ message: "Invalid referral code" });

  const { data: existing } = await supabase
    .from("referrals")
    .select("*")
    .eq("referred_email", referred_email.toLowerCase().trim())
    .maybeSingle();

  if (existing) return res.status(200).json({ message: "Referral already tracked" });

  const { data, error } = await supabase
    .from("referrals")
    .insert([{
      referrer_email:  referrer.email,
      referred_email:  referred_email.toLowerCase().trim(),
      status:          "pending",
      bonus_amount:    100,
      referrer_earns:  70,
      platform_keeps:  30,
    }])
    .select()
    .single();

  if (error) return res.status(400).json({ message: error.message });

  return res.status(200).json({ message: "Referral tracked", referral: data });
});

export default router;
