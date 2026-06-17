// supabase.js
import dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  console.error("❌ SUPABASE_URL or SUPABASE_KEY is missing from .env");
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  {
    auth: { persistSession: false },
  }
);

export default supabase;
