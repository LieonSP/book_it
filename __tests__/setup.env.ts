/**
 * __tests__/setup.env.ts
 *
 * This setup file runs before every test file.
 * Its job is to load environment variables from .env.local into process.env
 * so that tests can access the Supabase credentials.
 *
 * Why we need this: Vitest runs in Node.js, separate from Next.js.
 * Next.js automatically loads .env.local, but Vitest does not.
 * We have to do it manually here.
 *
 * If .env.local does not exist (e.g. in CI), we skip loading silently.
 * In that case, tests that require Supabase credentials will fail with
 * a clear error from lib/supabase.ts.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// Find .env.local at the root of the project
const envLocalPath = resolve(__dirname, "../.env.local");

if (existsSync(envLocalPath)) {
  // Read the file as a string and parse each line
  const lines = readFileSync(envLocalPath, "utf-8").split("\n");

  for (const line of lines) {
    // Skip empty lines and comments (lines starting with #)
    if (!line.trim() || line.startsWith("#")) continue;

    // Split on the first "=" to get key and value
    const [key, ...valueParts] = line.split("=");
    const value = valueParts.join("=").trim();

    // Only set the variable if it isn't already set in the environment
    // This allows CI systems to override values via their own env configuration
    if (key && value && !process.env[key.trim()]) {
      process.env[key.trim()] = value;
    }
  }
}
