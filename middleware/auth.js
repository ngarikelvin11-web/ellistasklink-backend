// middleware/auth.js
import jwt from "jsonwebtoken";
import supabase from "../supabase.js";

// ─── VERIFY JWT TOKEN ─────────────────────────────────────────────────────────
// Usage: router.get("/protected", authenticateToken, handler)
// Sets req.user = { id, email, iat, exp }
export function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    return res.status(401).json({ message: "Authorization header missing" });
  }

  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authorization header must start with Bearer" });
  }

  const token = authHeader.split(" ")[1];

  if (!token || token === "undefined" || token === "null") {
    return res.status(401).json({ message: "Access token missing or invalid" });
  }

  const secret = process.env.JWT_SECRET;

  if (!secret) {
    console.error("CRITICAL: JWT_SECRET environment variable is not set");
    return res.status(500).json({ message: "Server configuration error" });
  }

  jwt.verify(token, secret, (err, decoded) => {
    if (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(403).json({ message: "Token has expired. Please log in again." });
      }
      if (err.name === "JsonWebTokenError") {
        return res.status(403).json({ message: "Invalid token. Please log in again." });
      }
      return res.status(403).json({ message: "Token verification failed" });
    }

    req.user = decoded;
    next();
  });
}

// ─── REQUIRE PAID MEMBERSHIP ──────────────────────────────────────────────────
// Usage: router.post("/tasks/start", authenticateToken, requireMembership, handler)
// Sets req.userProfile = { id, email, full_name, membership_paid }
export async function requireMembership(req, res, next) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("id, email, full_name, membership_paid")
      .eq("id", userId)
      .maybeSingle();

    if (error || !user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.membership_paid) {
      return res.status(403).json({
        message: "Membership required",
        code:    "MEMBERSHIP_REQUIRED",
        hint:    "Please complete your KES 200 payment to access tasks",
      });
    }

    req.userProfile = user;
    next();
  } catch (error) {
    console.error("❌ Membership check error:", error.message);
    return res.status(500).json({ message: "Server error during membership check" });
  }
}

// ─── REQUIRE ADMIN ────────────────────────────────────────────────────────────
// Usage: router.get("/admin/stats", authenticateToken, requireAdmin, handler)
// Sets req.adminUser = { id, email, is_admin }
export async function requireAdmin(req, res, next) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("id, email, is_admin")
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
    console.error("❌ Admin check error:", error.message);
    return res.status(500).json({ message: "Server error during admin check" });
  }
}
