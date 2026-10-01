/**
 * vitest.config.ts
 *
 * Configuration file for Vitest, our test runner.
 * This tells Vitest where to find test files and how to run them.
 *
 * We use the 'node' environment because our tests check server-side
 * things like environment variables and file system state,
 * not browser rendering.
 */

import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Resolve relative to this config file's own location, not a hardcoded
// absolute path — a hardcoded path only works in one specific checkout and
// silently breaks in any other clone or git worktree (see BUG-022).
const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  test: {
    // Run tests in Node.js environment (not a browser simulation)
    environment: "node",
    // setupFiles run before each test file.
    // setup.env.ts loads .env.local so tests can access Supabase credentials.
    setupFiles: ["__tests__/setup.env.ts"],
  },
  resolve: {
    alias: {
      // Allow imports like "@/lib/supabase" to resolve to "lib/supabase"
      // This mirrors the path alias configured in tsconfig.json
      "@": projectRoot,
    },
  },
});
