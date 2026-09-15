export const GAME_CONFIG = Object.freeze({
  board: Object.freeze({ columns: 7, rows: 8, pieceTypes: 5 }),
  stage: Object.freeze({
    baseTarget: 800,
    targetPerLevel: 400,
    timeSeconds: 60,
    lives: 5,
    missPenaltyStartsAtLevel: 4
  }),
  scoring: Object.freeze({ pointsPerPiece: 15 }),
  specialPieces: Object.freeze({
    timeRecoverySeconds: 8,
    colorClearDropRate: 0.025
  }),
  animation: Object.freeze({ swapSeconds: 0.14, clearSeconds: 0.26, gravity: 4200 }),
  tutorial: Object.freeze({
    completedStorageKey: "ohanapon-tutorial-completed",
    specialSeenStoragePrefix: "ohanapon-special-seen-",
    specialGuides: Object.freeze({
      9: "スター完成！動かすと上下左右を消すよ",
      10: "ボム完成！まわりをまとめて消すよ",
      11: "時計完成！時間が8秒回復するよ",
      12: "カラーピース！同じ色を全部消すよ"
    })
  }),
  startup: Object.freeze({ minimumLoadingMs: 1200, maximumLoadingMs: 5000 }),
  hint: Object.freeze({ delaySeconds: 5 }),
  economy: Object.freeze({
    minimumClearReward: 10,
    scorePerCoin: 10,
    timeBoostPrice: 300,
    lifeBoostPrice: 400,
    timeBoostSeconds: 15,
    lifeBoostAmount: 2,
    loginRewards: Object.freeze([50, 80, 100, 120, 150, 200, 400]),
    fullPromoEvery: 10
  }),
  performance: Object.freeze({
    activeFrameRate: 60,
    maxDpr: 2,
    maxCanvasPixels: 1500000,
    particleDensity: 0.5,
    maxParticles: 150,
    reducedEffects: true
  })
});

export const PIECE_NAMES = Object.freeze(["ピンク", "ブルー", "グリーン", "レッド", "パープル"]);

export function getStageRules(level) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  const scoreTarget = GAME_CONFIG.stage.baseTarget + safeLevel * GAME_CONFIG.stage.targetPerLevel;
  let mission = Object.freeze({ type: "NONE", target: 0 });

  if (safeLevel > 3) {
    if (safeLevel % 10 === 0) {
      mission = Object.freeze({ type: "SPECIAL", target: Math.min(3, 1 + Math.floor(safeLevel / 10)) });
    } else if (safeLevel % 3 === 1) {
      mission = Object.freeze({
        type: "COLOR",
        pieceType: (safeLevel - 1) % GAME_CONFIG.board.pieceTypes,
        target: Math.min(20, 10 + Math.floor(safeLevel / 10) * 2)
      });
    } else if (safeLevel % 3 === 2) {
      mission = Object.freeze({ type: "COMBO", target: safeLevel >= 15 ? 3 : 2 });
    } else {
      mission = Object.freeze({ type: "SPECIAL", target: safeLevel >= 12 ? 2 : 1 });
    }
  }

  return Object.freeze({
    level: safeLevel,
    scoreTarget,
    timeSeconds: GAME_CONFIG.stage.timeSeconds,
    lives: GAME_CONFIG.stage.lives,
    mission
  });
}

export function createStageStats(pieceTypes = GAME_CONFIG.board.pieceTypes) {
  return {
    piecesCleared: 0,
    colorClears: Array.from({ length: pieceTypes }, () => 0),
    specialsCreated: 0,
    maxCombo: 1
  };
}

export function missionProgress(rules, stats) {
  const mission = rules && rules.mission;
  if (!mission || mission.type === "NONE") return { current: 0, target: 0, complete: true };
  let current = 0;
  if (mission.type === "COLOR") current = stats.colorClears[mission.pieceType] || 0;
  if (mission.type === "COMBO") current = stats.maxCombo || 1;
  if (mission.type === "SPECIAL") current = stats.specialsCreated || 0;
  return { current: Math.min(current, mission.target), target: mission.target, complete: current >= mission.target };
}

export function isStageComplete(rules, score, stats) {
  return Number(score) >= rules.scoreTarget && missionProgress(rules, stats).complete;
}

export function describeStageMission(rules, stats) {
  const mission = rules.mission;
  const progress = missionProgress(rules, stats);
  if (mission.type === "NONE") return "スコア目標を達成しよう";
  if (mission.type === "COLOR") {
    return `${PIECE_NAMES[mission.pieceType]}を消す ${progress.current}/${progress.target}`;
  }
  if (mission.type === "COMBO") return `${mission.target}コンボを達成 ${progress.current}/${progress.target}`;
  return `特殊ピースを作る ${progress.current}/${progress.target}`;
}
