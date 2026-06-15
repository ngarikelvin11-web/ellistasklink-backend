import dotenv from "dotenv";
dotenv.config();

import express from "express";
import supabase from "../supabase.js";

const router = express.Router();

// Mounted at: app.use("/api/tasks", taskRoutes)
// Final URLs:
//   GET  /api/tasks
//   GET  /api/tasks/user/:email
//   POST /api/tasks/start
//   POST /api/tasks/complete

// ─── GET ALL ACTIVE TASKS ─────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ Fetch tasks error:", error.message);
      return res.status(400).json({ message: error.message });
    }

    return res.status(200).json({ tasks: data || [] });
  } catch (error) {
    console.error("❌ Get tasks error:", error.message);
    return res.status(500).json({ message: "Failed to fetch tasks" });
  }
});

// ─── GET USER TASKS ───────────────────────────────────────────────────────────
router.get("/user/:email", async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase().trim();

    const { data, error } = await supabase
      .from("user_tasks")
      .select(`*, tasks (id, title, description, reward)`)
      .eq("user_email", email)
      .order("started_at", { ascending: false });

    if (error) {
      console.error("❌ Fetch user tasks error:", error.message);
      return res.status(400).json({ message: error.message });
    }

    return res.status(200).json({ user_tasks: data || [] });
  } catch (error) {
    console.error("❌ Get user tasks error:", error.message);
    return res.status(500).json({ message: "Failed to fetch user tasks" });
  }
});

// ─── START A TASK ─────────────────────────────────────────────────────────────
router.post("/start", async (req, res) => {
  try {
    const { user_email, task_id } = req.body;

    if (!user_email || !task_id) {
      return res.status(400).json({ message: "user_email and task_id are required" });
    }

    const cleanEmail = user_email.toLowerCase().trim();

    // ── Check membership before allowing task start ────────────────────────
    const { data: user } = await supabase
      .from("users")
      .select("membership_paid")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.membership_paid) {
      return res.status(403).json({
        message: "Membership required",
        code:    "MEMBERSHIP_REQUIRED",
        hint:    "Please complete your KES 200 payment to start tasks",
      });
    }

    // ── Check task exists and is active ───────────────────────────────────
    const { data: task } = await supabase
      .from("tasks")
      .select("id, status")
      .eq("id", task_id)
      .maybeSingle();

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    if (task.status !== "active") {
      return res.status(400).json({ message: "This task is no longer available" });
    }

    // ── Guard: already started ─────────────────────────────────────────────
    const { data: existing } = await supabase
      .from("user_tasks")
      .select("*")
      .eq("user_email", cleanEmail)
      .eq("task_id", task_id)
      .maybeSingle();

    if (existing) {
      return res.status(200).json({
        message:   "Task already started",
        user_task: existing,
      });
    }

    // ── Insert user_task row ───────────────────────────────────────────────
    const { data, error } = await supabase
      .from("user_tasks")
      .insert([{ user_email: cleanEmail, task_id, status: "started" }])
      .select()
      .single();

    if (error) {
      console.error("❌ Insert user_task error:", error.message);
      return res.status(400).json({ message: error.message });
    }

    console.log(`✅ Task started: ${cleanEmail} → task ${task_id}`);
    return res.status(200).json({ message: "Task started successfully", user_task: data });
  } catch (error) {
    console.error("❌ Start task error:", error.message);
    return res.status(500).json({ message: "Failed to start task" });
  }
});

// ─── COMPLETE A TASK ──────────────────────────────────────────────────────────
router.post("/complete", async (req, res) => {
  try {
    const { user_email, task_id } = req.body;

    if (!user_email || !task_id) {
      return res.status(400).json({ message: "user_email and task_id are required" });
    }

    const cleanEmail = user_email.toLowerCase().trim();

    // ── Fetch task reward ──────────────────────────────────────────────────
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("id, reward, status")
      .eq("id", task_id)
      .single();

    if (taskError || !task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // ── Fetch user_task row ────────────────────────────────────────────────
    const { data: userTask } = await supabase
      .from("user_tasks")
      .select("*")
      .eq("user_email", cleanEmail)
      .eq("task_id", task_id)
      .maybeSingle();

    if (!userTask) {
      return res.status(400).json({ message: "Task not started yet. Start the task first." });
    }

    if (userTask.status === "completed") {
      return res.status(400).json({ message: "Task already completed" });
    }

    // ── Mark task as completed ─────────────────────────────────────────────
    const { error: updateError } = await supabase
      .from("user_tasks")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("user_email", cleanEmail)
      .eq("task_id", task_id);

    if (updateError) {
      console.error("❌ Update user_task error:", updateError.message);
      return res.status(500).json({ message: "Failed to mark task as completed" });
    }

    // ── Credit wallet ──────────────────────────────────────────────────────
    const { data: wallet } = await supabase
      .from("wallets")
      .select("balance, total_earnings, completed_earnings")
      .eq("user_email", cleanEmail)
      .maybeSingle();

    if (wallet) {
      await supabase
        .from("wallets")
        .update({
          balance:            wallet.balance            + task.reward,
          total_earnings:     wallet.total_earnings     + task.reward,
          completed_earnings: wallet.completed_earnings + task.reward,
          updated_at:         new Date().toISOString(),
        })
        .eq("user_email", cleanEmail);
    } else {
      // Wallet should already exist (created on register), but insert as fallback
      await supabase.from("wallets").insert([{
        user_email:         cleanEmail,
        balance:            task.reward,
        total_earnings:     task.reward,
        pending_earnings:   0,
        completed_earnings: task.reward,
      }]);
    }

    console.log(`✅ Task completed: ${cleanEmail} — KES ${task.reward} credited`);
    return res.status(200).json({
      message: "Task completed successfully",
      reward:  task.reward,
    });
  } catch (error) {
    console.error("❌ Complete task error:", error.message);
    return res.status(500).json({ message: "Failed to complete task" });
  }
});

export default router;