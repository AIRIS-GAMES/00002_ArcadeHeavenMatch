import test from "node:test";
import assert from "node:assert/strict";

import {
  OHSUN_EVENT_CONFIG,
  OHSUN_EVENT_STATES,
  OhsunEventManager,
  calculateGaugeGain,
  createOhsunAppearance,
  findMostCommonColorCells,
  isOhsunEventActive
} from "../src/features/ohsun/index.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const config = { ...OHSUN_EVENT_CONFIG, timing:{ ...OHSUN_EVENT_CONFIG.timing } };

test("copyrighted character variants are configured without the legacy image", () => {
  assert.equal(OHSUN_EVENT_CONFIG.characterAssets.length, 7);
  assert.ok(OHSUN_EVENT_CONFIG.characterAssets.every(asset => /ohsun_(?:0[7-9]|1[0-3])\.png$/.test(asset)));
  assert.equal(OHSUN_EVENT_CONFIG.messages, undefined);
});

test("Sansan Time chooses an unchanged image without dialogue or immediate repetition", () => {
  const loaded = OHSUN_EVENT_CONFIG.characterAssets.slice(0, 3).map(asset => ({ asset, image:{ asset } }));
  const appearance = createOhsunAppearance(OHSUN_EVENT_CONFIG, loaded, {
    previousAsset:loaded[0].asset,
    random:()=>0
  });
  assert.equal(appearance.asset, loaded[1].asset);
  assert.equal(appearance.image, loaded[1].image);
  assert.deepEqual(Object.keys(appearance).sort(), ["asset", "image"]);
});

test("3・4・5個以上のマッチ値と連鎖ボーナスを計算する", ()=>{
  assert.equal(calculateGaugeGain({ matchLengths:[3] }, config), 10);
  assert.equal(calculateGaugeGain({ matchLengths:[4] }, config), 15);
  assert.equal(calculateGaugeGain({ matchLengths:[5] }, config), 25);
  assert.equal(calculateGaugeGain({ matchLengths:[6], combo:2 }, config), 31);
  assert.equal(calculateGaugeGain({ matchLengths:[3], combo:3 }, config), 19);
});

test("特殊ピースによる削除数を加算する", ()=>{
  assert.equal(calculateGaugeGain({ specialRemovedCount:8 }, config), 16);
  assert.equal(calculateGaugeGain({ matchLengths:[3], specialRemovedCount:4 }, config), 18);
});

test("ゲージは最大値で止まり、満タン通知と発動は一度だけ", ()=>{
  let fullCount=0;
  const manager=new OhsunEventManager(config,{ onGaugeFull:()=>fullCount++ });
  manager.reset(true);
  for(let i=0;i<12;i++) manager.addCharge({ matchLengths:[3] });
  assert.equal(manager.gauge,100);
  assert.equal(manager.state,OHSUN_EVENT_STATES.READY);
  assert.equal(fullCount,1);
  assert.equal(manager.addCharge({ matchLengths:[5] }),0);
  assert.equal(manager.begin(),true);
  assert.equal(manager.begin(),false);
});

test("連鎖終了後に開始した演出がENTERINGからCOOLDOWNまで遷移する", ()=>{
  const called=[];
  const manager=new OhsunEventManager(config,{
    onEntry:()=>called.push("entry"),
    onEffectStart:()=>called.push("start"),
    onActivate:()=>called.push("activate"),
    onExit:()=>called.push("exit"),
    onComplete:()=>called.push("complete")
  });
  manager.reset(true);
  manager.addCharge({ matchLengths:[5,5,5,5] });
  manager.begin();
  manager.update(config.timing.entrySeconds+.01);
  manager.update(config.timing.effectDelaySeconds+.01);
  assert.deepEqual(called,["entry","start","activate"]);
  assert.equal(manager.finishEffect(),true);
  assert.equal(manager.gauge,0);
  manager.update(config.timing.exitSeconds+.01);
  manager.update(config.timing.cooldownSeconds+.01);
  assert.deepEqual(called,["entry","start","activate","exit","complete"]);
  assert.equal(manager.state,OHSUN_EVENT_STATES.CHARGING);
});

test("無効状態と発動中はゲージを再充填しない", ()=>{
  const manager=new OhsunEventManager(config);
  manager.reset(false);
  assert.equal(manager.addCharge({ matchLengths:[5] }),0);
  manager.reset(true);
  manager.addCharge({ matchLengths:[5,5,5,5] });
  manager.begin();
  assert.equal(manager.addCharge({ specialRemovedCount:40 }),0);
  assert.equal(manager.gauge,100);
});

test("最頻色を選び、同数では小さい色番号を安定して選ぶ", ()=>{
  const board=[
    [{t:2},{t:1},{t:2},{t:9}],
    [{t:1},{t:2},{t:1},null]
  ];
  const result=findMostCommonColorCells(board,5);
  assert.equal(result.targetType,1);
  assert.equal(result.count,3);
  assert.deepEqual([...result.cells],["0,1","1,0","1,2"]);
});

test("期間・enabled・不正な日時を判定する", ()=>{
  const period={...config,startsAt:"2026-09-01T00:00:00+09:00",endsAt:"2026-09-30T23:59:59+09:00"};
  assert.equal(isOhsunEventActive(new Date("2026-08-31T14:59:59Z"),period),false);
  assert.equal(isOhsunEventActive(new Date("2026-08-31T15:00:00Z"),period),true);
  assert.equal(isOhsunEventActive(new Date("2026-09-30T14:59:59Z"),period),true);
  assert.equal(isOhsunEventActive(new Date("2026-09-30T15:00:00Z"),period),false);
  assert.equal(isOhsunEventActive(new Date("2026-09-10T00:00:00Z"),{...period,enabled:false}),false);
  assert.equal(isOhsunEventActive(new Date("2026-09-10T00:00:00Z"),{...period,startsAt:"invalid"}),false);
});

test("コラボ限定のリザルト文言はohsun機能内で管理する", () => {
  const feature = readFileSync(join(process.cwd(), "src", "features", "ohsun", "OhsunStageResult.js"), "utf8");
  const commonConfig = readFileSync(join(process.cwd(), "src", "config", "game-config.js"), "utf8");
  assert.match(feature, /おっ！サン/);
  assert.doesNotMatch(commonConfig, /おっ！サン|ohsun/i);
});
