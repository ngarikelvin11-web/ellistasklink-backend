import express from "express";
import supabase from "../../supabase.js";
import { authenticateToken, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

// ─── DASHBOARD STATS ──────────────────────────────────────────────────────────

router.get("/stats", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [
      { count: totalUsers },
      { count: paidUsers },
      { count: pendingWithdrawals },
      { count: totalTasks },
      { count: pendingSubmissions },
    ] = await Promise.all([
      supabase.from("users").select("*", { count: "exact", head: true }),
      supabase.from("users").select("*", { count: "exact", head: true }).eq("membership_paid", true),
      supabase.from("withdrawals").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("tasks").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("task_submissions").select("*", { count: "exact", head: true }).eq("status", "pending"),
    ]);

    // Total withdrawn amount
    const { data: withdrawalData } = await supabase
      .from("withdrawals")
      .select("amount")
      .eq("status", "approved");

    const totalWithdrawn = withdrawalData?.reduce((sum, w) => sum + w.amount, 0) || 0;

    return res.json({
      totalUsers,
      paidUsers,
      unpaidUsers: totalUsers - paidUsers,
      pendingWithdrawals,
      totalActiveTasks: totalTasks,
      pendingSubmissions,
      totalWithdrawn,
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ─── LIST ALL USERS ───────────────────────────────────────────────────────────

router.get("/users", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { limit = 50, offset = 0, membership_paid } = req.query;

    let query = supabase
      .from("users")
      .select("id, full_name, email, referral_code, membership_paid, balance, created_at")
      .order("created_at", { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (membership_paid !== undefined) {
      query = query.eq("membership_paid", membership_paid === "true");
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    return res.json(data);
  } catch (error) {
    console.error("Admin users list error:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ─── MANUALLY ACTIVATE MEMBERSHIP ────────────────────────────────────────────

router.post("/users/:email/activate", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { email } = req.params;

    const { error } = await supabase
      .from("users")
      .update({ membership_paid: true })
      .eq("email", email);

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    return res.json({ message: "Membership activated for " + email });
  } catch (error) {
    console.error("Activate membership error:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ─── MANUALLY DEACTIVATE MEMBERSHIP ──────────────────────────────────────────

router.post("/users/:email/deactivate", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { email } = req.params;

    const { error } = await supabase
      .from("users")
      .update({ membership_paid: false })
      .eq("email", email);

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    return res.json({ message: "Membership deactivated for " + email });
  } catch (error) {
    console.error("Deactivate membership error:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ─── LIST ALL WITHDRAWALS ─────────────────────────────────────────────────────

router.get("/withdrawals", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from("withdrawals")
      .select("*")
      .order("created_at", { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    return res.json(data);
  } catch (error) {
    console.error("Admin withdrawals error:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ─── APPROVE WITHDRAWAL ───────────────────────────────────────────────────────

router.post("/withdrawals/:id/approve", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: withdrawal, error: fetchError } = await supabase
      .from("withdrawals")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fetchError || !withdrawal) {
      return res.status(404).json({ message: "Withdrawal not found" });
    }

    if (withdrawal.status !== "pending") {
      return res.status(409).json({ message: "Withdrawal is not pending" });
    }

    const { error } = await supabase
      .from("withdrawals")
      .update({ status: "approved" })
      .eq("id", id);

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    return res.json({ message: "Withdrawal approved" });
  } catch (error) {
    console.error("Approve withdrawal error:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ─── REJECT WITHDRAWAL (refund balance) ──────────────────────────────────────

router.post("/withdrawals/:id/reject", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: withdrawal, error: fetchError } = await supabase
      .from("withdrawals")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fetchError || !withdrawal) {
      return res.status(404).json({ message: "Withdrawal not found" });
    }

    if (withdrawal.status !== "pending") {
      return res.status(409).json({ message: "Withdrawal is not pending" });
    }

    await supabase
      .from("withdrawals")
      .update({ status: "rejected" })
      .eq("id", id);

    // Refund balance back to wallet
    const { data: wallet } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_email", withdrawal.user_email)
      .maybeSingle();

    if (wallet) {
      await supabase
        .from("wallets")
        .update({ balance: wallet.balance + withdrawal.amount })
        .eq("user_email", withdrawal.user_email);
    } else {
      await supabase.from("wallets").insert([
        { user_email: withdrawal.user_email, balance: withdrawal.amount },
      ]);
    }

    return res.json({ message: "Withdrawal rejected and balance refunded" });
  } catch (error) {
    console.error("Reject withdrawal error:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ─── CREDIT USER WALLET MANUALLY ─────────────────────────────────────────────

router.post("/wallet/credit", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { user_email, amount, reason } = req.body;

    if (!user_email || !amount) {
      return res.status(400).json({ message: "user_email and amount are required" });
    }

    if (amount <= 0) {
      return res.status(400).json({ message: "Amount must be positive" });
    }

    const { data: wallet } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_email", user_email)
      .maybeSingle();

    if (wallet) {
      await supabase
        .from("wallets")
        .update({ balance: wallet.balance + amount })
        .eq("user_email", user_email);
    } else {
      await supabase.from("wallets").insert([{ user_email, balance: amount }]);
    }

    console.log(`Admin credited ${amount} KES to ${user_email}. Reason: ${reason || "N/A"}`);

    return res.json({
      message: `Credited ${amount} KES to ${user_email}`,
    });
  } catch (error) {
    console.error("Admin credit wallet error:", error);
    return res.status(500).json({ message: error.message });
  }
});

export default router;