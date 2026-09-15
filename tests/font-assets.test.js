import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const html = readFileSync(join(root, "index.html"), "utf8");
const build = readFileSync(join(root, "scripts", "build.mjs"), "utf8");
const fontDir = join(root, "fonts", "m-plus-rounded-1c");
const fonts = [
  ["MPLUSRounded1c-Medium.ttf", 500],
  ["MPLUSRounded1c-Bold.ttf", 700],
  ["MPLUSRounded1c-ExtraBold.ttf", 800]
];

test("M PLUS Rounded 1cの必要な3ウェイトとライセンスを同梱する", () => {
  for(const [file, weight] of fonts){
    const path = join(fontDir, file);
    assert.equal(existsSync(path), true, `${file} should exist`);
    assert.ok(statSync(path).size > 1_000_000, `${file} should contain the full Japanese font`);
    assert.deepEqual([...readFileSync(path).subarray(0, 4)], [0, 1, 0, 0], `${file} should be a valid TrueType font`);
    assert.match(html, new RegExp(`font-weight:${weight};`));
    assert.match(html, new RegExp(file.replace(".", "\\.")));
  }
  assert.equal(existsSync(join(fontDir, "OFL.txt")), true);
  assert.match(readFileSync(join(fontDir, "OFL.txt"), "utf8"), /SIL OPEN FONT LICENSE Version 1\.1/);
});

test("フォントは外部配信に依存せず、ビルドとCanvasにも適用される", () => {
  assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.match(html, /const FONT_FAMILY = .*M PLUS Rounded 1c/);
  assert.doesNotMatch(html, /dialogFontSize|entryMessage|specialMessage|exitMessage/);
  assert.match(html, /loadGameFonts\(\)/);
  assert.match(build, /join\(root, "fonts"\).*join\(dist, "fonts"\)/);
});
