import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import supabase from "./supabase.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = 5000;

app.get("/", (req, res) => {
  res.json({
    message: "EllisTaskLink Backend Running"
  });
});

app.post("/api/register", async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    const { data: existingUser } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (existingUser) {
      return res.json({
        message: "User already exists"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const referralCode =
      fullName.replace(/\s+/g, "").toUpperCase() +
      Math.floor(Math.random() * 1000);

    const { error } = await supabase
      .from("users")
      .insert([
        {
          full_name: fullName,
          email: email,
          password: hashedPassword,
          referral_code: referralCode
        }
      ]);

    if (error) {
      return res.json({
        message: error.message
      });
    }

    return res.json({
      message: "Account created successfully"
    });

  } catch (error) {
    console.log(error);

    return res.json({
      message: error.message
    });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (!user) {
      return res.json({
        message: "User not found"
      });
    }

    const validPassword = await bcrypt.compare(
      password,
      user.password
    );

    if (!validPassword) {
      return res.json({
        message: "Invalid password"
      });
    }

    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET
    );

    return res.json({
      token: token,
      user: user
    });

  } catch (error) {
    console.log(error);

    return res.json({
      message: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});