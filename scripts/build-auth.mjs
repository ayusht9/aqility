import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
await mkdir(new URL("../dist/vendor/", import.meta.url), { recursive: true });
await build({
  stdin: {
    contents: 'export { createClient } from "@supabase/supabase-js";',
    resolveDir: fileURLToPath(new URL("../", import.meta.url)),
    sourcefile: "supabase-entry.js",
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  minify: true,
  legalComments: "eof",
  outfile: fileURLToPath(
    new URL("../dist/vendor/supabase.js", import.meta.url),
  ),
});
console.log("Bundled Supabase browser SDK.");
