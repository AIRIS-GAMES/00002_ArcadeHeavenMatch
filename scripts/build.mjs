import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const dist = join(root, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

cpSync(join(root, "index.html"), join(dist, "index.html"));
cpSync(join(root, "Asset"), join(dist, "Asset"), { recursive: true });

const html = readFileSync(join(root, "index.html"), "utf8");
for (const [dir, mode] of [["bgm-off", "nobgm"], ["sfx-off", "nosfx"], ["silent", "silent"]]) {
  const outDir = join(dist, dir);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, "index.html"),
    html.replace("<script>\n\"use strict\";", `<script>window.__AUDIO_TEST_MODE="${mode}";</script>\n<script>\n"use strict";`)
  );
}

mkdirSync(join(dist, "blank-silent"), { recursive: true });
writeFileSync(join(dist, "blank-silent", "index.html"), `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Silent Audio Test</title>
<style>
  html,body { height:100%; margin:0; background:#111; color:#fff; font-family:sans-serif; display:grid; place-items:center; }
  main { text-align:center; line-height:1.7; padding:24px; }
  strong { display:block; font-size:18px; margin-bottom:8px; }
</style>
</head>
<body>
  <main>
    <strong>BLANK SILENT TEST</strong>
    <div>このページには audio タグも AudioContext もありません。</div>
  </main>
</body>
</html>
`);

console.log("Built static site to dist/");
