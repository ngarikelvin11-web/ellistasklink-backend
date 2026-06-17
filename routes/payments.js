// routes/payments.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import axios from "axios";
import supabase from "../supabase.js";

const router = express.Router();

const PESAPAL_BASE_URL =
  process.env.PESAPAL_ENV === "live"
    ? "https://pay.pesapal.com/v3/api"
    : "https://cybqa.pesapal.com/pesapalv3/api";

const COUNTRY_CODE_MAP = {
  KE: "254",
  UG: "256",
  TZ: "255",
};

async function getPesapalToken() {
  const { data } = await axios.post(
    `${PESAPAL_BASE_URL}/Auth/RequestToken`,
    {
      consumer_key:    process.env.PESAPAL_CONSUMER_KEY,
      consumer_secret: process.env.PESAPAL_CONSUMER_SECRET,
    },
    {
      headers: { "Content-Type": "application/json" },
      timeout: 15000,
    }
  );

  const token =
    data?.token || data?.Token || data?.access_token || data?.accessToken;

  if (!token) {
    throw new Error(`No token in response: ${JSON.stringify(data)}`);
  }
  return token;
}

// ─── DEBUG ROUTE — shows current env vars + tests Pesapal connection ───────
router.get("/debug", async (req, res) => {
  try {
    const requestBody = {
      consumer_key:    process.env.PESAPAL_CONSUMER_KEY,
      consumer_secret: process.env.PESAPAL_CONSUMER_SECRET,
    };

    let rawResponse  = null;
    let httpStatus   = null;
    let requestError = null;

    try {
      const response = await axios.post(
        `${PESAPAL_BASE_URL}/Auth/RequestToken`,
        requestBody,
        { headers: { "Content-Type": "application/json" }, timeout: 15000 }
      );
      rawResponse = response.data;
      httpStatus  = response.status;
    } catch (err) {
      httpStatus   = err.response?.status;
      rawResponse  = err.response?.data;
      requestError = err.message;
    }

    return res.status(200).json({
      debug: true,
      env: process.env.PESAPAL_ENV || "sandbox (default)",
      base_url: PESAPAL_BASE_URL,
      key_loaded: !!process.env.PESAPAL_CONSUMER_KEY,
      key_value: process.env.PESAPAL_CONSUMER_KEY ? `${process.env.PESAPAL_CONSUMER_KEY.substring(0, 10)}...` : "NOT SET",
      secret_loaded: !!process.env.PESAPAL_CONSUMER_SECRET,
      secret_value: process.env.PESAPAL_CONSUMER_SECRET ? "***loaded***" : "NOT SET",
      ipn_id_loaded: !!process.env.PESAPAL_IPN_ID,
      ipn_id_value: process.env.PESAPAL_IPN_ID || "NOT SET",
      callback_url: process.env.PESAPAL_CALLBACK_URL || "NOT SET",
      pesapal_http_status: httpStatus,
      pesapal_raw_response: rawResponse,
      request_error: requestError,
    });
  } catch (e) {
    return res.status(500).json({ debug: true, error: e.message });
  }
});

// ─── REGISTER IPN ────────────────────────────────────────────────────────────
router.get("/register-ipn", async (req, res) => {
  try {
    const callbackUrl = process.env.PESAPAL_CALLBACK_URL;
    if (!callbackUrl) {
      return res.status(500).json({ message: "PESAPAL_CALLBACK_URL is not set in .env" });
    }

    const token = await getPesapalToken();

    console.log("📡 Registering IPN with URL:", callbackUrl);

    const response = await axios.post(
      `${PESAPAL_BASE_URL}/URLSetup/RegisterIPN`,
      { url: callbackUrl, ipn_notification_type: "GET" },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept:        "application/json",
        },
      }
    );

    console.log("✅ IPN registered:", JSON.stringify(response.data, null, 2));
    return res.status(200).json(response.data);
  } catch (error) {
    console.error("❌ IPN registration error:");
    console.error("   Status :", error.response?.status);
    console.error("   Data   :", JSON.stringify(error.response?.data, null, 2));
    console.error("   Message:", error.message);
    return res.status(500).json({
      message: "IPN registration failed",
      detail:  error.response?.data || error.message,
    });
  }
});

