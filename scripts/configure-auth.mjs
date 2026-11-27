import { writeFile } from "node:fs/promises";
import { validateAuthConfig } from "../dist/auth-validation.js";

// These are public browser configuration values, not service or SMTP credentials.
try {
  const config = validateAuthConfig({
    supabaseUrl: process.env.PUBLIC_SUPABASE_URL,
    publishableKey: process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (!config)
    throw new Error(
      "Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  await writeFile(
    new URL("../dist/auth-config.json", import.meta.url),
    JSON.stringify(config, null, 2) + "\n",
  );
  console.log("Public authentication configuration saved.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
