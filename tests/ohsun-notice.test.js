import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OHSUN_EVENT_CONFIG } from "../src/features/ohsun/config.js";
import { formatOhsunEventPeriod } from "../src/features/ohsun/OhsunEventNotice.js";
import { calculateOhsunAccentSlots, calculateOhsunHeroLayout } from "../src/features/ohsun/OhsunBackdrop.js";

test("the collaboration copyright notice uses the approved wording", () => {
  const root = process.cwd();
  const notice = readFileSync(join(root, "src", "features", "ohsun", "OhsunEventNotice.js"), "utf8");
  const css = readFileSync(join(root, "src", "features", "ohsun", "ohsun-event-notice.css"), "utf8");
  const html = readFileSync(join(root, "index.html"), "utf8");
  assert.equal(OHSUN_EVENT_CONFIG.copyrightNotice, "© SUN-TV");
  assert.match(notice, /ohsun-event-menu-copyright/);
  assert.match(notice, /ohsun-event-dialog-copyright/);
  assert.match(css, /\.ohsun-event-menu-copyright/);
  assert.match(css, /#title\.show-menu \.ohsun-event-menu-copyright\s*\{\s*display:block;/);
  assert.match(html, /function drawOhsunCopyright\(\)/);
});

test("告知ではおっ！サンの正式表記と設定済みの仮文言を使用する", () => {
  assert.equal(OHSUN_EVENT_CONFIG.notice.bannerText, "おっ！サンとコラボ中！");
  assert.equal(OHSUN_EVENT_CONFIG.notice.dialogTitle, "おっ！サン コラボ");
  assert.equal(OHSUN_EVENT_CONFIG.notice.steps.length, 3);
  assert.doesNotMatch(OHSUN_EVENT_CONFIG.notice.bannerText, /オッサン/);
});

test("開催期間は設定日時を日本時間の日付として表示する", () => {
  assert.equal(formatOhsunEventPeriod(OHSUN_EVENT_CONFIG), "2026/9/1 ～ 2026/10/31");
  assert.equal(formatOhsunEventPeriod({ startsAt:"invalid", endsAt:"invalid" }), "");
});

test("告知UIはコラボ機能内に分離され、既存初期化から生成される", () => {
  const root = process.cwd();
  const html = readFileSync(join(root, "index.html"), "utf8");
  const css = readFileSync(join(root, "src", "features", "ohsun", "ohsun-event-notice.css"), "utf8");
  assert.match(html, /new OhsunEventNotice\(/);
  assert.match(html, /ohsunEventNotice\.destroy\(\)/);
  assert.match(css, /\.ohsun-event-banner/);
  assert.match(css, /\.ohsun-event-dialog-backdrop/);
  assert.match(css, /font-weight:800/);
});

test("背景画像はHUD・盤面・進捗バーを避け、全体が画面内に収まる場所だけに配置する", () => {
  const root = process.cwd();
  const html = readFileSync(join(root, "index.html"), "utf8");
  const backdrop = readFileSync(join(root, "src", "features", "ohsun", "OhsunBackdrop.js"), "utf8");
  const board = { x:3, y:255, width:369, height:424 };
  const slots = calculateOhsunAccentSlots({ width:375, height:812, board, hudBottom:133, imageAspect:581/593 });
  assert.ok(slots.some(slot=>slot.name === "top"));
  assert.ok(slots.some(slot=>slot.name === "bottom"));
  for (const slot of slots) {
    assert.ok(slot.x >= 0 && slot.y >= 133);
    assert.ok(slot.x + slot.width <= 375 && slot.y + slot.height <= 812);
    const overlapsBoard = slot.x < board.x + board.width && slot.x + slot.width > board.x &&
      slot.y < board.y + board.height && slot.y + slot.height > board.y;
    assert.equal(overlapsBoard, false, `${slot.name} must not overlap the puzzle board`);
    if (slot.name === "bottom") assert.ok(slot.y >= board.y + board.height + 30);
  }
  assert.match(html, /drawOhsunSafeAccents/);
  assert.match(backdrop, /ctx\.fillRect\(0, 0, width, height\)/);
});

test("チュートリアルでは上部の説明スペースを避け、狭い画面では画像を無理に出さない", () => {
  const board = { x:3, y:255, width:369, height:424 };
  const tutorialSlots = calculateOhsunAccentSlots({
    width:375, height:812, board, hudBottom:133, avoidTop:true, imageAspect:581/593
  });
  assert.equal(tutorialSlots.some(slot=>slot.name === "top"), false);
  const smallSlots = calculateOhsunAccentSlots({
    width:320,
    height:568,
    board:{ x:4, y:160, width:312, height:360 },
    hudBottom:124,
    avoidTop:true,
    imageAspect:581/593
  });
  assert.deepEqual(smallSlots, []);
});

test("発動中の主役と吹き出しは盤面外の同じ専用領域に収まる", () => {
  const board = { x:3, y:255, width:369, height:424 };
  const layout = calculateOhsunHeroLayout({
    width:375, height:812, board, safeTop:4, imageAspect:581/593
  });
  assert.equal(layout.orientation, "row");
  for (const item of [layout.character, layout.bubble]) {
    assert.ok(item.x >= 0 && item.y >= 0);
    assert.ok(item.x + item.width <= 375 && item.y + item.height <= 812);
    const overlapsBoard = item.x < board.x + board.width && item.x + item.width > board.x &&
      item.y < board.y + board.height && item.y + item.height > board.y;
    assert.equal(overlapsBoard, false);
  }

  const wideLayout = calculateOhsunHeroLayout({
    width:1280,
    height:800,
    board:{ x:430, y:90, width:420, height:680 },
    safeTop:4,
    imageAspect:581/593
  });
  assert.equal(wideLayout.orientation, "column");
  assert.ok(wideLayout.character.x >= 850);
  assert.ok(wideLayout.bubble.x >= 850);
});
