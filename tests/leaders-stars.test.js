import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { LEADERS, LEADER_TUNING, getLeader, computeLeaderSkill, leaderChargeMultiplier } from "../src/features/leaders.js";
import { rateStage, parseStarRecord, recordStageStars, totalStars, STAR_TIME_LEFT_SECONDS } from "../src/features/stars.js";

const ROWS = 8, COLS = 7;
function makeBoard(fn = (r, c) => (r * 2 + c) % 5) {
  return Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => ({ t: fn(r, c) })));
}
function seq(...values) { let i = 0; return () => values[i++ % values.length]; }

test("every leader is unique and maps to one piece colour", () => {
  assert.equal(LEADERS.length, 5);
  assert.equal(new Set(LEADERS.map(l => l.id)).size, 5);
  assert.deepEqual([...LEADERS.map(l => l.pieceType)].sort(), [0, 1, 2, 3, 4]);
  for (const leader of LEADERS) {
    assert.equal(leader.chara, leader.pieceType + 1);
    assert.equal(leader.art, `Asset/leaders/${leader.id}.webp`);
    assert.ok(existsSync(new URL(`../${leader.art}`, import.meta.url)), leader.art);
  }
  assert.equal(getLeader("unknown").id, "futaba");
  assert.equal(getLeader(null).id, "futaba");
});

test("Futaba clears the most common colour in the lower half and charges the gauge faster", () => {
  const { fromRow } = LEADER_TUNING.futaba;
  // 下半分はレッド(3)が最多、上半分はピンク(0)だらけ
  const board = makeBoard((r, c) => (r < fromRow ? 0 : (c % 2 === 0 ? 3 : (r + c) % 3)));
  const { cells, transforms, timeBonus } = computeLeaderSkill("futaba", board);
  assert.ok(cells.size > 0);
  for (const key of cells) {
    const [r, c] = key.split(",").map(Number);
    assert.ok(r >= fromRow, "only the lower half");
    assert.equal(board[r][c].t, 3);
  }
  assert.deepEqual(transforms, []);
  assert.equal(timeBonus, 0);
  assert.ok(leaderChargeMultiplier("futaba") > 1);
  for (const id of ["akamaru", "jitome", "bideru", "momo"]) assert.equal(leaderChargeMultiplier(id), 1);
});

test("Akamaru blasts several 3x3 areas spread over the board", () => {
  const { blasts } = LEADER_TUNING.akamaru;
  const { cells } = computeLeaderSkill("akamaru", makeBoard(), { random: seq(0.05, 0.1, 0.95, 0.9, 0.5, 0.05, 0.3, 0.7) });
  assert.ok(cells.size > 9 * (blasts - 1), String(cells.size));
  assert.ok(cells.size <= 9 * blasts);
  for (const key of cells) { const [r, c] = key.split(",").map(Number); assert.ok(r >= 0 && r < ROWS && c >= 0 && c < COLS); }
});

test("Jitome tidies up the bottom rows", () => {
  const { rows } = LEADER_TUNING.jitome;
  const { cells } = computeLeaderSkill("jitome", makeBoard());
  assert.equal(cells.size, rows * COLS);
  for (const key of cells) assert.ok(Number(key.split(",")[0]) >= ROWS - rows);
});

test("Bideru turns pieces into stars and bombs without clearing anything", () => {
  const { cells, transforms } = computeLeaderSkill("bideru", makeBoard(), { random: seq(0.1, 0.7, 0.3, 0.9, 0.5) });
  assert.equal(cells.size, 0);
  assert.equal(transforms.length, LEADER_TUNING.bideru.specials);
  assert.deepEqual([...new Set(transforms.map(t => t.kind))].sort(), ["bomb", "star"]);
  for (const a of transforms) for (const b of transforms) {
    if (a !== b) assert.ok(Math.abs(a.r - b.r) + Math.abs(a.c - b.c) > 1, "specials must not touch");
  }
});

test("Momo adds time and sometimes hits the jackpot", () => {
  const { seconds, jackpotSeconds, jackpotChance } = LEADER_TUNING.momo;
  const normal = computeLeaderSkill("momo", makeBoard(), { random: () => 0.99 });
  assert.equal(normal.timeBonus, seconds);
  assert.equal(normal.jackpot, false);
  assert.equal(normal.cells.size, 0);
  const lucky = computeLeaderSkill("momo", makeBoard(), { random: () => jackpotChance / 2 });
  assert.equal(lucky.timeBonus, jackpotSeconds);
  assert.equal(lucky.jackpot, true);
});

test("skills never touch empty cells", () => {
  const board = makeBoard();
  board[0][0] = { t: 9 };
  board[1][1] = null;
  for (const leader of LEADERS) {
    const { cells, transforms } = computeLeaderSkill(leader.id, board, { random: seq(0.4) });
    assert.ok(!cells.has("1,1"), leader.id);
    assert.ok(!transforms.some(t => t.r === 1 && t.c === 1), leader.id);
  }
});

test("stars: clear, no-miss and time-left each give one star", () => {
  assert.equal(rateStage({ misses: 0, timeLeft: STAR_TIME_LEFT_SECONDS }).stars, 3);
  assert.equal(rateStage({ misses: 2, timeLeft: 30 }).stars, 2);
  assert.equal(rateStage({ misses: 0, timeLeft: 3 }).stars, 2);
  assert.equal(rateStage({ misses: 1, timeLeft: 0 }).stars, 1);
  assert.equal(rateStage({ misses: 0, timeLeft: 0 }).checks.length, 3);
});

test("star record keeps the best result and survives corrupt saves", () => {
  assert.deepEqual(parseStarRecord("not json"), {});
  assert.deepEqual(parseStarRecord('{"1":3,"2":9,"x":2,"3":0,"4":2}'), { 1: 3, 4: 2 });
  let record = {};
  record = recordStageStars(record, 1, 2).record;
  const lower = recordStageStars(record, 1, 1);
  assert.equal(lower.best, 2);
  assert.equal(lower.improved, false);
  const higher = recordStageStars(lower.record, 1, 3);
  assert.equal(higher.improved, true);
  assert.equal(totalStars({ ...higher.record, 2: 1 }), 4);
});
