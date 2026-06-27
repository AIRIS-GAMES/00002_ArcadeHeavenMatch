// ヘッドレス動作テスト: ブラウザAPIをスタブして _check.js を実行し、
// ランダムな手を大量に打ってロジックを検証する
const fs = require("fs");
const vm = require("vm");

function stubCtx() {
  const noop = () => {};
  return new Proxy({}, {
    get(t, p) {
      if (p === "createRadialGradient" || p === "createLinearGradient")
        return () => ({ addColorStop: noop });
      return noop;
    },
    set() { return true; }
  });
}

const elements = {};
function el(id) {
  if (!elements[id]) elements[id] = {
    textContent: "", style: {}, width: 0, height: 0,
    addEventListener: () => {},
    classList: { add: () => {}, remove: () => {} },
    getContext: () => stubCtx(),
  };
  return elements[id];
}

const sandbox = {
  window: { innerWidth: 400, innerHeight: 800, devicePixelRatio: 1, addEventListener: () => {} },
  document: {
    getElementById: el,
    body: el("body"),
    createElement: () => ({ width: 0, height: 0, getContext: () => stubCtx() }),
  },
  setTimeout: () => {}, clearTimeout: () => {},
  location: { search: "" },
  localStorage: { getItem: () => null, setItem: () => {} },
  performance: { now: () => 0 },
  requestAnimationFrame: () => {},
  console, Math, Set, Number,
};
sandbox.window.AudioContext = undefined;
sandbox.globalThis = sandbox;

const html = fs.readFileSync(__dirname + "/index.html", "utf8");
const code = /<script>([\s\S]*)<\/script>/.exec(html)[1];
const context = vm.createContext(sandbox);
// 関数・変数にアクセスできるよう var 化はせず、テスト用フックを末尾に追加
vm.runInContext(code + `
;globalThis.__hooks = {
  get board(){ return board; }, get state(){ return state; },
  set state(v){ state = v; },
  get score(){ return score; }, get moves(){ return moves; },
  get combo(){ return combo; },
  startLevel, findRuns, findAnyMove, trySwap, update, buildBoard,
  setMoves(v){ moves = v; }, setTarget(v){ target = v; },
};`, context);

const H = context.__hooks;
const assert = (cond, msg) => { if (!cond) { console.error("FAIL:", msg); process.exit(1); } };

// --- テスト1: 初期盤面 ---
H.startLevel();
assert(H.state === "idle", "startLevel後はidle");
assert(H.findRuns().length === 0, "初期盤面にマッチなし");
assert(H.findAnyMove() !== null, "初期盤面に手がある");
console.log("test1 OK: 初期盤面は正常");

// --- テスト2: 1手打って解決まで回す ---
function step(seconds) {
  let t = 0;
  while (t < seconds && !["idle", "over", "title"].includes(H.state)) {
    H.update(0.016); t += 0.016;
  }
  return t < seconds;
}
H.setTarget(999999); // ステージクリアさせない
const mv = H.findAnyMove();
const movesBefore = H.moves;
H.trySwap(mv[0], mv[1], mv[2], mv[3]);
assert(H.state === "swap", "trySwapでswap状態");
assert(step(10), "1手が10秒以内に解決");
assert(H.score > 0, "スコアが入った");
assert(H.moves === movesBefore - 1, "手数が1減った");
assert(H.findRuns().length === 0, "解決後にマッチ残りなし");
console.log("test2 OK: 1手の解決 score=" + H.score);

// --- テスト3: ランダム500手ファズ ---
let bells = 0, swapsDone = 0;
for (let i = 0; i < 500; i++) {
  if (H.state === "over") { H.state = "idle"; H.setMoves(99); }
  if (H.state !== "idle") { assert(step(15), "状態が15秒以内に収束 (i=" + i + ")"); continue; }
  H.setMoves(99);
  // 半分は最適手、半分はランダム隣接スワップ（不成立含む）
  let r, c, r2, c2;
  if (Math.random() < 0.5) {
    const m = H.findAnyMove();
    if (!m) continue;
    [r, c, r2, c2] = m;
    if (r === r2 && c === c2) { // ベル単独 → 隣とスワップ
      bells++;
      c2 = c > 0 ? c - 1 : c + 1;
    }
  } else {
    r = Math.random() * 8 | 0; c = Math.random() * 7 | 0;
    if (Math.random() < 0.5) { r2 = r; c2 = c + 1; } else { r2 = r + 1; c2 = c; }
    if (r2 >= 8 || c2 >= 7) continue;
  }
  H.trySwap(r, c, r2, c2);
  swapsDone++;
  assert(step(15), "スワップ後15秒以内に収束 (i=" + i + ")");
  // 盤面整合性: 全セル埋まっている・offY=0
  const b = H.board;
  for (let rr = 0; rr < 8; rr++) for (let cc = 0; cc < 7; cc++) {
    assert(b[rr][cc], "セルが空 (" + rr + "," + cc + ") i=" + i);
    assert(b[rr][cc].offY === 0, "offY残留 i=" + i);
  }
  assert(H.findRuns().length === 0, "マッチ残留 i=" + i);
}
console.log("test3 OK: ランダム" + swapsDone + "手ファズ通過 (ベル発動" + bells + "回) 最終score=" + H.score);

// --- テスト4: ベル発動（十字消し） ---
H.setMoves(99);
const s4 = H.score;
H.board[4][3].t = 9; // BELL
H.trySwap(4, 3, 4, 4);
assert(step(15), "ベル発動が収束");
assert(H.score > s4, "ベルでスコア加算");
for (let rr = 0; rr < 8; rr++) for (let cc = 0; cc < 7; cc++)
  assert(H.board[rr][cc] && H.board[rr][cc].offY === 0, "ベル後の盤面整合");
assert(H.findRuns().length === 0, "ベル後マッチ残留なし");
console.log("test4 OK: ベル十字消し");

// --- テスト5: ベル同士スワップ（全消し） ---
H.setMoves(99);
H.board[2][2].t = 9; H.board[2][3].t = 9;
const s5 = H.score;
H.trySwap(2, 2, 2, 3);
assert(step(20), "ダブルベルが収束");
assert(H.score - s5 >= 8 * 7 * 15, "全消し分のスコア (got " + (H.score - s5) + ")");
for (let rr = 0; rr < 8; rr++) for (let cc = 0; cc < 7; cc++)
  assert(H.board[rr][cc] && H.board[rr][cc].t !== 9, "ベルが残っていない");
console.log("test5 OK: ダブルベル全消し");
console.log("ALL TESTS PASSED");
