// routes/user.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import supabase from "../supabase.js";

const router = express.Router();

router.get("/profile/:email", async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase().trim();

    const { data: user } = await supabase
      .from("users")
      .select("id, email, full_name, phone, country, membership_paid, task_access_paid, referral_code, is_admin, created_at")
      .eq("email", email)
      .maybeSingle();

    if (!user) return res.status(404).json({ message: "User not found" });
    return res.status(200).json({ user });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch profile" });
  }
});

router.get("/test", (req, res) => res.status(200).json({ message: "user routes working ✅" }));

export default router;
