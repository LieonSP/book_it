/**
 * __tests__/sql/issue-1-schema.test.ts
 *
 * QA test suite for Issue #1 — Initial Schema.
 * Executes all 14 scenarios defined in the issue acceptance criteria.
 *
 * Prerequisites:
 *   - NEXT_PUBLIC_SUPABASE_URL must be set in .env.local
 *   - SUPABASE_SERVICE_ROLE_KEY must be set in .env.local
 *     (bypasses RLS — required for direct SQL inserts without a logged-in user)
 *
 * Run with:
 *   npx vitest run __tests__/sql/issue-1-schema.test.ts
 *
 * How it works:
 *   We create a Supabase admin client using the service role key.
 *   All inserts use the PostgREST REST API (supabase.from(...).insert(...)).
 *   The auth.users FK is handled by creating real auth users via
 *   admin.auth.admin.createUser() in beforeAll, then deleting them in afterAll.
 *
 * Note on auth.users FK:
 *   public.users.id references auth.users(id). We must insert auth users first
 *   via the Admin Auth API before inserting into public.users.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: create a Supabase admin client (service role — bypasses RLS)
// ─────────────────────────────────────────────────────────────────────────────

function getAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL — add it to .env.local"
    );
  }
  if (!serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY — add it to .env.local\n" +
        "Find it in: Supabase dashboard → Project Settings → API → service_role (secret) key"
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      // Disable auto-refresh and session persistence for server-side / test use
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared state — created in beforeAll, destroyed in afterAll
// ─────────────────────────────────────────────────────────────────────────────

let admin: SupabaseClient;

// UUIDs of auth users we create for the test run
let ownerAuthId: string;
let providerAuthId: string;

// Tracking arrays for cleanup in afterAll (belt-and-suspenders approach)
const createdListingIds: string[] = [];
const createdTenantIds: string[] = [];
const createdBookingIds: string[] = [];
const createdMissionIds: string[] = [];
const createdPricingIds: string[] = [];

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL SETUP
// Creates two auth users (owner + provider) and inserts their public.users rows.
// All scenarios that need a real user UUID reference these two IDs.
// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  admin = getAdminClient();

  // --- Create owner auth user ---
  const { data: ownerData, error: ownerErr } =
    await admin.auth.admin.createUser({
      email: `qa-owner-${Date.now()}@bookit-test.dev`,
      password: "TestQA1234!",
      email_confirm: true, // Skip confirmation email — required for immediate use
    });

  if (ownerErr || !ownerData.user) {
    throw new Error(`beforeAll: failed to create owner auth user — ${ownerErr?.message}`);
  }
  ownerAuthId = ownerData.user.id;

  // --- Create provider auth user ---
  const { data: providerData, error: providerErr } =
    await admin.auth.admin.createUser({
      email: `qa-provider-${Date.now()}@bookit-test.dev`,
      password: "TestQA1234!",
      email_confirm: true,
    });

  if (providerErr || !providerData.user) {
    throw new Error(
      `beforeAll: failed to create provider auth user — ${providerErr?.message}`
    );
  }
  providerAuthId = providerData.user.id;

  // --- Insert public.users rows for the two auth users ---
  const { error: ownerInsertErr } = await admin.from("users").insert({
    id: ownerAuthId,
    type: "owner",
    first_name: "QA",
    last_name: "Owner",
    email: `qa-owner-${ownerAuthId}@bookit-test.dev`,
  });

  if (ownerInsertErr) {
    throw new Error(
      `beforeAll: failed to insert owner into public.users — ${ownerInsertErr.message}`
    );
  }

  const { error: providerInsertErr } = await admin.from("users").insert({
    id: providerAuthId,
    type: "provider",
    first_name: "QA",
    last_name: "Provider",
    email: `qa-provider-${providerAuthId}@bookit-test.dev`,
  });

  if (providerInsertErr) {
    throw new Error(
      `beforeAll: failed to insert provider into public.users — ${providerInsertErr.message}`
    );
  }
}, 30000); // 30s timeout — auth API calls can be slow

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL TEARDOWN
// Deletes all test data in reverse FK dependency order, then removes auth users.
// ─────────────────────────────────────────────────────────────────────────────

afterAll(async () => {
  if (!admin) return;

  // 1. booking_missions (FK → bookings, missions)
  if (createdBookingIds.length > 0) {
    await admin
      .from("booking_missions")
      .delete()
      .in("booking_id", createdBookingIds);
  }

  // 2. bookings (FK → listings, users, tenants, provider_pricing)
  if (createdBookingIds.length > 0) {
    await admin.from("bookings").delete().in("id", createdBookingIds);
  }

  // 3. provider_pricing_missions (FK → provider_pricing, missions)
  if (createdPricingIds.length > 0) {
    await admin
      .from("provider_pricing_missions")
      .delete()
      .in("pricing_id", createdPricingIds);
  }

  // 4. provider_pricing (FK → users)
  if (createdPricingIds.length > 0) {
    await admin.from("provider_pricing").delete().in("id", createdPricingIds);
  }

  // 5. missions (FK → users)
  if (createdMissionIds.length > 0) {
    await admin.from("missions").delete().in("id", createdMissionIds);
  }

  // 6. tenants (FK → users)
  if (createdTenantIds.length > 0) {
    await admin.from("tenants").delete().in("id", createdTenantIds);
  }

  // 7. owner_listing and listings
  if (createdListingIds.length > 0) {
    await admin
      .from("owner_listing")
      .delete()
      .in("listing_id", createdListingIds);
    await admin.from("listings").delete().in("id", createdListingIds);
  }

  // 8. owner_provider junction for our test users
  if (ownerAuthId && providerAuthId) {
    await admin
      .from("owner_provider")
      .delete()
      .eq("owner_id", ownerAuthId)
      .eq("provider_id", providerAuthId);
  }

  // 9. public.users rows (cascade will handle auth.users FK on delete, but
  //    we delete them explicitly first then remove auth users)
  if (ownerAuthId) {
    await admin.from("users").delete().eq("id", ownerAuthId);
  }
  if (providerAuthId) {
    await admin.from("users").delete().eq("id", providerAuthId);
  }

  // 10. Delete auth users (must happen after public.users due to FK direction)
  if (ownerAuthId) {
    await admin.auth.admin.deleteUser(ownerAuthId);
  }
  if (providerAuthId) {
    await admin.auth.admin.deleteUser(providerAuthId);
  }
}, 30000);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1 — All 10 tables exist in the public schema
// ─────────────────────────────────────────────────────────────────────────────

describe("Scenario 1 — All tables exist", () => {
  const expectedTables = [
    "users",
    "listings",
    "tenants",
    "owner_listing",
    "owner_provider",
    "missions",
    "provider_pricing",
    "provider_pricing_missions",
    "bookings",
    "booking_missions",
  ];

  it("all 10 table names are present in the public schema", async () => {
    // We probe each table by performing a SELECT * LIMIT 0.
    // If the table exists, PostgREST returns an empty array without error.
    // If the table does not exist, it returns an error.
    const results = await Promise.all(
      expectedTables.map(async (tableName) => {
        const { error } = await admin.from(tableName).select("*").limit(0);
        return { table: tableName, exists: !error };
      })
    );

    const missingTables = results
      .filter((r) => !r.exists)
      .map((r) => r.table);

    expect(
      missingTables,
      `The following tables are missing from the public schema: ${missingTables.join(", ")}`
    ).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2 — booking_status enum enforced
// Inserting a booking with status = 'invalid_value' must fail.
// ─────────────────────────────────────────────────────────────────────────────

describe("Scenario 2 — booking_status enum enforced", () => {
  // We create a listing + tenant just for this test so we can attempt the insert
  let listingId: string;
  let tenantId: string;

  beforeAll(async () => {
    listingId = crypto.randomUUID();
    tenantId = crypto.randomUUID();

    const { error: lErr } = await admin.from("listings").insert({
      id: listingId,
      name: "S2 Listing",
      address: "1 rue Test",
      zip_code: "75001",
      city: "Paris",
    });
    if (lErr) throw new Error(`S2 listing setup failed: ${lErr.message}`);
    createdListingIds.push(listingId);

    const { error: tErr } = await admin.from("tenants").insert({
      id: tenantId,
      owner_id: ownerAuthId,
      first_name: "S2",
      last_name: "Tenant",
    });
    if (tErr) throw new Error(`S2 tenant setup failed: ${tErr.message}`);
    createdTenantIds.push(tenantId);
  });

  it("insert with status='invalid_value' must return a Postgres enum error", async () => {
    const { error } = await admin.from("bookings").insert({
      listing_id: listingId,
      provider_id: providerAuthId,
      tenant_id: tenantId,
      check_in: "2026-06-01",
      check_out: "2026-06-07",
      source: "airbnb",
      nb_pax: 2,
      rental_price: 500,
      provider_fee: 80,
      status: "invalid_value", // The value being tested — not a valid booking_status member
    });

    expect(
      error,
      "Expected an error for invalid booking_status but none was returned"
    ).not.toBeNull();

    // Postgres error 22P02 = invalid_text_representation (fired when an invalid
    // enum value is supplied). Supabase surfaces this in the error message.
    expect(error!.message).toMatch(
      /invalid input value for enum|22P02|invalid_text_representation/i
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3 — booking_source enum enforced
// ─────────────────────────────────────────────────────────────────────────────

describe("Scenario 3 — booking_source enum enforced", () => {
  let listingId: string;
  let tenantId: string;

  beforeAll(async () => {
    listingId = crypto.randomUUID();
    tenantId = crypto.randomUUID();

    const { error: lErr } = await admin.from("listings").insert({
      id: listingId,
      name: "S3 Listing",
      address: "1 rue Test",
      zip_code: "75001",
      city: "Paris",
    });
    if (lErr) throw new Error(`S3 listing setup failed: ${lErr.message}`);
    createdListingIds.push(listingId);

    const { error: tErr } = await admin.from("tenants").insert({
      id: tenantId,
      owner_id: ownerAuthId,
      first_name: "S3",
      last_name: "Tenant",
    });
    if (tErr) throw new Error(`S3 tenant setup failed: ${tErr.message}`);
    createdTenantIds.push(tenantId);
  });

  it("insert with source='booking.com' must return a Postgres enum error", async () => {
    // 'booking.com' is not in the booking_source enum — only 'airbnb' and 'direct' are
    const { error } = await admin.from("bookings").insert({
      listing_id: listingId,
      provider_id: providerAuthId,
      tenant_id: tenantId,
      check_in: "2026-06-01",
      check_out: "2026-06-07",
      source: "booking.com",
      nb_pax: 2,
      rental_price: 500,
      provider_fee: 80,
    });

    expect(
      error,
      "Expected an error for invalid booking_source but none was returned"
    ).not.toBeNull();
    expect(error!.message).toMatch(
      /invalid input value for enum|22P02|invalid_text_representation/i
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4 — user_type enum enforced
// ─────────────────────────────────────────────────────────────────────────────

describe("Scenario 4 — user_type enum enforced", () => {
  it("insert into users with type='admin' must return a Postgres enum error", async () => {
    // Create a temporary auth user so the FK to auth.users is satisfied.
    // The enum violation on user_type should fire at the application layer
    // (or alongside the FK check). Either way, the insert must fail.
    const { data: tempAuthData } = await admin.auth.admin.createUser({
      email: `qa-enum-type-test-${Date.now()}@bookit-test.dev`,
      password: "TestQA1234!",
      email_confirm: true,
    });

    const tempAuthId = tempAuthData?.user?.id ?? crypto.randomUUID();

    const { error } = await admin.from("users").insert({
      id: tempAuthId,
      type: "admin", // 'admin' is not a valid user_type — only 'owner' and 'provider' are
      first_name: "Bad",
      last_name: "Type",
      email: "badtype@bookit-test.dev",
    });

    // Clean up the temp auth user even if the assertion fails
    if (tempAuthData?.user?.id) {
      await admin.auth.admin.deleteUser(tempAuthData.user.id);
    }

    expect(
      error,
      "Expected an error for invalid user_type but none was returned"
    ).not.toBeNull();
    expect(error!.message).toMatch(
      /invalid input value for enum|22P02|invalid_text_representation/i
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5 — nb_pax CHECK (nb_pax > 0) enforced
// ─────────────────────────────────────────────────────────────────────────────

describe("Scenario 5 — nb_pax CHECK constraint enforced", () => {
  let listingId: string;
  let tenantId: string;

  beforeAll(async () => {
    listingId = crypto.randomUUID();
    tenantId = crypto.randomUUID();

    const { error: lErr } = await admin.from("listings").insert({
      id: listingId,
      name: "S5 Listing",
      address: "1 rue Test",
      zip_code: "75001",
      city: "Paris",
    });
    if (lErr) throw new Error(`S5 listing setup failed: ${lErr.message}`);
    createdListingIds.push(listingId);

    const { error: tErr } = await admin.from("tenants").insert({
      id: tenantId,
      owner_id: ownerAuthId,
      first_name: "S5",
      last_name: "Tenant",
    });
    if (tErr) throw new Error(`S5 tenant setup failed: ${tErr.message}`);
    createdTenantIds.push(tenantId);
  });

  it("insert with nb_pax=0 must fail with a CHECK constraint violation", async () => {
    const { error } = await admin.from("bookings").insert({
      listing_id: listingId,
      provider_id: providerAuthId,
      tenant_id: tenantId,
      check_in: "2026-06-01",
      check_out: "2026-06-07",
      source: "airbnb",
      nb_pax: 0, // Violates CHECK (nb_pax > 0)
      rental_price: 500,
      provider_fee: 80,
    });

    expect(
      error,
      "Expected a CHECK constraint error for nb_pax=0 but none was returned"
    ).not.toBeNull();
    // Postgres error 23514 = check_violation
    expect(error!.message).toMatch(/check.*constraint|23514|nb_pax/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6 — CHECK (check_out > check_in) enforced
// ─────────────────────────────────────────────────────────────────────────────

describe("Scenario 6 — check_out > check_in CHECK constraint enforced", () => {
  let listingId: string;
  let tenantId: string;

  beforeAll(async () => {
    listingId = crypto.randomUUID();
    tenantId = crypto.randomUUID();

    const { error: lErr } = await admin.from("listings").insert({
      id: listingId,
      name: "S6 Listing",
      address: "1 rue Test",
      zip_code: "75001",
      city: "Paris",
    });
    if (lErr) throw new Error(`S6 listing setup failed: ${lErr.message}`);
    createdListingIds.push(listingId);

    const { error: tErr } = await admin.from("tenants").insert({
      id: tenantId,
      owner_id: ownerAuthId,
      first_name: "S6",
      last_name: "Tenant",
    });
    if (tErr) throw new Error(`S6 tenant setup failed: ${tErr.message}`);
    createdTenantIds.push(tenantId);
  });

  it("insert with check_out = check_in must fail with a CHECK constraint violation", async () => {
    const { error } = await admin.from("bookings").insert({
      listing_id: listingId,
      provider_id: providerAuthId,
      tenant_id: tenantId,
      check_in: "2026-06-01",
      check_out: "2026-06-01", // Same date — violates CHECK (check_out > check_in)
      source: "airbnb",
      nb_pax: 2,
      rental_price: 500,
      provider_fee: 80,
    });

    expect(
      error,
      "Expected a CHECK constraint error for check_out=check_in but none was returned"
    ).not.toBeNull();
    expect(error!.message).toMatch(/check.*constraint|23514|check_out/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7 — Duplicate (booking_id, mission_id) in booking_missions blocked
// ─────────────────────────────────────────────────────────────────────────────

describe("Scenario 7 — Duplicate booking_mission PK blocked", () => {
  let listingId: string;
  let tenantId: string;
  let bookingId: string;
  let missionId: string;

  beforeAll(async () => {
    listingId = crypto.randomUUID();
    tenantId = crypto.randomUUID();
    missionId = crypto.randomUUID();

    const { error: lErr } = await admin.from("listings").insert({
      id: listingId,
      name: "S7 Listing",
      address: "1 rue Test",
      zip_code: "75001",
      city: "Paris",
    });
    if (lErr) throw new Error(`S7 listing setup failed: ${lErr.message}`);
    createdListingIds.push(listingId);

    const { error: tErr } = await admin.from("tenants").insert({
      id: tenantId,
      owner_id: ownerAuthId,
      first_name: "S7",
      last_name: "Tenant",
    });
    if (tErr) throw new Error(`S7 tenant setup failed: ${tErr.message}`);
    createdTenantIds.push(tenantId);

    const { data: bData, error: bErr } = await admin
      .from("bookings")
      .insert({
        listing_id: listingId,
        provider_id: providerAuthId,
        tenant_id: tenantId,
        check_in: "2026-06-01",
        check_out: "2026-06-07",
        source: "airbnb",
        nb_pax: 2,
        rental_price: 500,
        provider_fee: 80,
      })
      .select("id")
      .single();

    if (bErr || !bData) throw new Error(`S7 booking setup failed: ${bErr?.message}`);
    bookingId = bData.id;
    createdBookingIds.push(bookingId);

    const { error: mErr } = await admin.from("missions").insert({
      id: missionId,
      owner_id: ownerAuthId,
      label: "S7 Mission",
    });
    if (mErr) throw new Error(`S7 mission setup failed: ${mErr.message}`);
    createdMissionIds.push(missionId);

    // First insert must succeed — it sets up the state for the test
    const { error: firstErr } = await admin
      .from("booking_missions")
      .insert({ booking_id: bookingId, mission_id: missionId });
    if (firstErr) {
      throw new Error(`S7 first booking_mission insert failed: ${firstErr.message}`);
    }
  });

  afterAll(async () => {
    // Clean up the booking_missions row (the booking and mission are in global cleanup)
    if (bookingId && missionId) {
      await admin
        .from("booking_missions")
        .delete()
        .eq("booking_id", bookingId)
        .eq("mission_id", missionId);
    }
  });

  it("second insert of the same (booking_id, mission_id) must fail with PK/unique violation", async () => {
    const { error } = await admin.from("booking_missions").insert({
      booking_id: bookingId,
      mission_id: missionId, // Duplicate of what we inserted in beforeAll
    });

    expect(
      error,
      "Expected a PK violation for duplicate booking_mission but none was returned"
    ).not.toBeNull();
    // Postgres error 23505 = unique_violation (composite PK violations also use this code)
    expect(error!.message).toMatch(/duplicate|unique.*violation|23505/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8 — Duplicate (pricing_id, mission_id) in provider_pricing_missions blocked
// ─────────────────────────────────────────────────────────────────────────────

describe("Scenario 8 — Duplicate provider_pricing_mission PK blocked", () => {
  let pricingId: string;
  let missionId: string;

  beforeAll(async () => {
    pricingId = crypto.randomUUID();
    missionId = crypto.randomUUID();

    const { error: pErr } = await admin.from("provider_pricing").insert({
      id: pricingId,
      owner_id: ownerAuthId,
      provider_id: providerAuthId,
      label: "S8 Preset",
      fee: 80,
    });
    if (pErr) throw new Error(`S8 pricing setup failed: ${pErr.message}`);
    createdPricingIds.push(pricingId);

    const { error: mErr } = await admin.from("missions").insert({
      id: missionId,
      owner_id: ownerAuthId,
      label: "S8 Mission",
    });
    if (mErr) throw new Error(`S8 mission setup failed: ${mErr.message}`);
    createdMissionIds.push(missionId);

    // First insert must succeed
    const { error: firstErr } = await admin
      .from("provider_pricing_missions")
      .insert({ pricing_id: pricingId, mission_id: missionId });
    if (firstErr) {
      throw new Error(`S8 first pricing_mission insert failed: ${firstErr.message}`);
    }
  });

  afterAll(async () => {
    if (pricingId && missionId) {
      await admin
        .from("provider_pricing_missions")
        .delete()
        .eq("pricing_id", pricingId)
        .eq("mission_id", missionId);
    }
  });

  it("second insert of the same (pricing_id, mission_id) must fail with PK/unique violation", async () => {
    const { error } = await admin.from("provider_pricing_missions").insert({
      pricing_id: pricingId,
      mission_id: missionId,
    });

    expect(
      error,
      "Expected a PK violation for duplicate provider_pricing_mission but none was returned"
    ).not.toBeNull();
    expect(error!.message).toMatch(/duplicate|unique.*violation|23505/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9 — UNIQUE (owner_id, provider_id, label) on provider_pricing enforced
// ─────────────────────────────────────────────────────────────────────────────

describe("Scenario 9 — Duplicate provider_pricing label blocked", () => {
  let firstPricingId: string;
  const duplicateLabel = "S9 Duplicate Label";

  beforeAll(async () => {
    firstPricingId = crypto.randomUUID();

    const { error } = await admin.from("provider_pricing").insert({
      id: firstPricingId,
      owner_id: ownerAuthId,
      provider_id: providerAuthId,
      label: duplicateLabel,
      fee: 80,
    });
    if (error) throw new Error(`S9 first pricing insert failed: ${error.message}`);
    createdPricingIds.push(firstPricingId);
  });

  afterAll(async () => {
    // Clean up any duplicate that may have slipped through
    await admin
      .from("provider_pricing")
      .delete()
      .eq("owner_id", ownerAuthId)
      .eq("provider_id", providerAuthId)
      .eq("label", duplicateLabel);
  });

  it("second provider_pricing row with same (owner_id, provider_id, label) must fail", async () => {
    const { error } = await admin.from("provider_pricing").insert({
      id: crypto.randomUUID(),
      owner_id: ownerAuthId,
      provider_id: providerAuthId,
      label: duplicateLabel, // Same label — UNIQUE constraint must fire
      fee: 90,               // Different fee, still a violation because label key is the same
    });

    expect(
      error,
      "Expected a UNIQUE violation for duplicate (owner_id, provider_id, label) but none was returned"
    ).not.toBeNull();
    expect(error!.message).toMatch(/duplicate|unique.*violation|23505/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10 — FK on bookings.tenant_id rejects a non-existent tenant
// ─────────────────────────────────────────────────────────────────────────────

describe("Scenario 10 — FK on bookings.tenant_id enforced", () => {
  let listingId: string;

  beforeAll(async () => {
    listingId = crypto.randomUUID();

    const { error } = await admin.from("listings").insert({
      id: listingId,
      name: "S10 Listing",
      address: "1 rue Test",
      zip_code: "75001",
      city: "Paris",
    });
    if (error) throw new Error(`S10 listing setup failed: ${error.message}`);
    createdListingIds.push(listingId);
  });

  it("insert a booking with a non-existent tenant_id must fail with FK violation", async () => {
    // This UUID does not exist in the tenants table — the FK must reject it
    const nonExistentTenantId = "00000000-0000-0000-0000-000000000099";

    const { error } = await admin.from("bookings").insert({
      listing_id: listingId,
      provider_id: providerAuthId,
      tenant_id: nonExistentTenantId, // FK violation expected
      check_in: "2026-06-01",
      check_out: "2026-06-07",
      source: "airbnb",
      nb_pax: 2,
      rental_price: 500,
      provider_fee: 80,
    });

    expect(
      error,
      "Expected a FK violation for non-existent tenant_id but none was returned"
    ).not.toBeNull();
    // Postgres error 23503 = foreign_key_violation
    expect(error!.message).toMatch(/foreign.*key.*violation|23503|tenant/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 11 — Manual fee: booking with pricing_id = NULL accepted
// ─────────────────────────────────────────────────────────────────────────────

describe("Scenario 11 — Booking with pricing_id = NULL (manual fee)", () => {
  let listingId: string;
  let tenantId: string;
  let bookingId: string;

  beforeAll(async () => {
    listingId = crypto.randomUUID();
    tenantId = crypto.randomUUID();

    const { error: lErr } = await admin.from("listings").insert({
      id: listingId,
      name: "S11 Listing",
      address: "1 rue Test",
      zip_code: "75001",
      city: "Paris",
    });
    if (lErr) throw new Error(`S11 listing setup failed: ${lErr.message}`);
    createdListingIds.push(listingId);

    const { error: tErr } = await admin.from("tenants").insert({
      id: tenantId,
      owner_id: ownerAuthId,
      first_name: "S11",
      last_name: "Tenant",
    });
    if (tErr) throw new Error(`S11 tenant setup failed: ${tErr.message}`);
    createdTenantIds.push(tenantId);
  });

  afterAll(async () => {
    if (bookingId) {
      await admin.from("bookings").delete().eq("id", bookingId);
    }
  });

  it("must succeed: booking with pricing_id=null and a manual provider_fee is accepted", async () => {
    const { data, error } = await admin
      .from("bookings")
      .insert({
        listing_id: listingId,
        provider_id: providerAuthId,
        tenant_id: tenantId,
        pricing_id: null, // Explicitly null — provider fee was entered manually
        check_in: "2026-06-01",
        check_out: "2026-06-07",
        source: "direct",
        nb_pax: 2,
        rental_price: 400,
        provider_fee: 65,
      })
      .select("id, pricing_id, provider_fee")
      .single();

    expect(error, `Expected success but got: ${error?.message}`).toBeNull();
    expect(data).not.toBeNull();

    // pricing_id must be stored as NULL
    expect(
      data!.pricing_id,
      "Expected pricing_id to be null but it was not"
    ).toBeNull();

    // provider_fee must be the value we inserted, not 0 or undefined
    expect(data!.provider_fee).toBe(65);

    bookingId = data!.id;
    createdBookingIds.push(bookingId);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 12 — provider_fee is a snapshot, independent of pricing preset changes
// ─────────────────────────────────────────────────────────────────────────────

describe("Scenario 12 — provider_fee is a snapshot (independent of pricing changes)", () => {
  let listingId: string;
  let tenantId: string;
  let pricingId: string;
  let bookingId: string;
  const originalFee = 50; // The fee we snapshot at booking creation time

  beforeAll(async () => {
    listingId = crypto.randomUUID();
    tenantId = crypto.randomUUID();
    pricingId = crypto.randomUUID();

    const { error: lErr } = await admin.from("listings").insert({
      id: listingId,
      name: "S12 Listing",
      address: "1 rue Test",
      zip_code: "75001",
      city: "Paris",
    });
    if (lErr) throw new Error(`S12 listing setup failed: ${lErr.message}`);
    createdListingIds.push(listingId);

    const { error: tErr } = await admin.from("tenants").insert({
      id: tenantId,
      owner_id: ownerAuthId,
      first_name: "S12",
      last_name: "Tenant",
    });
    if (tErr) throw new Error(`S12 tenant setup failed: ${tErr.message}`);
    createdTenantIds.push(tenantId);

    const { error: pErr } = await admin.from("provider_pricing").insert({
      id: pricingId,
      owner_id: ownerAuthId,
      provider_id: providerAuthId,
      label: "S12 Preset",
      fee: originalFee,
    });
    if (pErr) throw new Error(`S12 pricing setup failed: ${pErr.message}`);
    createdPricingIds.push(pricingId);

    // Create a booking that snapshots the fee at originalFee
    const { data: bData, error: bErr } = await admin
      .from("bookings")
      .insert({
        listing_id: listingId,
        provider_id: providerAuthId,
        tenant_id: tenantId,
        pricing_id: pricingId,
        check_in: "2026-06-01",
        check_out: "2026-06-07",
        source: "airbnb",
        nb_pax: 2,
        rental_price: 500,
        provider_fee: originalFee, // Snapshotted at booking creation time
      })
      .select("id")
      .single();

    if (bErr || !bData) throw new Error(`S12 booking setup failed: ${bErr?.message}`);
    bookingId = bData.id;
    createdBookingIds.push(bookingId);
  });

  it("after updating the pricing preset fee to 75, booking.provider_fee must still be 50", async () => {
    // Change the pricing preset fee — this must NOT affect existing bookings
    const { error: updateErr } = await admin
      .from("provider_pricing")
      .update({ fee: 75 })
      .eq("id", pricingId);

    expect(updateErr, `Pricing update failed: ${updateErr?.message}`).toBeNull();

    // Read back the booking's provider_fee
    const { data, error } = await admin
      .from("bookings")
      .select("provider_fee")
      .eq("id", bookingId)
      .single();

    expect(error, `Booking read failed: ${error?.message}`).toBeNull();
    expect(
      data!.provider_fee,
      `provider_fee changed after preset update — snapshot not working. Expected ${originalFee}, got ${data!.provider_fee}`
    ).toBe(originalFee);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 13 — Happy path: complete data chain
// owner → listing → owner_listing → owner_provider → tenant →
// mission → pricing preset → provider_pricing_mission → booking → booking_mission
// ─────────────────────────────────────────────────────────────────────────────

describe("Scenario 13 — Happy path: full data chain", () => {
  // Local tracking variables (not added to global arrays — we clean up in afterAll here)
  let listingId: string;
  let tenantId: string;
  let missionId: string;
  let pricingId: string;
  let bookingId: string;

  afterAll(async () => {
    // Clean up in strict reverse FK dependency order
    if (bookingId) {
      await admin.from("booking_missions").delete().eq("booking_id", bookingId);
      await admin.from("bookings").delete().eq("id", bookingId);
    }
    if (pricingId) {
      await admin.from("provider_pricing_missions").delete().eq("pricing_id", pricingId);
      await admin.from("provider_pricing").delete().eq("id", pricingId);
    }
    if (missionId) {
      await admin.from("missions").delete().eq("id", missionId);
    }
    if (tenantId) {
      await admin.from("tenants").delete().eq("id", tenantId);
    }
    if (listingId) {
      await admin.from("owner_listing").delete()
        .eq("owner_id", ownerAuthId)
        .eq("listing_id", listingId);
      await admin.from("listings").delete().eq("id", listingId);
    }
    await admin.from("owner_provider").delete()
      .eq("owner_id", ownerAuthId)
      .eq("provider_id", providerAuthId);
  });

  it("must successfully insert and verify every link in the chain", async () => {
    listingId = crypto.randomUUID();
    tenantId = crypto.randomUUID();
    missionId = crypto.randomUUID();
    pricingId = crypto.randomUUID();

    // 1. Insert listing
    const { error: lErr } = await admin.from("listings").insert({
      id: listingId,
      name: "Happy Path Listing",
      address: "10 rue Exemple",
      zip_code: "69001",
      city: "Lyon",
    });
    expect(lErr, `Listing insert failed: ${lErr?.message}`).toBeNull();

    // 2. Link owner → listing
    const { error: olErr } = await admin.from("owner_listing").insert({
      owner_id: ownerAuthId,
      listing_id: listingId,
    });
    expect(olErr, `owner_listing insert failed: ${olErr?.message}`).toBeNull();

    // 3. Link owner → provider
    const { error: opErr } = await admin.from("owner_provider").insert({
      owner_id: ownerAuthId,
      provider_id: providerAuthId,
    });
    expect(opErr, `owner_provider insert failed: ${opErr?.message}`).toBeNull();

    // 4. Insert tenant (scoped to owner)
    const { error: tErr } = await admin.from("tenants").insert({
      id: tenantId,
      owner_id: ownerAuthId,
      first_name: "Jean",
      last_name: "Dupont",
      email: "jean@dupont.fr",
    });
    expect(tErr, `Tenant insert failed: ${tErr?.message}`).toBeNull();

    // 5. Insert mission (scoped to owner)
    const { error: mErr } = await admin.from("missions").insert({
      id: missionId,
      owner_id: ownerAuthId,
      label: "Nettoyage complet",
    });
    expect(mErr, `Mission insert failed: ${mErr?.message}`).toBeNull();

    // 6. Insert pricing preset
    const { error: ppErr } = await admin.from("provider_pricing").insert({
      id: pricingId,
      owner_id: ownerAuthId,
      provider_id: providerAuthId,
      label: "Forfait standard",
      fee: 85,
      currency: "EUR",
    });
    expect(ppErr, `Pricing preset insert failed: ${ppErr?.message}`).toBeNull();

    // 7. Link mission → pricing preset
    const { error: ppmErr } = await admin
      .from("provider_pricing_missions")
      .insert({ pricing_id: pricingId, mission_id: missionId });
    expect(ppmErr, `provider_pricing_missions insert failed: ${ppmErr?.message}`).toBeNull();

    // 8. Insert booking (with snapshotted fee and confirmed status)
    const { data: bData, error: bErr } = await admin
      .from("bookings")
      .insert({
        listing_id: listingId,
        provider_id: providerAuthId,
        tenant_id: tenantId,
        pricing_id: pricingId,
        check_in: "2026-07-01",
        check_out: "2026-07-07",
        source: "airbnb",
        nb_pax: 3,
        rental_price: 750,
        currency: "EUR",
        provider_fee: 85, // Snapshotted from the pricing preset at insert time
        status: "confirmed",
      })
      .select("id, currency, status, pricing_id, provider_fee")
      .single();

    expect(bErr, `Booking insert failed: ${bErr?.message}`).toBeNull();
    expect(bData).not.toBeNull();

    // Verify booking fields — defaults and explicitly set values
    expect(bData!.currency).toBe("EUR");
    expect(bData!.status).toBe("confirmed");
    expect(bData!.pricing_id).toBe(pricingId);
    expect(bData!.provider_fee).toBe(85);
    bookingId = bData!.id;

    // 9. Link mission → booking
    const { error: bmErr } = await admin
      .from("booking_missions")
      .insert({ booking_id: bookingId, mission_id: missionId });
    expect(bmErr, `booking_missions insert failed: ${bmErr?.message}`).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 14 — DOWN migration correctness
//
// We cannot execute DROP TABLE inside a rolled-back transaction via PostgREST
// (PostgREST does not support multi-statement DDL transactions).
// Instead, we perform two complementary checks:
//
//   14a) Tables still exist after the migration ran — proving the DOWN section
//        (the DROP statements) did NOT execute as part of the UP migration.
//        This is the critical regression introduced by the bug in the original
//        migration file (DROP TABLE statements were not commented out).
//
//   14b) Static analysis of the migration file — verifying the DOWN section
//        contains only commented-out DROP statements (no live DDL).
// ─────────────────────────────────────────────────────────────────────────────

describe("Scenario 14 — DOWN migration correctness", () => {
  const expectedTables = [
    "users",
    "listings",
    "tenants",
    "owner_listing",
    "owner_provider",
    "missions",
    "provider_pricing",
    "provider_pricing_missions",
    "bookings",
    "booking_missions",
  ];

  const migrationPath = resolve(
    __dirname,
    "../../supabase/migrations/20260409000000_initial_schema.sql"
  );

  it("14a — all 10 tables still exist (DOWN section did not run as part of the UP migration)", async () => {
    // If the DROP TABLE statements had executed, the tables would be gone.
    // Checking table existence here confirms the UP migration ran cleanly.
    const results = await Promise.all(
      expectedTables.map(async (tableName) => {
        const { error } = await admin.from(tableName).select("*").limit(0);
        return { table: tableName, exists: !error };
      })
    );

    const missingTables = results
      .filter((r) => !r.exists)
      .map((r) => r.table);

    expect(
      missingTables,
      `These tables are missing — the DOWN migration may have run during the UP migration: ${missingTables.join(", ")}`
    ).toHaveLength(0);
  });

  it("14b — migration file DOWN section contains only commented-out DROP statements (static check)", () => {
    // This test reads the migration file from disk and checks that every DROP
    // statement in the DOWN section is preceded by '--' (commented out).
    // An uncommented DROP would destroy the schema when Supabase runs the migration.

    expect(
      existsSync(migrationPath),
      `Migration file not found at: ${migrationPath}`
    ).toBe(true);

    const content = readFileSync(migrationPath, "utf-8");
    const downMarkerIndex = content.indexOf("-- DOWN");

    expect(
      downMarkerIndex,
      "Migration file is missing a '-- DOWN' section marker"
    ).toBeGreaterThan(0);

    // Slice out only the DOWN section
    const downSection = content.slice(downMarkerIndex);

    // Find any line that starts with DROP (not preceded by --)
    const uncommentedDropLines = downSection
      .split("\n")
      .filter((line) => /^\s*DROP\s/i.test(line) && !/^\s*--/.test(line));

    expect(
      uncommentedDropLines,
      `Found ${uncommentedDropLines.length} uncommented DROP statement(s) in the DOWN section.\n` +
        `These will destroy the schema when the migration runs:\n` +
        uncommentedDropLines.join("\n")
    ).toHaveLength(0);
  });
});
