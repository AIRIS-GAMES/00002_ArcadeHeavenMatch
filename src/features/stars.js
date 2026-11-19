// ステージの星評価（★1〜3）。条件ごとに1つずつ星がつく。
export const STAR_STORAGE_KEY = "ohanapon-stars";
export const STAR_TIME_LEFT_SECONDS = 10;

export function rateStage({ misses = 0, timeLeft = 0 } = {}) {
  const checks = [
    { id:"clear", label:"ステージクリア", earned:true },
    { id:"nomiss", label:"ノーミス", earned:Number(misses) === 0 },
    { id:"time", label:`のこり${STAR_TIME_LEFT_SECONDS}びょう以上`, earned:Number(timeLeft) >= STAR_TIME_LEFT_SECONDS }
  ];
  return { stars:checks.filter(check => check.earned).length, checks };
}

// 保存形式: {"1":3,"2":1,...}。壊れた値は無視する。
export function parseStarRecord(text) {
  let data;
  try { data = JSON.parse(text || "{}"); } catch { return {}; }
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const record = {};
  for (const [stage, stars] of Object.entries(data)) {
    const level = Number(stage), value = Number(stars);
    if (Number.isSafeInteger(level) && level > 0 && Number.isInteger(value) && value >= 1 && value <= 3) record[level] = value;
  }
  return record;
}

// 最高記録だけ残す。戻り値: { record, best, improved }
export function recordStageStars(record, level, stars) {
  const previous = record[level] || 0;
  const best = Math.max(previous, stars);
  return { record:{ ...record, [level]:best }, best, improved:stars > previous };
}

export function totalStars(record) {
  return Object.values(record).reduce((sum, stars) => sum + stars, 0);
}
