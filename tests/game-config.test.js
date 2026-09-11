import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  GAME_CONFIG,
  createStageStats,
  describeStageMission,
  getStageRules,
  isStageComplete,
  missionProgress
} from "../src/config/game-config.js";

test("共通設定はコラボ固有情報を含まない", () => {
  const source = readFileSync(join(process.cwd(), "src", "config", "game-config.js"), "utf8");
  assert.doesNotMatch(source, /ohsun|おっ！サン/i);
  assert.equal(GAME_CONFIG.stage.timeSeconds, 60);
  assert.equal(GAME_CONFIG.performance.activeFrameRate, 24);
  assert.equal(GAME_CONFIG.performance.maxDpr, 2);
  assert.equal(GAME_CONFIG.performance.reducedEffects, true);
});

test("序盤はスコアのみ、ステージ4以降は共通ミッションを設定する", () => {
  assert.equal(getStageRules(1).mission.type, "NONE");
  assert.equal(getStageRules(4).mission.type, "COLOR");
  assert.equal(getStageRules(5).mission.type, "COMBO");
  assert.equal(getStageRules(6).mission.type, "SPECIAL");
  assert.equal(getStageRules(10).mission.type, "SPECIAL");
});

test("スコアとミッションの両方を満たした場合だけクリアする", () => {
  const rules = getStageRules(4);
  const stats = createStageStats();
  assert.equal(isStageComplete(rules, rules.scoreTarget, stats), false);
  stats.colorClears[rules.mission.pieceType] = rules.mission.target;
  assert.equal(missionProgress(rules, stats).complete, true);
  assert.equal(isStageComplete(rules, rules.scoreTarget - 1, stats), false);
  assert.equal(isStageComplete(rules, rules.scoreTarget, stats), true);
  assert.match(describeStageMission(rules, stats), /消す/);
});

test("HTMLは共通設定、確定後の勝敗判定、初回チュートリアルを利用する", () => {
  const html = readFileSync(join(process.cwd(), "index.html"), "utf8");
  assert.match(html, /from "\.\/src\/config\/game-config\.js(?:\?v=[^"]+)?"/);
  assert.match(html, /state==="idle"/);
  assert.match(html, /isStageComplete\(currentStageRules,score,stageStats\)/);
  assert.match(html, /if\(tutorialCompleted\) startLevel\(\)/);
  assert.match(html, /saveBestScore\(\)/);
  assert.doesNotMatch(html, /if\(level % FULL_PROMO_EVERY === 0 && showFullPromo\(\)\)/);
});

test("stage start clears particles left by the previous result animation", () => {
  const html = readFileSync(join(process.cwd(), "index.html"), "utf8");
  assert.match(html, /function clearTransientStageEffects\(\)[\s\S]*?particles\.length = 0;/);
  assert.match(html, /function startPracticeStep\(step\)\{\s*clearTransientStageEffects\(\);/);
  assert.match(html, /function startLevel\(\)\{\s*clearTransientStageEffects\(\);/);
});

test("the how-to button opens the text guide instead of starting practice", () => {
  const html = readFileSync(join(process.cwd(), "index.html"), "utf8");
  assert.match(html, /id="howto-guide"/);
  assert.match(html, /id="btn-howto-menu"/);
  assert.match(html, /btn-howto-menu[\s\S]*?howtoGuide\.classList\.remove\("hidden"\)/);
  assert.doesNotMatch(html, /btn-howto-menu[\s\S]{0,400}startPractice\(\)/);
  assert.doesNotMatch(html, /class="howto-dots"|class="howto-dot|setHowtoPage\(/);
  assert.match(html, /class="howto-one-page"/);
  assert.match(html, /<div class="menu-title">メインメニュー<\/div>/);
  assert.match(html, /#howto-guide \.howto-label \{[\s\S]*?background:transparent;[\s\S]*?box-shadow:none;/);
});
