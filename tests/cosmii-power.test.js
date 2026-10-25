import test from "node:test";
import assert from "node:assert/strict";

import {
  COSMII_POWER_CONFIG,
  COSMII_POWER_STATES,
  CosmiiPowerManager,
  CosmiiPowerResult,
  calculateCosmiiPowerLayout,
  calculatePowerCharge,
  findMostCommonColorCells,
  getCosmiiPowerPresentation,
  pickRandomCosmii
} from "../src/features/cosmii-power.js";

test("standard Cosmii selection is random over available images", () => {
  const images = [null, { id:1 }, { id:2 }, { id:3 }];
  assert.equal(pickRandomCosmii(images, () => 0).id, 1);
  assert.equal(pickRandomCosmii(images, () => 0.99).id, 3);
  assert.equal(pickRandomCosmii([], () => 0), null);
});

test("match sizes, combo, and special clears charge the same power gauge", () => {
  assert.equal(calculatePowerCharge({ matchLengths:[3] }), 10);
  assert.equal(calculatePowerCharge({ matchLengths:[4] }), 15);
  assert.equal(calculatePowerCharge({ matchLengths:[5,6], combo:2 }), 53);
  assert.equal(calculatePowerCharge({ specialRemovedCount:8 }), 16);
});

test("gauge caps at full and starts one power sequence", () => {
  let fullCount = 0;
  const manager = new CosmiiPowerManager(COSMII_POWER_CONFIG, { onGaugeFull:() => fullCount++ });
  manager.reset(true);
  for (let index = 0; index < 12; index++) manager.addCharge({ matchLengths:[3] });
  assert.equal(manager.gauge, 100);
  assert.equal(manager.state, COSMII_POWER_STATES.READY);
  assert.equal(fullCount, 1);
  assert.equal(manager.addCharge({ matchLengths:[5] }), 0);
  assert.equal(manager.begin(), true);
  assert.equal(manager.begin(), false);
});

test("power sequence completes then returns to charging", () => {
  const called = [];
  const manager = new CosmiiPowerManager(COSMII_POWER_CONFIG, {
    onEntry:() => called.push("entry"),
    onEffectStart:() => called.push("start"),
    onActivate:() => called.push("activate"),
    onExit:() => called.push("exit"),
    onComplete:() => called.push("complete")
  });
  manager.reset(true);
  manager.addCharge({ matchLengths:[5,5,5,5] });
  manager.begin();
  manager.update(COSMII_POWER_CONFIG.timing.entrySeconds + 0.01);
  manager.update(COSMII_POWER_CONFIG.timing.effectDelaySeconds + 0.01);
  assert.deepEqual(called, ["entry", "start", "activate"]);
  assert.equal(manager.finishEffect(), true);
  assert.equal(manager.gauge, 0);
  manager.update(COSMII_POWER_CONFIG.timing.exitSeconds + 0.01);
  manager.update(COSMII_POWER_CONFIG.timing.cooldownSeconds + 0.01);
  assert.deepEqual(called, ["entry", "start", "activate", "exit", "complete"]);
  assert.equal(manager.state, COSMII_POWER_STATES.CHARGING);
});

test("most common color is selected with stable tie breaking", () => {
  const board = [[{t:2}, {t:1}, {t:2}, {t:9}], [{t:1}, {t:2}, {t:1}, null]];
  const result = findMostCommonColorCells(board, 5);
  assert.equal(result.targetType, 1);
  assert.equal(result.count, 3);
  assert.deepEqual([...result.cells], ["0,1", "1,0", "1,2"]);
});

test("Cosmii presentation retains aspect ratio and fits the board", () => {
  const board = { x:3, y:220, width:369, height:424 };
  const layout = calculateCosmiiPowerLayout({ board, imageAspect:581/593 });
  assert.ok(layout.x >= board.x && layout.y >= board.y);
  assert.ok(layout.x + layout.width <= board.x + board.width);
  assert.ok(layout.y + layout.height <= board.y + board.height);
  assert.ok(Math.abs(layout.width/layout.height - 581/593) < 1e-8);
  const reduced = getCosmiiPowerPresentation(layout, COSMII_POWER_STATES.ENTERING, 0.5, true);
  assert.deepEqual(reduced, layout);
});

test("stage result counts ability activations and removed pieces", () => {
  const result = new CosmiiPowerResult();
  result.record({ piecesRemoved:4, scoreGained:100 });
  result.record({ piecesRemoved:7, scoreGained:210 });
  assert.deepEqual({ activations:result.activations, piecesRemoved:result.piecesRemoved, scoreGained:result.scoreGained },
    { activations:2, piecesRemoved:11, scoreGained:310 });
});