// ─── CREATE PAYMENT (with phone for STK push) ────────────────────────────────
router.post("/create", async (req, res) => {
  try {
    const {
      email,
      fullName,
      phone,
      country = "KE",
      amount = 100,
      paymentType = "membership",
      currency = "KES",
    } = req.body;

    if (!email || !fullName) {
      return res.status(400).json({ message: "email and fullName are required" });
    }
    if (!phone) {
      return res.status(400).json({ message: "phone is required for M-Pesa STK push" });
    }
    if (!process.env.PESAPAL_IPN_ID) {
      return res.status(500).json({ message: "PESAPAL_IPN_ID not set in .env" });
    }

    const callbackUrl = process.env.PESAPAL_CALLBACK_URL;
    if (!callbackUrl) {
      return res.status(500).json({ message: "PESAPAL_CALLBACK_URL not set in .env" });
    }

    const token   = await getPesapalToken();
    const orderId = "ELLIS-" + Date.now();

    const nameParts = fullName.trim().split(" ");
    const firstName = nameParts[0];
    const lastName  = nameParts.slice(1).join(" ") || firstName;

    // Normalize phone to international format
    let phoneNumber = String(phone || "").replace(/[^0-9]/g, "");
    const cc = COUNTRY_CODE_MAP[country] || "254";

    if (phoneNumber.startsWith("0")) phoneNumber = cc + phoneNumber.substring(1);
    else if (phoneNumber.startsWith("+" + cc)) phoneNumber = phoneNumber.substring(1);
    else if (!phoneNumber.startsWith(cc) && phoneNumber.length === 9) phoneNumber = cc + phoneNumber;

    const payload = {
      id: orderId,
      currency: String(currency).toUpperCase(),
      amount: Number(amount),
      description:
        paymentType === "task_access"
          ? "EllisTaskLink Task Access"
          : "EllisTaskLink Membership",
      callback_url:    callbackUrl,
      notification_id: process.env.PESAPAL_IPN_ID,
      billing_address: {
        email_address: email.toLowerCase().trim(),
        phone_number:  phoneNumber,
        country_code:  String(country).toUpperCase(),
        first_name:    firstName,
        last_name:     lastName,
      },
    };

    console.log("📤 Pesapal payload:", JSON.stringify(payload, null, 2));

    const response = await axios.post(
      `${PESAPAL_BASE_URL}/Transactions/SubmitOrderRequest`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept:        "application/json",
        },
        timeout: 20000,
      }
    );

    console.log("✅ Pesapal response:", JSON.stringify(response.data, null, 2));

    // Save payment intent
    try {
      await supabase.from("payments").insert([{
        user_email:          email.toLowerCase().trim(),
        amount:              Number(amount),
        currency:            String(currency).toUpperCase(),
        status:              "pending",
        payment_type:        paymentType,
        pesapal_tracking_id: response.data.order_tracking_id || orderId,
        pesapal_order_id:    orderId,
      }]);
    } catch (dbErr) {
      console.warn("⚠️ Could not save payment intent:", dbErr.message);
    }

    return res.status(200).json({
      order_tracking_id:  response.data.order_tracking_id,
      merchant_reference: response.data.merchant_reference || orderId,
      redirect_url:       response.data.redirect_url,
      iframe_url:         response.data.redirect_url,
      status:             response.data.status || "200",
    });
  } catch (error) {
    console.error("❌ Create payment error:");
    console.error("   Status :", error.response?.status);
    console.error("   Data   :", JSON.stringify(error.response?.data, null, 2));
    console.error("   Message:", error.message);

    return res.status(500).json({
      message: "Payment creation failed",
      detail:  error.response?.data || error.message,
    });
  }
});

