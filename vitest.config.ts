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
      "@": "/Users/philippechambert-loir/Documents/Repos/book_it",
    },
  },
});
