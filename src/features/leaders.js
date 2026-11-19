// リーダーキャラと、それぞれの必殺技（Cosmiiパワー）。
// pieceType はそのキャラのピースの色番号（PIECE_NAMES と同じ並び）、chara はピース画像の番号、art はリーダー用の全身イラスト。
// 技はキャラの個性に合わせて役割を分け、強さ（1回あたりの得点換算）はだいたいそろえてある。
export const LEADERS = Object.freeze([
  Object.freeze({ id:"futaba", color:"#72c93a", colorDark:"#2a6408",  art:"Asset/leaders/futaba.webp",  name:"フタバ",   chara:3, pieceType:2, skill:"なかまあつめ",   role:"回転型",
    desc:"下半分のいちばん多い色を消す。ゲージが速くたまる" }),
  Object.freeze({ id:"akamaru", color:"#ff4f58", colorDark:"#8f0f1a", art:"Asset/leaders/akamaru.webp", name:"アカマル", chara:4, pieceType:3, skill:"どっかーん！",   role:"破壊型",
    desc:"2か所でドカンと大爆発（ほかの特殊ピースも誘爆）" }),
  Object.freeze({ id:"jitome", color:"#3d9dff", colorDark:"#123f8a",  art:"Asset/leaders/jitome.webp",  name:"ジトメ",   chara:2, pieceType:1, skill:"おかたづけ",     role:"連鎖型",
    desc:"下の3段を片付けて、落ちてくるピースで連鎖" }),
  Object.freeze({ id:"bideru", color:"#a46bff", colorDark:"#4a1d96",  art:"Asset/leaders/bideru.webp",  name:"ビデル",   chara:5, pieceType:4, skill:"いたずら",       role:"仕込み型",
    desc:"ピース6つをスターとボムに変えちゃう" }),
  Object.freeze({ id:"momo", color:"#ff6fb5", colorDark:"#9e1f5c",    art:"Asset/leaders/momo.webp",    name:"モモ",     chara:1, pieceType:0, skill:"きまぐれタイム", role:"時間型",
    desc:"じかん+15びょう。たまに大当たりで+25びょう" })
]);

// 強さの調整はここだけ。実際のゲームで各技を数十回発動して測り、
// 1回あたりの価値（技のあと6手ぶんの得点の増え方。時間は1秒＝ふつうのプレイの得点ペースで換算）がだいたいそろうようにした。
export const LEADER_TUNING = Object.freeze({
  futaba:  Object.freeze({ chargeMultiplier: 1.3, fromRow: 4 }),                  // いちばん多い色（下半分）＋ゲージ1.3倍速
  akamaru: Object.freeze({ blasts: 2, radius: 1 }),                               // 3×3の大爆発を2か所
  jitome:  Object.freeze({ rows: 3 }),                                            // 下から3段
  bideru:  Object.freeze({ specials: 6 }),                                        // 特殊ピースを6つ（スターとボム）
  momo:    Object.freeze({ seconds: 15, jackpotSeconds: 25, jackpotChance: 0.2 }) // +15秒、20%で+25秒
});

export const DEFAULT_LEADER_ID = "futaba";
export const LEADER_STORAGE_KEY = "ohanapon-leader";

export function getLeader(id) {
  return LEADERS.find(leader => leader.id === id) || LEADERS.find(leader => leader.id === DEFAULT_LEADER_ID);
}

// ゲージのたまり方の倍率（フタバだけ速い）
export function leaderChargeMultiplier(id, tuning = LEADER_TUNING) {
  return (tuning[getLeader(id).id] || {}).chargeMultiplier || 1;
}

function isPiece(tile, typeCount) {
  return !!tile && Number.isInteger(tile.t) && tile.t >= 0 && tile.t < typeCount;
}

function key(row, column) { return row + "," + column; }