// ─── PAYMENT CALLBACK ────────────────────────────────────────────────────────
router.get("/callback", async (req, res) => {
  try {
    const orderTrackingId = req.query.OrderTrackingId;
    if (!orderTrackingId) return res.status(400).json({ message: "Missing OrderTrackingId" });

    const token = await getPesapalToken();
    const response = await axios.get(
      `${PESAPAL_BASE_URL}/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`,
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
    );

    const paymentData = response.data;
    console.log(`📩 Callback: ${paymentData.payment_status_description}`);

    const status = String(paymentData.payment_status_description || "").toUpperCase();
    if (status !== "COMPLETED") {
      return res.status(200).json({ message: "Payment not completed yet" });
    }

    const userEmail = paymentData.billing_address?.email_address?.toLowerCase().trim();
    if (!userEmail) return res.status(400).json({ message: "Missing email" });

    const { data: paymentRecord } = await supabase
      .from("payments")
      .select("*")
      .eq("pesapal_tracking_id", orderTrackingId)
      .maybeSingle();

    const paymentType = paymentRecord?.payment_type || "membership";
    const amount      = Number(paymentData.amount || paymentRecord?.amount || 0);

    await supabase
      .from("payments")
      .update({ status: "Completed" })
      .eq("pesapal_tracking_id", orderTrackingId);

    // ── MEMBERSHIP (100 KES) — referrer gets 70, platform keeps 30 ────────
    if (paymentType === "membership") {
      await supabase.from("users").update({ membership_paid: true }).eq("email", userEmail);
      await supabase.from("wallets").update({ membership_paid: true }).eq("user_email", userEmail);

      const { data: referral } = await supabase
        .from("referrals")
        .select("*")
        .eq("referred_email", userEmail)
        .eq("status", "pending")
        .maybeSingle();

      if (referral) {
        const referrerEarns = Number(referral.referrer_earns || 70);
        const platformKeeps = Number(referral.platform_keeps || 30);

        await supabase
          .from("referrals")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("referred_email", userEmail);

        const { data: refW } = await supabase
          .from("wallets").select("*").eq("user_email", referral.referrer_email).maybeSingle();

        if (refW) {
          await supabase.from("wallets").update({
            balance:            (Number(refW.balance) || 0) + referrerEarns,
            referral_earned:    (Number(refW.referral_earned) || 0) + referrerEarns,
            total_earnings:     (Number(refW.total_earnings) || 0) + referrerEarns,
            completed_earnings: (Number(refW.completed_earnings) || 0) + referrerEarns,
          }).eq("user_email", referral.referrer_email);
        }

        const { data: newW } = await supabase
          .from("wallets").select("*").eq("user_email", userEmail).maybeSingle();

        if (newW) {
          await supabase.from("wallets").update({
            platform_balance: (Number(newW.platform_balance) || 0) + platformKeeps,
          }).eq("user_email", userEmail);
        }
        console.log(`✅ Referral paid: ${referral.referrer_email} +${referrerEarns}, platform +${platformKeeps}`);
      } else {
        const { data: w } = await supabase
          .from("wallets").select("*").eq("user_email", userEmail).maybeSingle();

        if (w) {
          await supabase.from("wallets").update({
            platform_balance: (Number(w.platform_balance) || 0) + amount,
          }).eq("user_email", userEmail);
        }
        console.log(`✅ Direct signup: platform +${amount}`);
      }
    }

    // ── TASK ACCESS (100 KES) — all to platform ───────────────────────────
    if (paymentType === "task_access") {
      await supabase.from("users").update({ task_access_paid: true }).eq("email", userEmail);
      await supabase.from("wallets").update({ task_access_paid: true }).eq("user_email", userEmail);

      const { data: w } = await supabase
        .from("wallets").select("*").eq("user_email", userEmail).maybeSingle();

      if (w) {
        await supabase.from("wallets").update({
          platform_balance: (Number(w.platform_balance) || 0) + amount,
        }).eq("user_email", userEmail);
      }
      console.log(`✅ Task access unlocked: ${userEmail}, platform +${amount}`);
    }

    return res.status(200).json({ message: "Callback processed" });
  } catch (error) {
    console.error("❌ Callback error:", error.message);
    return res.status(500).json({ message: "Callback failed" });
  }
});

// ─── STATUS ──────────────────────────────────────────────────────────────────
router.get("/status/:trackingId", async (req, res) => {
  try {
    const token = await getPesapalToken();
    const response = await axios.get(
      `${PESAPAL_BASE_URL}/Transactions/GetTransactionStatus?orderTrackingId=${req.params.trackingId}`,
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
    );
    return res.status(200).json(response.data);
  } catch (error) {
    return res.status(500).json({ message: "Status check failed" });
  }
});

export default router;
