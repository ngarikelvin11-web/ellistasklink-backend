import axios from "axios";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import supabase from "./supabase.js";
import { getPesapalToken } from "./pesapal.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = 5000;

// ─────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────

app.get("/", (req, res) => {

res.status(200).json({
message: "EllisTaskLink Backend Running"
});

});

// ─────────────────────────────────────────────────────────────
// REGISTER
// ─────────────────────────────────────────────────────────────

app.post("/api/register", async (req, res) => {

try {

```
const { fullName, email, password } = req.body;

const { data: existingUser } = await supabase
  .from("users")
  .select("*")
  .eq("email", email)
  .maybeSingle();

if (existingUser) {

  return res.status(409).json({
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

  return res.status(400).json({
    message: error.message
  });

}

return res.status(201).json({
  message: "Account created successfully"
});
```

} catch (error) {

```
console.error(error);

return res.status(500).json({
  message: error.message
});
```

}

});

// ─────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────

app.post("/api/login", async (req, res) => {

try {

```
const { email, password } = req.body;

const { data: user } = await supabase
  .from("users")
  .select("*")
  .eq("email", email)
  .maybeSingle();

if (!user) {

  return res.status(404).json({
    message: "User not found"
  });

}

const validPassword = await bcrypt.compare(
  password,
  user.password
);

if (!validPassword) {

  return res.status(401).json({
    message: "Invalid password"
  });

}

const token = jwt.sign(
  {
    id: user.id
  },
  process.env.JWT_SECRET
);

return res.status(200).json({
  token,
  user
});
```

} catch (error) {

```
console.error(error);

return res.status(500).json({
  message: error.message
});
```

}

});

// ─────────────────────────────────────────────────────────────
// TASKS
// ─────────────────────────────────────────────────────────────

app.get("/api/tasks", async (req, res) => {

try {

```
const { data, error } = await supabase
  .from("tasks")
  .select("*");

if (error) {

  return res.status(400).json({
    message: error.message
  });

}

return res.status(200).json({
  tasks: data
});
```

} catch (error) {

```
console.error(error);

return res.status(500).json({
  message: error.message
});
```

}

});

// ─────────────────────────────────────────────────────────────
// WALLET
// ─────────────────────────────────────────────────────────────

app.get("/api/wallet/:email", async (req, res) => {

try {

```
const email = req.params.email;

const { data, error } = await supabase
  .from("wallets")
  .select("*")
  .eq("user_email", email);

if (error) {

  return res.status(400).json({
    message: error.message
  });

}

return res.status(200).json(data);
```

} catch (error) {

```
console.error(error);

return res.status(500).json({
  message: error.message
});
```

}

});

// ─────────────────────────────────────────────────────────────
// REFERRALS
// ─────────────────────────────────────────────────────────────

app.get("/api/referrals/:email", async (req, res) => {

try {

```
const email = req.params.email;

const { data, error } = await supabase
  .from("referrals")
  .select("*")
  .eq("referrer_email", email);

if (error) {

  return res.status(400).json({
    message: error.message
  });

}

return res.status(200).json(data);
```

} catch (error) {

```
console.error(error);

return res.status(500).json({
  message: error.message
});
```

}

});

// ─────────────────────────────────────────────────────────────
// WITHDRAW
// ─────────────────────────────────────────────────────────────

app.post("/api/withdraw", async (req, res) => {

try {

```
const {
  user_email,
  amount,
  method,
  phone_number
} = req.body;

const { error } = await supabase
  .from("withdrawals")
  .insert([
    {
      user_email,
      amount,
      method,
      phone_number,
      status: "pending"
    }
  ]);

if (error) {

  return res.status(400).json({
    message: error.message
  });

}

return res.status(200).json({
  message: "Withdrawal request submitted"
});
```

} catch (error) {

```
console.error(error);

return res.status(500).json({
  message: error.message
});
```

}

});

// ─────────────────────────────────────────────────────────────
// PESAPAL TOKEN
// ─────────────────────────────────────────────────────────────

app.get("/api/pesapal-token", async (req, res) => {

try {

```
const token = await getPesapalToken();

return res.status(200).json({
  token
});
```

} catch (error) {

```
console.error(error);

return res.status(500).json({
  message: "Failed to get Pesapal token"
});
```

}

});

// ─────────────────────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {

console.log(
"EllisTaskLink server running on port " + PORT
);

});
