import { createClient } from "@supabase/supabase-js";
import { E2E_USER } from "../e2e/fixtures.ts";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl) {
  console.error("Missing required environment variable: SUPABASE_URL");
  process.exit(1);
}

if (!serviceRoleKey) {
  console.error(
    "Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function seed() {
  const { error: createError } = await supabase.auth.admin.createUser({
    email: E2E_USER.email,
    password: E2E_USER.password,
    email_confirm: true,
  });

  if (createError) {
    const isExisting =
      createError.message.toLowerCase().includes("already registered") ||
      createError.message.toLowerCase().includes("already exists") ||
      createError.status === 422 ||
      createError.code === "email_exists";

    if (!isExisting) {
      console.error(`Failed to create test user: ${createError.message}`);
      process.exit(1);
    }

    const {
      data: { users },
      error: listError,
    } = await supabase.auth.admin.listUsers();

    if (listError) {
      console.error(`Failed to list users: ${listError.message}`);
      process.exit(1);
    }

    const existingUser = users.find(
      (u) => u.email?.toLowerCase() === E2E_USER.email.toLowerCase(),
    );

    if (!existingUser) {
      console.error(
        `User reported as existing but not found in user list: ${createError.message}`,
      );
      process.exit(1);
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(
      existingUser.id,
      {
        password: E2E_USER.password,
        email_confirm: true,
      },
    );

    if (updateError) {
      console.error(`Failed to update existing user: ${updateError.message}`);
      process.exit(1);
    }
  }

  console.log(`SEED_E2E_USER PASS email=${E2E_USER.email}`);
}

await seed();
