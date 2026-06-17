// routes/auth.js
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import supabase from "../supabase.js";

const router = express.Router();

// Generate unique referral code
function generateReferralCode(fullName) {
  const clean = (fullName || "USER").replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 6);
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${clean}${random}`;
}

// ─── REGISTER ────────────────────────────────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { fullName, email, password, phone, country, referredBy } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ message: "fullName, email, and password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Check existing
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (existingUser) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate UNIQUE referral code
    let referralCode = generateReferralCode(fullName);
    let attempts = 0;
    while (attempts < 5) {
      const { data: codeExists } = await supabase
        .from("users")
        .select("id")
        .eq("referral_code", referralCode)
        .maybeSingle();

      if (!codeExists) break;
      referralCode = generateReferralCode(fullName);
      attempts++;
    }

    // Insert user
    const { data: newUser, error: insertError } = await supabase
      .from("users")
      .insert([{
        full_name:        fullName.trim(),
        email:            cleanEmail,
        password:         hashedPassword,
        phone:            phone || null,
        country:          country || "KE",
        referral_code:    referralCode,
        referred_by:      referredBy || null,
        membership_paid:  false,
        task_access_paid: false,
        is_admin:         false,
        balance:          0,
      }])
      .select("id, email, full_name, referral_code, phone, country")
      .single();

    if (insertError) {
      console.error("❌ Insert user error:", insertError.message);
      return res.status(500).json({ message: insertError.message });
    }

    // Create wallet (all zeros)
    await supabase.from("wallets").insert([{
      user_email:          cleanEmail,
      balance:             0,
      total_earnings:      0,
      pending_earnings:    0,
      completed_earnings:  0,
      platform_balance:    0,
      referral_earned:     0,
      total_withdrawn:     0,
      membership_paid:     false,
      task_access_paid:    false,
    }]);

    // Track referral (if applicable)
    if (referredBy) {
      const { data: referrer } = await supabase
        .from("users")
        .select("email")
        .eq("referral_code", referredBy)
        .maybeSingle();

      if (referrer) {
        await supabase.from("referrals").insert([{
          referrer_email:  referrer.email,
          referred_email:  cleanEmail,
          status:          "pending",  // becomes "completed" after payment
          bonus_amount:    100,
          referrer_earns:  70,
          platform_keeps:  30,
        }]);
        console.log(`✅ Referral recorded: ${referrer.email} → ${cleanEmail}`);
      }
    }

    // Sign JWT
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ message: "Server configuration error" });
    }

    const token = jwt.sign(
      { id: newUser.id, email: newUser.email },
      secret,
      { expiresIn: "30d" }
    );

    console.log(`✅ New user registered: ${cleanEmail} (code: ${referralCode})`);

    return res.status(201).json({
      message:       "Account created successfully",
      token,
      user:          newUser,
      referral_code: referralCode,
      referral_link: `https://ellis-ai-hub.lovable.app/register?ref=${referralCode}`,
    });
  } catch (error) {
    console.error("❌ Register error:", error.message);
    return res.status(500).json({ message: "Registration failed. Please try again." });
  }
});

// ─── LOGIN ───────────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const cleanEmail = email.toLowerCase().trim();

    const { data: user, error: fetchError } = await supabase
      .from("users")
      .select("*")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (fetchError || !user) {
      return res.status(404).json({ message: "No account found with this email" });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: "Incorrect password" });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ message: "Server configuration error" });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      secret,
      { expiresIn: "30d" }
    );

    const { password: _, ...safeUser } = user;

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

// ─── ME ──────────────────────────────────────────────────────────────────────
router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Missing token" });
    }

    const token = authHeader.split(" ")[1];
    const secret = process.env.JWT_SECRET;
    if (!secret) return res.status(500).json({ message: "Server config error" });

    const decoded = jwt.verify(token, secret);

    const { data: user, error } = await supabase
      .from("users")
      .select("id, full_name, email, phone, country, referral_code, referred_by, membership_paid, task_access_paid, is_admin, created_at")
      .eq("id", decoded.id)
      .maybeSingle();

    if (error || !user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json(user);
  } catch (error) {
    return res.status(403).json({ message: "Invalid token" });
  }
});

export default router;
