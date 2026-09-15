import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { GAME_CONFIG } from "../src/config/game-config.js";

const root = process.cwd();
const html = readFileSync(join(root, "index.html"), "utf8");
const build = readFileSync(join(root, "scripts", "build.mjs"), "utf8");

function frameHarness() {
  const draws = [], deltas = [];
  let time = 0, requests = 0, cancellations = 0;
  const context = vm.createContext({
    document: { hidden:false }, state:"idle", FRAME_INTERVAL_MS:1000/GAME_CONFIG.performance.activeFrameRate,
    performance: { now:()=>time },
    requestAnimationFrame:()=>++requests, cancelAnimationFrame:()=>cancellations++,
    update:dt=>deltas.push(dt), render:()=>draws.push(time)
  });
  vm.runInContext(html.slice(html.indexOf("let perf=0,"), html.indexOf("function update(dt){")), context);
  return { context, draws, deltas, tick(now) { time=now; context.frame(now); },
    get requests() { return requests; }, get cancellations() { return cancellations; } };
}

for (const hz of [30,60,120]) {
  test(`60fps pacing stays on schedule with ${hz}Hz callbacks`, () => {
    const harness=frameHarness();
    for(let i=0;i<=hz*10;i++) harness.tick(100+i*1000/hz);
    const expectedRate=Math.min(hz,60);
    assert.equal(harness.draws.length,expectedRate*10+1);
    for(let i=1;i<harness.draws.length;i++) {
      assert.ok(Math.abs(harness.draws[i]-harness.draws[i-1]-1000/expectedRate)<0.001);
    }
  });
}

test("callback jitter does not accumulate into a lower frame rate", () => {
  const harness=frameHarness();
  for(let i=0;i<=2400;i++) harness.tick(100+i*1000/120+Math.sin(i)*1.5);
  assert.ok(harness.draws.length>=1199 && harness.draws.length<=1201);
  const before=harness.draws.length;
  harness.tick(25000);
  assert.equal(harness.draws.length,before+1);
  assert.equal(harness.deltas.at(-1),0.05);
  harness.tick(25001);
  assert.equal(harness.draws.length,before+1);
});

test("60Hz callback jitter does not drop available animation frames", () => {
  const harness=frameHarness();
  for(let i=0;i<1200;i++) harness.tick(100+i*1000/60+Math.sin(i)*2);
  assert.equal(harness.draws.length,1200);
  for(let i=1;i<harness.draws.length;i++)assert.ok(harness.draws[i]-harness.draws[i-1]<22);
});

test("pause, background and resume retain one scheduled game loop", () => {
  const h=frameHarness();
  h.context.ensureGameLoop();
  h.context.ensureGameLoop();
  assert.equal(h.requests,1);
  h.tick(100);
  h.context.stopGameLoop();
  assert.equal(h.cancellations,1);
  h.context.document.hidden=true;
  const requests=h.requests;
  h.context.ensureGameLoop(); h.tick(2000);
  assert.equal(h.requests,requests);
  assert.equal(h.draws.length,1);
  h.context.document.hidden=false;
  h.context.state="paused";
  h.context.ensureGameLoop();
  assert.equal(h.requests,requests);
  h.context.state="idle";
  h.context.ensureGameLoop(); h.tick(2010);
  assert.equal(h.draws.length,2);
  assert.ok(h.deltas.at(-1)<0.02);
});

test("special pieces reuse painted surfaces during movement and clearing", () => {
  let paints=0,copies=0;
  const paint=()=>paints++;
  const context=vm.createContext({BELL:9,BOMB:10,TIME:11,COLOR_CLEAR:12,
    drawBell:paint,drawBomb:paint,drawTimeTile:paint,drawColorClearTile:paint,
    REDUCED_EFFECTS:true,DPR:2,perf:0,imgReady:()=>true,starSpecialImg:{},
    document:{createElement:()=>({getContext:()=>({setTransform(){}})})},
    ctx:{drawImage(){copies++;}}});
  vm.runInContext(html.slice(html.indexOf('const specialImageLayers='),html.indexOf('function drawTile(r,')),context);
  for(let frame=0;frame<120;frame++)for(const type of [9,10,11,12])context.drawSpecialPiece(type,frame,frame,20);
  assert.equal(paints,4);
  assert.equal(copies,480);
  context.DPR=1;
  context.drawSpecialPiece(9,0,0,20);
  assert.equal(paints,5);
  context.drawSpecialPiece(9,0,0,24);
  assert.equal(paints,6);
});

test("stationary collaboration light is cached independently of official images", () => {
  let gradients=0, copies=0;
  const graphics={save(){},restore(){},translate(){},rotate(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},fillRect(){},
    createRadialGradient(){ gradients++; return {addColorStop(){}}; },drawImage(){ copies++; }};
  const layer={getContext:()=>graphics};
  const context=vm.createContext({document:{createElement:()=>layer},ctx:graphics,W:390,H:844,REDUCED_EFFECTS:true,ohsunAnimationTime:0});
  vm.runInContext(html.slice(html.indexOf('const ohsunLightLayer='),html.indexOf('function drawOhsunOverlay(){')),context);
  for(let i=0;i<120;i++) context.drawOhsunLight(100,150,true);
  assert.equal(gradients,1); assert.equal(copies,120);
  assert.equal(layer.width,390); assert.equal(layer.height,844);
  context.W=844; context.H=390;
  context.drawOhsunLight(100,150,true);
  assert.equal(gradients,2);
  context.drawOhsunLight(110,150,true);
  assert.equal(gradients,3);
  context.drawOhsunLight(110,150,false);
  context.drawOhsunLight(110,150,false);
  assert.equal(gradients,5);
});

test("board decoration is painted once until cell size or resolution changes", () => {
  let fills=0, copies=0;
  const g={setTransform(){},save(){},restore(){},fill(){fills++;},stroke(){}};
  const layer={getContext:()=>g};
  const context=vm.createContext({document:{createElement:()=>layer},ctx:{drawImage(){copies++;}},
    rounded(){},cs:40,COLS:7,ROWS:8,DPR:2,bx:8,by:180});
  vm.runInContext(html.slice(html.indexOf('const boardPanelLayer='),html.indexOf('function render(){')),context);
  for(let i=0;i<120;i++) context.drawBoardPanel();
  assert.equal(fills,57);
  assert.equal(copies,120);
  context.cs=45;
  context.drawBoardPanel();
  assert.equal(fills,114);
  context.DPR=1;
  context.drawBoardPanel();
  assert.equal(fills,171);
});

function pngDimensions(path) {
  const png = readFileSync(path);
  assert.deepEqual([...png.subarray(1, 4)], [0x50, 0x4e, 0x47]);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

test("ゲーム描画は共通の常時省電力設定を使い、非表示時に停止する", () => {
  assert.match(html, /const ACTIVE_FRAME_RATE = GAME_CONFIG\.performance\.activeFrameRate;/);
  assert.match(html, /const MAX_RENDER_DPR = GAME_CONFIG\.performance\.maxDpr;/);
  assert.match(html, /if\(document\.hidden\)\{\s*suspendAudio\(\);\s*stopGameLoop\(\);/);
  assert.match(html, /now<nextFrameAt-frameTolerance/);
});

test("60fps・DPR 2・軽量エフェクトを常時適用し、切替UIを生成しない", () => {
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
