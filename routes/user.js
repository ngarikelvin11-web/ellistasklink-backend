import express from "express";
import supabase from "../supabase.js";

const router = express.Router();

// Mounted at: app.use("/api/user", userRoutes)
// Final URLs:
//   GET /api/user/test
//   GET /api/user/profile/:email

console.log("✅ User routes loaded");

// ─── TEST ─────────────────────────────────────────────────────────────────────
router.get("/test", (req, res) => {
  return res.status(200).json({ message: "User routes working ✅" });
});

// ─── GET USER PROFILE ─────────────────────────────────────────────────────────
router.get("/profile/:email", async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase().trim();

    const { data, error } = await supabase
      .from("users")
      .select("id, full_name, email, referral_code, membership_paid, balance, created_at")
      .eq("email", email)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    if (!data) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({ user: data });
  } catch (error) {
    console.error("❌ Profile fetch error:", error.message);
    return res.status(500).json({ message: "Failed to fetch profile" });
  }
});

export default router;