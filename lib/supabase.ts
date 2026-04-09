/**
 * lib/supabase.ts
 *
 * This file creates and exports a single Supabase client instance.
 * We do this in one place so the whole app shares the same connection,
 * rather than creating a new client in every component that needs it.
 *
 * Supabase is our backend: it handles the database, auth, and API access.
 * The client needs two environment variables to know where to connect:
 *   - NEXT_PUBLIC_SUPABASE_URL: the URL of our Supabase project
 *   - NEXT_PUBLIC_SUPABASE_ANON_KEY: the public key that allows read access
 *
 * Both are prefixed with NEXT_PUBLIC_ so Next.js makes them available
 * in the browser as well as on the server.
 */

import { createClient } from "@supabase/supabase-js";

// Read the Supabase URL from the environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

// Read the anonymous (public) API key from the environment variables
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// If either variable is missing, we throw an error immediately.
// This prevents the app from starting with a broken Supabase connection,
// which would cause confusing failures deep in the code rather than at startup.
if (!supabaseUrl) {
  throw new Error(
    "Missing environment variable: NEXT_PUBLIC_SUPABASE_URL\n" +
      "Please add it to your .env.local file. See .env.local.example for reference."
  );
}

if (!supabaseAnonKey) {
  throw new Error(
    "Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY\n" +
      "Please add it to your .env.local file. See .env.local.example for reference."
  );
}

/**
 * The Supabase client.
 * Import this wherever you need to talk to the database or auth system.
 *
 * Example usage:
 *   import { supabase } from "@/lib/supabase"
 *   const { data, error } = await supabase.from("listings").select("*")
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
