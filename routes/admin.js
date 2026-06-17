// routes/admin.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import supabase from "../supabase.js";

const router = express.Router();

// Mounted at: app.use("/api/admin", adminRoutes)

// ─── STATS ───────────────────────────────────────────────────────────────────
router.get("/stats", async (req, res) => {
  try {
    const { count: totalUsers } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true });

    const { count: paidUsers } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("membership_paid", true);

    const { count: completedTasks } = await supabase
      .from("user_tasks")
      .select("*", { count: "exact", head: true })
      .eq("status", "completed");

    const { count: pendingWithdrawals } = await supabase
      .from("withdrawals")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    const { data: payments } = await supabase
      .from("payments")
      .select("amount")
      .eq("status", "Completed");

    const totalRevenue = (payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    return res.status(200).json({
      total_users:         totalUsers         || 0,
      paid_users:          paidUsers          || 0,
      completed_tasks:     completedTasks     || 0,
      pending_withdrawals: pendingWithdrawals || 0,
      total_revenue:       totalRevenue,
    });
  } catch (error) {
    console.error("❌ Get stats error:", error.message);
    return res.status(500).json({ message: "Failed to fetch stats" });
  }
});

// ─── GET ALL USERS ────────────────────────────────────────────────────────────
router.get("/users", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, full_name, email, membership_paid, referral_code, is_admin, created_at")
      .order("created_at", { ascending: false });

    if (error) return res.status(400).json({ message: error.message });
    return res.status(200).json({ users: data });
  } catch (error) {
    console.error("❌ Get users error:", error.message);
    return res.status(500).json({ message: "Failed to fetch users" });
  }
});

// ─── GET ALL WITHDRAWALS ──────────────────────────────────────────────────────
router.get("/withdrawals", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("withdrawals")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return res.status(400).json({ message: error.message });
    return res.status(200).json({ withdrawals: data });
  } catch (error) {
    console.error("❌ Get withdrawals error:", error.message);
    return res.status(500).json({ message: "Failed to fetch withdrawals" });
  }
});

// ─── APPROVE WITHDRAWAL ───────────────────────────────────────────────────────
router.post("/withdrawals/approve", async (req, res) => {
  try {
    const { withdrawal_id } = req.body;

    if (!withdrawal_id) {
      return res.status(400).json({ message: "withdrawal_id is required" });
    }

    const { data: withdrawal } = await supabase
      .from("withdrawals")
      .select("*")
      .eq("id", withdrawal_id)
      .single();

    if (!withdrawal) {
      return res.status(404).json({ message: "Withdrawal not found" });
    }

    if (withdrawal.status !== "pending") {
      return res.status(400).json({ message: "Withdrawal already processed" });
    }

    await supabase
      .from("withdrawals")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("id", withdrawal_id);

    const { data: wallet } = await supabase
      .from("wallets")
      .select("pending_earnings")
      .eq("user_email", withdrawal.user_email)
      .maybeSingle();

    if (wallet) {
      const currentPending = Number(wallet.pending_earnings) || 0;
      const newPending     = Math.max(0, currentPending - Number(withdrawal.amount || 0));

      await supabase
        .from("wallets")
        .update({
          pending_earnings: newPending,
          updated_at:       new Date().toISOString(),
        })
        .eq("user_email", withdrawal.user_email);
    }

    console.log(`✅ Withdrawal approved: KES ${withdrawal.amount} for ${withdrawal.user_email}`);
    return res.status(200).json({ message: "Withdrawal approved successfully" });
  } catch (error) {
    console.error("❌ Approve withdrawal error:", error.message);
    return res.status(500).json({ message: "Failed to approve withdrawal" });
  }
});

// ─── REJECT WITHDRAWAL ────────────────────────────────────────────────────────
router.post("/withdrawals/reject", async (req, res) => {
  try {
    const { withdrawal_id } = req.body;

    if (!withdrawal_id) {
      return res.status(400).json({ message: "withdrawal_id is required" });
    }

    const { data: withdrawal } = await supabase
      .from("withdrawals")
      .select("*")
      .eq("id", withdrawal_id)
      .single();

    if (!withdrawal) {
      return res.status(404).json({ message: "Withdrawal not found" });
    }

    if (withdrawal.status !== "pending") {
      return res.status(400).json({ message: "Withdrawal already processed" });
    }

    await supabase
      .from("withdrawals")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", withdrawal_id);

    const { data: wallet } = await supabase
      .from("wallets")
      .select("balance, pending_earnings")
      .eq("user_email", withdrawal.user_email)
      .maybeSingle();

    if (wallet) {
      const currentBalance = Number(wallet.balance)          || 0;
      const currentPending = Number(wallet.pending_earnings) || 0;
      const refundAmount   = Number(withdrawal.amount)       || 0;

      await supabase
        .from("wallets")
        .update({
          balance:          currentBalance + refundAmount,
          pending_earnings: Math.max(0, currentPending - refundAmount),
          updated_at:       new Date().toISOString(),
        })
        .eq("user_email", withdrawal.user_email);
    }

    console.log(`❌ Withdrawal rejected — KES ${withdrawal.amount} refunded to ${withdrawal.user_email}`);
    return res.status(200).json({ message: "Withdrawal rejected and balance refunded" });
  } catch (error) {
    console.error("❌ Reject withdrawal error:", error.message);
    return res.status(500).json({ message: "Failed to reject withdrawal" });
  }
});

// ─── GET ALL PAYMENTS ─────────────────────────────────────────────────────────
router.get("/payments", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return res.status(400).json({ message: error.message });
    return res.status(200).json({ payments: data });
  } catch (error) {
    console.error("❌ Get payments error:", error.message);
    return res.status(500).json({ message: "Failed to fetch payments" });
  }
});

// ─── ADD TASK ─────────────────────────────────────────────────────────────────
router.post("/tasks/add", async (req, res) => {
  try {
    const { title, description, reward } = req.body;

    if (!title || !description || !reward) {
      return res.status(400).json({ message: "title, description and reward are required" });
    }

    const { data, error } = await supabase
      .from("tasks")
      .insert([{ title, description, reward: Number(reward), status: "active" }])
      .select()
      .single();

    if (error) return res.status(400).json({ message: error.message });
    return res.status(200).json({ message: "Task added successfully", task: data });
  } catch (error) {
    console.error("❌ Add task error:", error.message);
    return res.status(500).json({ message: "Failed to add task" });
  }
});

// ─── DEACTIVATE TASK ──────────────────────────────────────────────────────────
router.post("/tasks/deactivate", async (req, res) => {
  try {
    const { task_id } = req.body;

    if (!task_id) {
      return res.status(400).json({ message: "task_id is required" });
    }

    await supabase
      .from("tasks")
      .update({ status: "inactive" })
      .eq("id", task_id);

    return res.status(200).json({ message: "Task deactivated successfully" });
  } catch (error) {
    console.error("❌ Deactivate task error:", error.message);
    return res.status(500).json({ message: "Failed to deactivate task" });
  }
});

export default router;
