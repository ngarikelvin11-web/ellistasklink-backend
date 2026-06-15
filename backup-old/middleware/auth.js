import jwt from "jsonwebtoken";
import supabase from "../../supabase.js";

// ─── VERIFY JWT TOKEN ─────────────────────────────────────────────────────────

export function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Access token required" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Invalid or expired token" });
    }
    req.user = user;
    next();
  });
}

// ─── REQUIRE PAID MEMBERSHIP ──────────────────────────────────────────────────

export async function requireMembership(req, res, next) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("membership_paid, email, full_name")
      .eq("id", userId)
      .maybeSingle();

    if (error || !user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.membership_paid) {
      return res.status(403).json({
        message: "Membership required",
        code: "MEMBERSHIP_REQUIRED",
        hint: "Please complete payment to access this feature",
      });
    }

    // Attach full user info for downstream use
    req.userProfile = user;
    next();
  } catch (error) {
    console.error("Membership check error:", error);
    return res.status(500).json({ message: "Server error during membership check" });
  }
}

// ─── REQUIRE ADMIN ROLE ───────────────────────────────────────────────────────

export async function requireAdmin(req, res, next) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("is_admin, email")
      .eq("id", userId)
      .maybeSingle();

    if (error || !user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.is_admin) {
      return res.status(403).json({ message: "Admin access required" });
    }

    req.adminUser = user;
    next();
  } catch (error) {
    console.error("Admin check error:", error);
    return res.status(500).json({ message: "Server error during admin check" });
  }
}