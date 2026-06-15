import dotenv from "dotenv";
dotenv.config();

import express from "express";
import supabase from "../supabase.js";

const router = express.Router();

// Mounted at: app.use("/api/user", referralRoutes)
// Final URLs:
//   GET  /api/user/referrals/:email
//   POST /api/user/track

const REFERRAL_BONUS = 120;

router.get("/referrals/:email", async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase().trim();

    const { data: user } = await supabase
      .from("users")
      .select("referral_code, full_name")
      .eq("email", email)
      .maybeSingle();

    const { data: referrals, error } = await supabase
      .from("referrals")
      .select("*")
      .eq("referrer_email", email)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    const completed = referrals?.filter((r) => r.status === "completed") || [];
    const pending   = referrals?.filter((r) => r.status === "pending")   || [];

    return res.status(200).json({
      referral_code:       user?.referral_code || null,
      referral_link:       `https://ellis-ai-hub.lovable.app/register?ref=${user?.referral_code}`,
      total_referrals:     referrals?.length || 0,
      completed_referrals: completed.length,
      pending_referrals:   pending.length,
      total_earned:        completed.length * REFERRAL_BONUS,
      referrals:           referrals || [],
    });
  } catch (error) {
    console.error("❌ Get referrals error:", error.message);
    return res.status(500).json({ message: "Failed to fetch referrals" });
  }
});

router.post("/track", async (req, res) => {
  try {
    const { referrer_code, referred_email } = req.body;

    if (!referrer_code || !referred_email) {
      return res.status(400).json({ message: "referrer_code and referred_email are required" });
    }

    const { data: referrer } = await supabase
      .from("users")
      .select("email")
      .eq("referral_code", referrer_code)
      .maybeSingle();

    if (!referrer) {
      return res.status(404).json({ message: "Invalid referral code" });
    }

    const { data: existing } = await supabase
      .from("referrals")
      .select("*")
      .eq("referred_email", referred_email)
      .maybeSingle();

    if (existing) {
      return res.status(200).json({ message: "Referral already tracked" });
    }

    const { data, error } = await supabase
      .from("referrals")
      .insert([{
        referrer_email: referrer.email,
        referred_email,
        status:         "pending",
        bonus_amount:   REFERRAL_BONUS,
      }])
      .select()
      .single();

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    console.log(`✅ Referral tracked: ${referrer.email} → ${referred_email}`);
    return res.status(200).json({ message: "Referral tracked successfully", referral: data });
  } catch (error) {
    console.error("❌ Track referral error:", error.message);
    return res.status(500).json({ message: "Failed to track referral" });
  }
});

export default router;