import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import supabase from "../supabase.js";

const router = express.Router();

// Mounted at: app.use("/api/auth", authRoutes)
// Final URLs:
//   POST /api/auth/register
//   POST /api/auth/login
//   GET  /api/auth/me

// ─── REGISTER ─────────────────────────────────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { fullName, email, password, referredBy } = req.body;

    // ── Validation ────────────────────────────────────────────────────────────
    if (!fullName || !email || !password) {
      return res.status(400).json({ message: "fullName, email, and password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const cleanEmail = email.toLowerCase().trim();

    // ── Check for existing account ────────────────────────────────────────────
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (existingUser) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }

    // ── Hash password + generate referral code ────────────────────────────────
    const hashedPassword = await bcrypt.hash(password, 10);

    const referralCode =
      fullName.replace(/\s+/g, "").toUpperCase().slice(0, 8) +
      Math.floor(1000 + Math.random() * 9000);

    // ── Insert user ───────────────────────────────────────────────────────────
    const { data: newUser, error: insertError } = await supabase
      .from("users")
      .insert([{
        full_name:       fullName.trim(),
        email:           cleanEmail,
        password:        hashedPassword,
        referral_code:   referralCode,
        referred_by:     referredBy || null,
        membership_paid: false,
        balance:         0,
      }])
      .select("id, email, full_name, referral_code")
      .single();

    if (insertError) {
      console.error("❌ Insert user error:", insertError.message);
      return res.status(500).json({ message: insertError.message });
    }

    // ── Create wallet row for new user ────────────────────────────────────────
    await supabase.from("wallets").insert([{
      user_email:         cleanEmail,
      balance:            0,
      total_earnings:     0,
      pending_earnings:   0,
      completed_earnings: 0,
    }]);

    // ── Record referral if a valid referral code was provided ─────────────────
    if (referredBy) {
      const { data: referrer } = await supabase
        .from("users")
        .select("id, email")
        .eq("referral_code", referredBy)
        .maybeSingle();

      if (referrer) {
        await supabase.from("referrals").insert([{
          referrer_email: referrer.email,
          referred_email: cleanEmail,
          status:         "pending",
          bonus_amount:   120,
        }]);
        console.log(`✅ Referral recorded: ${referrer.email} → ${cleanEmail}`);
      }
    }

    console.log(`✅ New user registered: ${cleanEmail}`);
    return res.status(201).json({
      message:       "Account created successfully",
      referral_code: newUser.referral_code,
    });
  } catch (error) {
    console.error("❌ Register error:", error.message);
    return res.status(500).json({ message: "Registration failed. Please try again." });
  }
});

// ─── LOGIN ────────────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const cleanEmail = email.toLowerCase().trim();

    // ── Find user ─────────────────────────────────────────────────────────────
    const { data: user, error: fetchError } = await supabase
      .from("users")
      .select("*")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (fetchError) {
      console.error("❌ Login fetch error:", fetchError.message);
      return res.status(500).json({ message: "Login failed. Please try again." });
    }

    if (!user) {
      return res.status(404).json({ message: "No account found with this email" });
    }

    // ── Verify password ───────────────────────────────────────────────────────
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ message: "Incorrect password" });
    }

    // ── Sign JWT ──────────────────────────────────────────────────────────────
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      console.error("CRITICAL: JWT_SECRET is not set");
      return res.status(500).json({ message: "Server configuration error" });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      secret,
      { expiresIn: "7d" }
    );

    // ── Return safe user (no password) ────────────────────────────────────────
    const { password: _removed, ...safeUser } = user;

    console.log(`✅ Login successful: ${cleanEmail}`);
    return res.status(200).json({
      message: "Login successful",
      token,
      user:    safeUser,
    });
  } catch (error) {
    console.error("❌ Login error:", error.message);
    return res.status(500).json({ message: "Login failed. Please try again." });
  }
});

// ─── GET CURRENT USER (token check) ──────────────────────────────────────────
router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers["authorization"];

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authorization header missing or malformed" });
    }

    const token = authHeader.split(" ")[1];

    if (!token || token === "undefined" || token === "null") {
      return res.status(401).json({ message: "Access token missing or invalid" });
    }

    const secret = process.env.JWT_SECRET;

    if (!secret) {
      return res.status(500).json({ message: "Server configuration error" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, secret);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(403).json({ message: "Token has expired. Please log in again." });
      }
      return res.status(403).json({ message: "Invalid token. Please log in again." });
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("id, full_name, email, referral_code, membership_paid, balance, created_at")
      .eq("id", decoded.id)
      .maybeSingle();

    if (error || !user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json(user);
  } catch (error) {
    console.error("❌ /me error:", error.message);
    return res.status(403).json({ message: "Invalid or expired token" });
  }
});

export default router;