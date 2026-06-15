import express from "express";
import supabase from "../../supabase.js";
import { authenticateToken, requireMembership, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

// ─── PUBLIC: GET ACTIVE TASKS (members only) ──────────────────────────────────

router.get("/", authenticateToken, requireMembership, async (req, res) => {
  try {
    const { category, limit = 20, offset = 0 } = req.query;

    let query = supabase
      .from("tasks")
      .select("id, title, description, category, reward, deadline, created_at")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (category) {
      query = query.eq("category", category);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    return res.json({ tasks: data, count: data.length });
  } catch (error) {
    console.error("Tasks fetch error:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ─── GET SINGLE TASK ──────────────────────────────────────────────────────────

router.get("/:id", authenticateToken, requireMembership, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: task, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Check if user already submitted this task
    const { data: submission } = await supabase
      .from("task_submissions")
      .select("id, status, created_at")
      .eq("task_id", id)
      .eq("user_email", req.user.email)
      .maybeSingle();

    return res.json({ task, submission: submission || null });
  } catch (error) {
    console.error("Task fetch error:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ─── SUBMIT A TASK ────────────────────────────────────────────────────────────

router.post("/:id/submit", authenticateToken, requireMembership, async (req, res) => {
  try {
    const { id: task_id } = req.params;
    const { submission_data } = req.body;
    const user_email = req.user.email;

    if (!submission_data) {
      return res.status(400).json({ message: "submission_data is required" });
    }

    // Verify task is active
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", task_id)
      .eq("status", "active")
      .maybeSingle();

    if (taskError || !task) {
      return res.status(404).json({ message: "Task not found or not active" });
    }

    // Prevent duplicate submissions
    const { data: existing } = await supabase
      .from("task_submissions")
      .select("id")
      .eq("task_id", task_id)
      .eq("user_email", user_email)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ message: "You have already submitted this task" });
    }

    // Insert submission
    const { error: submitError } = await supabase
      .from("task_submissions")
      .insert([
        {
          task_id,
          user_email,
          submission_data,
          status: "pending",
        },
      ]);

    if (submitError) {
      return res.status(500).json({ message: submitError.message });
    }

    // Auto-credit wallet if task has an instant reward
    if (task.reward && task.reward > 0) {
      const { data: wallet } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_email", user_email)
        .maybeSingle();

      if (wallet) {
        await supabase
          .from("wallets")
          .update({ balance: wallet.balance + task.reward })
          .eq("user_email", user_email);
      } else {
        await supabase
          .from("wallets")
          .insert([{ user_email, balance: task.reward }]);
      }
    }

    return res.status(201).json({
      message: "Task submitted successfully",
      reward_credited: task.reward || 0,
    });
  } catch (error) {
    console.error("Task submission error:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ─── GET MY SUBMISSIONS ───────────────────────────────────────────────────────

router.get("/my/submissions", authenticateToken, requireMembership, async (req, res) => {
  try {
    const user_email = req.user.email;

    const { data, error } = await supabase
      .from("task_submissions")
      .select("*, tasks(title, category, reward)")
      .eq("user_email", user_email)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    return res.json(data);
  } catch (error) {
    console.error("My submissions error:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ─── ADMIN: CREATE TASK ───────────────────────────────────────────────────────

router.post("/admin/create", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, description, category, reward, deadline, instructions } = req.body;

    if (!title || !description || !category) {
      return res.status(400).json({ message: "title, description, and category are required" });
    }

    const { data, error } = await supabase
      .from("tasks")
      .insert([
        {
          title,
          description,
          category,
          reward: reward || 0,
          deadline: deadline || null,
          instructions: instructions || null,
          status: "active",
        },
      ])
      .select()
      .single();

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    return res.status(201).json({ message: "Task created", task: data });
  } catch (error) {
    console.error("Create task error:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ─── ADMIN: UPDATE TASK ───────────────────────────────────────────────────────

router.put("/admin/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Whitelist allowed fields
    const allowed = ["title", "description", "category", "reward", "deadline", "instructions", "status"];
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([key]) => allowed.includes(key))
    );

    const { data, error } = await supabase
      .from("tasks")
      .update(filtered)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    return res.json({ message: "Task updated", task: data });
  } catch (error) {
    console.error("Update task error:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ─── ADMIN: DELETE (deactivate) TASK ─────────────────────────────────────────

router.delete("/admin/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from("tasks")
      .update({ status: "inactive" })
      .eq("id", id);

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    return res.json({ message: "Task deactivated" });
  } catch (error) {
    console.error("Delete task error:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ─── ADMIN: ALL SUBMISSIONS ───────────────────────────────────────────────────

router.get("/admin/submissions/all", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from("task_submissions")
      .select("*, tasks(title, category, reward)")
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
    console.error("Admin submissions error:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ─── ADMIN: APPROVE SUBMISSION ────────────────────────────────────────────────

router.post("/admin/submissions/:id/approve", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: submission, error: fetchError } = await supabase
      .from("task_submissions")
      .select("*, tasks(reward)")
      .eq("id", id)
      .maybeSingle();

    if (fetchError || !submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    if (submission.status === "approved") {
      return res.status(409).json({ message: "Submission already approved" });
    }

    await supabase
      .from("task_submissions")
      .update({ status: "approved" })
      .eq("id", id);

    return res.json({ message: "Submission approved" });
  } catch (error) {
    console.error("Approve submission error:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ─── ADMIN: REJECT SUBMISSION ─────────────────────────────────────────────────

router.post("/admin/submissions/:id/reject", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const { data: submission, error: fetchError } = await supabase
      .from("task_submissions")
      .select("user_email, tasks(reward)")
      .eq("id", id)
      .maybeSingle();

    if (fetchError || !submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    await supabase
      .from("task_submissions")
      .update({ status: "rejected", rejection_reason: reason || null })
      .eq("id", id);

    // Reverse the wallet credit if reward was auto-applied
    const reward = submission.tasks?.reward || 0;
    if (reward > 0) {
      const { data: wallet } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_email", submission.user_email)
        .maybeSingle();

      if (wallet && wallet.balance >= reward) {
        await supabase
          .from("wallets")
          .update({ balance: wallet.balance - reward })
          .eq("user_email", submission.user_email);
      }
    }

    return res.json({ message: "Submission rejected" });
  } catch (error) {
    console.error("Reject submission error:", error);
    return res.status(500).json({ message: error.message });
  }
});

export default router;