function shuffled(items, random) {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/**
 * 必殺技の中身を決める（盤面は変更しない）。
 * 戻り値:
 *   cells      消すマス Set<"r,c">
 *   spawns     消したあとに置く特殊ピース [{r,c,kind}]
 *   transforms その場で特殊ピースに変えるマス [{r,c,kind:"star"|"bomb"}]
 *   timeBonus  増える秒数
 *   jackpot    モモの大当たりか
 */
export function computeLeaderSkill(leaderId, board, { typeCount = 5, random = Math.random, tuning = LEADER_TUNING } = {}) {
  const rows = board.length;
  const columns = rows ? board[0].length : 0;
  const cells = new Set();
  const spawns = [];
  const transforms = [];
  let timeBonus = 0;
  let jackpot = false;
  const leader = getLeader(leaderId);
  const t = tuning[leader.id] || {};

  if (leader.id === "akamaru") {
    // 爆心どうしがなるべく離れるように選んで爆発させる
    const radius = t.radius ?? 1;
    const pick = (lo, hi) => lo + Math.floor(random() * (Math.max(lo, hi) - lo + 1));
    const centers = [];
    for (let n = 0; n < (t.blasts ?? 3); n++) {
      let best = null, bestDistance = -1;
      for (let tries = 0; tries < 20; tries++) {
        const candidate = [pick(radius, rows - 1 - radius), pick(radius, columns - 1 - radius)];
        const distance = centers.length
          ? Math.min(...centers.map(([r, c]) => Math.max(Math.abs(r - candidate[0]), Math.abs(c - candidate[1]))))
          : 99;
        if (distance > bestDistance) { best = candidate; bestDistance = distance; }
        if (distance > radius * 2) break;
      }
      centers.push(best);
    }
    for (const [cr, cc] of centers) {
      for (let r = Math.max(0, cr - radius); r <= Math.min(rows - 1, cr + radius); r++) {
        for (let c = Math.max(0, cc - radius); c <= Math.min(columns - 1, cc + radius); c++) {
          if (board[r][c]) cells.add(key(r, c));
        }
      }
    }
  } else if (leader.id === "jitome") {
    // 下の段から片付ける（上のピースがまとめて落ちて連鎖しやすい）
    const count = Math.min(rows, t.rows ?? 2);
    for (let r = rows - count; r < rows; r++) {
      for (let c = 0; c < columns; c++) if (board[r][c]) cells.add(key(r, c));
    }
  } else if (leader.id === "bideru") {
    // ふつうのピースを特殊ピースに変える（消さない。次の一手で連鎖祭り）
    const candidates = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
      if (isPiece(board[r][c], typeCount)) candidates.push([r, c]);
    }
    const taken = [];
    for (const [r, c] of shuffled(candidates, random)) {
      if (taken.length >= (t.specials ?? 4)) break;
      if (taken.some(([tr, tc]) => Math.abs(tr - r) + Math.abs(tc - c) <= 1)) continue; // くっつけない
      taken.push([r, c]);
    }
    taken.forEach(([r, c], i) => transforms.push({ r, c, kind: i % 2 === 0 ? "star" : "bomb" }));
  } else if (leader.id === "momo") {
    jackpot = random() < (t.jackpotChance ?? 0);
    timeBonus = jackpot ? (t.jackpotSeconds ?? 20) : (t.seconds ?? 12);
  } else {
    // フタバ：いちばん多い色を、fromRow 段目から下ですべて消す
    const fromRow = Math.max(0, Math.min(rows - 1, t.fromRow ?? 0));
    const counts = new Array(typeCount).fill(0);
    for (let r = fromRow; r < rows; r++) for (const tile of board[r]) if (isPiece(tile, typeCount)) counts[tile.t]++;
    let target = -1, best = 0;
    counts.forEach((count, type) => { if (count > best) { best = count; target = type; } });
    if (target >= 0) {
      for (let r = fromRow; r < rows; r++) for (let c = 0; c < columns; c++) {
        if (board[r][c]?.t === target) cells.add(key(r, c));
      }
    }
  }
  return { cells, spawns, transforms, timeBonus, jackpot };
}
