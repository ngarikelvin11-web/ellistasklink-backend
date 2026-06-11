import axios from "axios";
import { getPesapalToken } from "./pesapal.js";
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

app.get("/api/pesapal-token", async (req, res) => {

  const token = await getPesapalToken();

  res.json({
    token
  });

});
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

app.post("/api/create-payment", async (req, res) => {

  try {

    const token = await getPesapalToken();

    const response = await axios.post(
      "https://pay.pesapal.com/v3/api/Transactions/SubmitOrderRequest",
      {
        id: Date.now().toString(),
        currency: "KES",
        amount: 100,
        description: "EllisTaskLink Membership",
        callback_url: "https://ellistasks.co.ke/payment-success",
        notification_id: "5d8ac0ab-eb81-4e08-80d5-da468a29cd6a",
        billing_address: {
          email_address: req.body.email,
          phone_number: "0712345678",
          country_code: "KE",
          first_name: req.body.fullName
        }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.json(response.data);

  } catch (error) {

    console.log(error.response?.data || error.message);

    res.json({
      message: "Payment creation failed"
    });

  }

});
app.get("/api/register-ipn", async (req, res) => {

  try {

    const token = await getPesapalToken();

    const response = await axios.post(
      "https://pay.pesapal.com/v3/api/URLSetup/RegisterIPN",
      {
        url: "https://ellistasklink-backend.onrender.com/api/payment-callback",
        ipn_notification_type: "GET"
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.json(response.data);

  } catch (error) {

    console.log(error.response?.data || error.message);

    res.json({
      message: "IPN registration failed"
    });

  }

});
app.get("/api/test-payment", async (req, res) => {

  try {

    const token = await getPesapalToken();

    const response = await axios.post(
      "https://pay.pesapal.com/v3/api/Transactions/SubmitOrderRequest",
      {
        id: Date.now().toString(),
        currency: "KES",
        amount: 100,
        description: "EllisTaskLink Membership",
        callback_url: "https://ellistasks.co.ke/payment-success",
        notification_id: "5d8ac0ab-eb81-4e08-80d5-da468a29cd6a",
        billing_address: {
          email_address: "ngarikelvin11@gmail.com",
          phone_number: "0712345678",
          country_code: "KE",
          first_name: "Kelvin"
        }
      },
      {
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json"
        }
      }
    );

    res.json(response.data);

  } catch (error) {

    console.log(error.response?.data || error.message);

    res.json({
      message: "Payment creation failed"
    });

  }

});
app.get("/api/payment-callback", async (req, res) => {

  try {

    const orderTrackingId = req.query.OrderTrackingId;

    const token = await getPesapalToken();

    const response = await axios.get(
      `https://pay.pesapal.com/v3/api/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`,
      {
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json"
        }
      }
    );

    const paymentData = response.data;

    console.log(paymentData);

    if (paymentData.payment_status_description === "Completed") {

      const email = paymentData.billing_address.email_address;

      await supabase
        .from("users")
        .update({
          membership_paid: true
        })
        .eq("email", email);

      await supabase
        .from("payments")
        .insert([
          {
            user_email: email,
            amount: paymentData.amount,
            currency: paymentData.currency,
            status: "Completed",
            pesapal_tracking_id: orderTrackingId
          }
        ]);

    }

    res.json({
      message: "Callback received successfully"
    });

  } catch (error) {

    console.log(error.response?.data || error.message);

    res.json({
      message: "Payment callback failed"
    });

  }

});
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});