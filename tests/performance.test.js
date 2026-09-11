import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const html = readFileSync(join(root, "index.html"), "utf8");
const build = readFileSync(join(root, "scripts", "build.mjs"), "utf8");

function pngDimensions(path) {
  const png = readFileSync(path);
  assert.deepEqual([...png.subarray(1, 4)], [0x50, 0x4e, 0x47]);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

test("ゲーム描画は共通の常時省電力設定を使い、非表示時に停止する", () => {
  assert.match(html, /const ACTIVE_FRAME_RATE = GAME_CONFIG\.performance\.activeFrameRate;/);
  assert.match(html, /const MAX_RENDER_DPR = GAME_CONFIG\.performance\.maxDpr;/);
  assert.match(html, /if\(document\.hidden\)\{\s*pauseBgm\(\);\s*stopGameLoop\(\);/);
  assert.match(html, /now-lastRenderedAt<FRAME_INTERVAL_MS-1/);
});

test("24fps・DPR 2・軽量エフェクトを常時適用し、切替UIを生成しない", () => {
  assert.doesNotMatch(html, /id="btn-power-save"|id="btn-settings-power"|powerSaveEnabled/);
  assert.match(html, /const REDUCED_EFFECTS = GAME_CONFIG\.performance\.reducedEffects;/);
  assert.match(html, /DPR = Math\.min\(window\.devicePixelRatio\|\|1, MAX_RENDER_DPR\)/);
  assert.match(html, /ctx\.imageSmoothingQuality = "high"/);
  assert.match(html, /baseCount\*PARTICLE_DENSITY/);
  assert.match(html, /if\(shakeT>0 && !REDUCED_EFFECTS\)/);
});

test("背景とおっ！サン配置はキャッシュを利用する", () => {
  assert.match(html, /const backgroundLayer = document\.createElement\("canvas"\)/);
  assert.match(html, /backgroundLayer\.width=Math\.max\(1,Math\.ceil\(W\*DPR\)\)/);
  assert.match(html, /function getHudRectCached\(\)/);
  assert.match(html, /function getOhsunHeroLayoutCached\(\)/);
  assert.match(html, /cachedBackgroundKey=key/);
});

test("ゲーム表示用画像は軽量版だけを参照する", () => {
  const optimizedDir = join(root, "Asset", "game", "optimized");
  const files = ["chara1.png", "chara2.png", "chara3.png", "chara4.png", "chara5.png"];
  for (const file of files) {
    const path = join(optimizedDir, file);
    assert.equal(existsSync(path), true, `${file} should exist`);
    const { width, height } = pngDimensions(path);
    assert.ok(Math.max(width, height) <= 512, `${file} should fit in 512px`);
    assert.ok(statSync(path).size < 400_000, `${file} should be game-ready`);
    assert.match(html, new RegExp(`Asset/game/optimized/${file.replace(".", "\\.")}`));
  }

  const starPath = join(optimizedDir, "star-display.png");
  assert.ok(Math.max(...Object.values(pngDimensions(starPath))) <= 256);
  assert.doesNotMatch(html, /Asset\/(?:chara[1-5]_sub\.PNG|star_display\.png)/);
  assert.match(build, /rmSync\(join\(dist, "Asset", file\), \{ force: true \}\)/);
});
