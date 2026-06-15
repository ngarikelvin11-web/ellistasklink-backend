import dotenv from "dotenv";
dotenv.config();

import express from "express";
import axios from "axios";
import supabase from "../supabase.js";

const router = express.Router();

// Mounted at: app.use("/api/payments", paymentRoutes)
// Final URLs:
//   GET  /api/payments/token
//   GET  /api/payments/register-ipn
//   POST /api/payments/create
//   GET  /api/payments/callback
//   GET  /api/payments/status/:trackingId

// ── Use sandbox URL for testing; switch to live URL when going to production ──
const PESAPAL_BASE_URL =
  process.env.PESAPAL_ENV === "live"
    ? "https://pay.pesapal.com/v3/api"
    : "https://cybqa.pesapal.com/pesapalv3/api";

// Must match referrals.js and auth.js: KES 80 withdrawable + KES 40 retained
const REFERRAL_BONUS = 120;

// ─── GET PESAPAL TOKEN (internal helper) ──────────────────────────────────────
async function getPesapalToken() {
  try {
    console.log("🔑 Requesting Pesapal token...");

    const response = await axios.post(
      `${PESAPAL_BASE_URL}/Auth/RequestToken`,
      {
        consumer_key:    process.env.PESAPAL_CONSUMER_KEY,
        consumer_secret: process.env.PESAPAL_CONSUMER_SECRET,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Accept:         "application/json",
        },
      }
    );

    console.log("📦 Pesapal token response:", JSON.stringify(response.data, null, 2));

    // Pesapal may return the token under different field names
    const token =
      response.data.token        ||
      response.data.access_token ||
      response.data.Token        ||
      null;

    if (!token) {
      console.error("❌ Token field not found in response:", response.data);
      throw new Error("Token not found in Pesapal response");
    }

    console.log("✅ Pesapal token acquired");
    return token;
  } catch (error) {
    console.error("❌ Pesapal token error:");
    console.error("   Status :", error.response?.status);
    console.error("   Data   :", JSON.stringify(error.response?.data, null, 2));
    console.error("   Message:", error.message);
    throw error;
  }
}

// ─── TEST TOKEN ───────────────────────────────────────────────────────────────
router.get("/token", async (req, res) => {
  try {
    const token = await getPesapalToken();
    return res.status(200).json({ token, message: "✅ Token acquired successfully" });
  } catch (error) {
    console.error("❌ Token route error:", error.message);
    return res.status(500).json({
      message: "Failed to get payment token",
      detail:  error.response?.data || error.message,
    });
  }
});

// ─── REGISTER IPN ─────────────────────────────────────────────────────────────
router.get("/register-ipn", async (req, res) => {
  try {
    const token       = await getPesapalToken();
    const callbackUrl = process.env.PESAPAL_CALLBACK_URL;

    if (!callbackUrl) {
      return res.status(500).json({ message: "PESAPAL_CALLBACK_URL is not set in .env" });
    }

    console.log("📡 Registering IPN with URL:", callbackUrl);

    const response = await axios.post(
      `${PESAPAL_BASE_URL}/URLSetup/RegisterIPN`,
      { url: callbackUrl, ipn_notification_type: "GET" },
      {
        headers: {
          Authorization:  `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept:         "application/json",
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

// ─── CREATE PAYMENT ───────────────────────────────────────────────────────────
router.post("/create", async (req, res) => {
  try {
    console.log("📦 Incoming payment request:", req.body);

    const { email, fullName, amount = 200 } = req.body;

    if (!email || !fullName) {
      return res.status(400).json({ message: "email and fullName are required" });
    }

    if (!process.env.PESAPAL_IPN_ID) {
      console.error("❌ PESAPAL_IPN_ID is not set");
      return res.status(500).json({ message: "Payment gateway not configured. Contact support." });
    }

    const callbackUrl = process.env.PESAPAL_CALLBACK_URL;

    if (!callbackUrl) {
      return res.status(500).json({ message: "PESAPAL_CALLBACK_URL is not set in .env" });
    }

    const token   = await getPesapalToken();
    const orderId = "ELLIS-" + Date.now();

    const nameParts = fullName.trim().split(" ");
    const firstName = nameParts[0];
    const lastName  = nameParts.slice(1).join(" ") || firstName;

    const payload = {
      id:              orderId,
      currency:        "KES",
      amount:          Number(amount),
      description:     "EllisTaskLink Membership Activation",
      callback_url:    callbackUrl,
      notification_id: process.env.PESAPAL_IPN_ID,
      billing_address: {
        email_address: email.toLowerCase().trim(),
        phone_number:  "0700000000",
        country_code:  "KE",
        first_name:    firstName,
        last_name:     lastName,
      },
    };

    console.log("📤 Payload sent to Pesapal:", JSON.stringify(payload, null, 2));

    const response = await axios.post(
      `${PESAPAL_BASE_URL}/Transactions/SubmitOrderRequest`,
      payload,
      {
        headers: {
          Authorization:  `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept:         "application/json",
        },
      }
    );

    console.log("✅ Pesapal payment response:", JSON.stringify(response.data, null, 2));
    return res.status(200).json(response.data);
  } catch (error) {
    const pesapalError = error.response?.data;
    const statusCode   = error.response?.status;

    console.error("❌ Create payment error:");
    console.error("   Status :", statusCode);
    console.error("   Data   :", JSON.stringify(pesapalError, null, 2));
    console.error("   Message:", error.message);

    return res.status(500).json({
      message: "Payment creation failed",
      detail:  pesapalError || error.message,
      status:  statusCode,
    });
  }
});

