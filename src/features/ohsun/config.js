export const OHSUN_EVENT_CONFIG = Object.freeze({
  enabled: true,
  // 仮日程。正式な開催期間が決まり次第、この2項目だけを更新する。
  startsAt: "2026-09-01T00:00:00+09:00",
  endsAt: "2026-10-31T23:59:59+09:00",
  gaugeMax: 100,
  match3Value: 10,
  match4Value: 15,
  match5Value: 25,
  chainBonusMultiplier: 3,
  specialPieceValue: 2,
  specialEffect: "REMOVE_MOST_COMMON_COLOR",
  copyrightNotice: "© SUN-TV",
  characterAssets: Object.freeze([
    "Asset/collaborations/ohsun/characters/ohsun_07.png",
    "Asset/collaborations/ohsun/characters/ohsun_08.png",
    "Asset/collaborations/ohsun/characters/ohsun_09.png",
    "Asset/collaborations/ohsun/characters/ohsun_10.png",
    "Asset/collaborations/ohsun/characters/ohsun_11.png",
    "Asset/collaborations/ohsun/characters/ohsun_12.png",
    "Asset/collaborations/ohsun/characters/ohsun_13.png"
  ]),
  // 公式画像は改変せず、キャラクターのセリフは設定しない。
  screenShakeEnabled: true,
  eventVersion: "review-1",
  notice: Object.freeze({
    bannerText: "おっ！サンとコラボ中！",
    bannerHint: "詳しく見る",
    dialogTitle: "おっ！サン コラボ",
    lead: "コスミーを消して太陽ゲージをためよう！",
    steps: Object.freeze([
      "コスミーのピースをマッチすると、太陽ゲージがたまります。",
      "ゲージが100%になると、連鎖が終わったあとにおっ！サンが登場します。",
      "盤面で一番多い色のピースをまとめて消してくれます。"
    ]),
    periodLabel: "開催期間",
    closeButtonText: "わかった！"
  }),
  backdrop: Object.freeze({
    enabled: true,
    colors: Object.freeze({
      sky: "#83ccdd",
      yellow: "#ffe100",
      green: "#98c789",
      pink: "#dc9bb7",
      gray: "#666666"
    })
  }),
  timing: Object.freeze({
    entrySeconds: 0.72,
    effectDelaySeconds: 0.48,
    exitSeconds: 0.62,
    cooldownSeconds: 0.12
  })
});

export function isOhsunEventActive(now = new Date(), config = OHSUN_EVENT_CONFIG) {
  if (!config || config.enabled !== true) return false;
  const current = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const starts = new Date(config.startsAt).getTime();
  const ends = new Date(config.endsAt).getTime();
  if (![current, starts, ends].every(Number.isFinite)) return false;
  return current >= starts && current <= ends;
}
