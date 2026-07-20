import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const dist = join(root, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

cpSync(join(root, "index.html"), join(dist, "index.html"));
cpSync(join(root, "Asset"), join(dist, "Asset"), { recursive: true });

const html = readFileSync(join(root, "index.html"), "utf8");
for (const [dir, mode] of [["bgm-off", "nobgm"], ["sfx-off", "nosfx"]]) {
  const outDir = join(dist, dir);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, "index.html"),
    html.replace("<script>\n\"use strict\";", `<script>window.__AUDIO_TEST_MODE="${mode}";</script>\n<script>\n"use strict";`)
  );
}

console.log("Built static site to dist/");