// ─── PAYMENT CALLBACK ─────────────────────────────────────────────────────────
router.get("/callback", async (req, res) => {
  try {
    const orderTrackingId = req.query.OrderTrackingId;

    if (!orderTrackingId) {
      return res.status(400).json({ message: "Missing OrderTrackingId" });
    }

    const token = await getPesapalToken();

    const response = await axios.get(
      `${PESAPAL_BASE_URL}/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`,
      {
        headers: {
          Authorization:  `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept:         "application/json",
        },
      }
    );

    const paymentData = response.data;
    console.log("📩 Payment callback received:", JSON.stringify(paymentData, null, 2));

    if (paymentData.payment_status_description === "Completed") {
      const userEmail = paymentData.billing_address?.email_address?.toLowerCase().trim();

      if (!userEmail) {
        console.error("❌ No email in Pesapal callback payload");
        return res.status(400).json({ message: "Missing email in payment data" });
      }

      // ── 1. Activate membership ───────────────────────────────────────────
      const { error: membershipError } = await supabase
        .from("users")
        .update({ membership_paid: true })
        .eq("email", userEmail);

      if (membershipError) {
        console.error("❌ Membership update error:", membershipError.message);
      } else {
        console.log(`✅ Membership activated: ${userEmail}`);
      }

      // ── 2. Save payment record ───────────────────────────────────────────
      const { error: paymentInsertError } = await supabase
        .from("payments")
        .insert([{
          user_email:           userEmail,
          amount:               paymentData.amount,
          currency:             paymentData.currency || "KES",
          status:               "Completed",
          pesapal_tracking_id:  orderTrackingId,
        }]);

      if (paymentInsertError) {
        console.error("❌ Payment record insert error:", paymentInsertError.message);
      }

      // ── 3. Referral bonus ────────────────────────────────────────────────
      const { data: referral } = await supabase
        .from("referrals")
        .select("referrer_email")
        .eq("referred_email", userEmail)
        .eq("status", "pending")
        .maybeSingle();

      if (referral) {
        // Mark referral as completed
        await supabase
          .from("referrals")
          .update({ status: "completed" })
          .eq("referred_email", userEmail);

        // Credit referrer wallet with full REFERRAL_BONUS (KES 120)
        const { data: referrerWallet } = await supabase
          .from("wallets")
          .select("balance, total_earnings, completed_earnings")
          .eq("user_email", referral.referrer_email)
          .maybeSingle();

        if (referrerWallet) {
          await supabase
            .from("wallets")
            .update({
              balance:            referrerWallet.balance            + REFERRAL_BONUS,
              total_earnings:     referrerWallet.total_earnings     + REFERRAL_BONUS,
              completed_earnings: referrerWallet.completed_earnings + REFERRAL_BONUS,
              updated_at:         new Date().toISOString(),
            })
            .eq("user_email", referral.referrer_email);
        } else {
          // Wallet should exist (created on register), but insert as fallback
          await supabase.from("wallets").insert([{
            user_email:         referral.referrer_email,
            balance:            REFERRAL_BONUS,
            total_earnings:     REFERRAL_BONUS,
            pending_earnings:   0,
            completed_earnings: REFERRAL_BONUS,
          }]);
        }

        console.log(`✅ Referral bonus KES ${REFERRAL_BONUS} credited to: ${referral.referrer_email}`);
      }
    } else {
      console.log(`ℹ️ Payment not completed. Status: ${paymentData.payment_status_description}`);
    }

    return res.status(200).json({ message: "Callback received successfully" });
  } catch (error) {
    console.error("❌ Payment callback error:");
    console.error("   Status :", error.response?.status);
    console.error("   Data   :", JSON.stringify(error.response?.data, null, 2));
    console.error("   Message:", error.message);
    return res.status(500).json({ message: "Payment callback failed" });
  }
});

// ─── PAYMENT STATUS ───────────────────────────────────────────────────────────
router.get("/status/:trackingId", async (req, res) => {
  try {
    const { trackingId } = req.params;

    if (!trackingId) {
      return res.status(400).json({ message: "trackingId is required" });
    }

    const token = await getPesapalToken();

    const response = await axios.get(
      `${PESAPAL_BASE_URL}/Transactions/GetTransactionStatus?orderTrackingId=${trackingId}`,
      {
        headers: {
          Authorization:  `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept:         "application/json",
        },
      }
    );

    return res.status(200).json(response.data);
  } catch (error) {
    console.error("❌ Payment status error:");
    console.error("   Status :", error.response?.status);
    console.error("   Data   :", JSON.stringify(error.response?.data, null, 2));
    console.error("   Message:", error.message);
    return res.status(500).json({ message: "Could not fetch payment status" });
  }
});

export default router;