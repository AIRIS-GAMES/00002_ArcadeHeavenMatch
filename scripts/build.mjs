import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const dist = join(root, "dist");
const envLocal = join(root, ".env.local");
const vendor = join(dist, "vendor");

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const entries = {};
  const text = readFileSync(path, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    entries[key] = value;
  }
  return entries;
}

function envValue(key, localEnv) {
  return process.env[key] ?? localEnv[key] ?? "";
}

function jsString(value) {
  return JSON.stringify(value).slice(1, -1);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
mkdirSync(vendor, { recursive: true });

const localEnv = parseEnvFile(envLocal);
const supabaseUrl = envValue("SUPABASE_URL", localEnv);
const supabasePublishableKey = envValue("SUPABASE_PUBLISHABLE_KEY", localEnv);

let html = readFileSync(join(root, "index.html"), "utf8");
html = html
  .replaceAll("__SUPABASE_URL__", jsString(supabaseUrl))
  .replaceAll("__SUPABASE_PUBLISHABLE_KEY__", jsString(supabasePublishableKey))
  .replaceAll(
    "node_modules/@supabase/supabase-js/dist/umd/supabase.js",
    "vendor/supabase.js"
  );

writeFileSync(join(dist, "index.html"), html);
cpSync(join(root, "Asset"), join(dist, "Asset"), { recursive: true });
// Keep high-resolution source artwork in the repository, but ship the smaller
// game-ready copies referenced by index.html to reduce install/download size.
for (const file of [
  "chara1_sub.PNG",
  "chara2_sub.PNG",
  "chara3_sub.PNG",
  "chara4_sub.PNG",
  "chara5_sub.PNG",
  "star_display.png"
]) {
  rmSync(join(dist, "Asset", file), { force: true });
}
cpSync(join(root, "fonts"), join(dist, "fonts"), { recursive: true });
cpSync(join(root, "src"), join(dist, "src"), { recursive: true });
cpSync(
  join(root, "node_modules", "@supabase", "supabase-js", "dist", "umd", "supabase.js"),
  join(vendor, "supabase.js")
);
// GameAnalytics も同梱する（CDN からの実行時取得を避ける）
cpSync(
  join(root, "node_modules", "gameanalytics", "dist", "GameAnalytics.min.js"),
  join(vendor, "GameAnalytics.min.js")
);

console.log("Built static site to dist/");
