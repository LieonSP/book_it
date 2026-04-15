/**
 * lib/supabase/client.ts
 *
 * Creates a Supabase client for use in Client Components (browser-side code).
 *
 * WHY a separate client file:
 * Server components use cookies to manage sessions (see server.ts).
 * Client components run in the browser, where @supabase/ssr uses a different
 * strategy (BroadcastChannel for cross-tab sync, localStorage for caching).
 * createBrowserClient handles all of this automatically.
 *
 * Import this only in files marked "use client".
 */

import { createBrowserClient } from "@supabase/ssr"

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
