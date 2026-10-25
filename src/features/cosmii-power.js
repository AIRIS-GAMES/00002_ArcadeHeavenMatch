export const COSMII_POWER_CONFIG = Object.freeze({
  gaugeMax: 100,
  match3Value: 10,
  match4Value: 15,
  match5Value: 25,
  chainBonusMultiplier: 3,
  specialPieceValue: 2,
  screenShakeEnabled: true,
  timing: Object.freeze({ entrySeconds: 1.05, effectDelaySeconds: 0.48, exitSeconds: 0.9, cooldownSeconds: 0.18 })
});

export const COSMII_POWER_STATES = Object.freeze({
  DISABLED: "DISABLED", CHARGING: "CHARGING", READY: "READY",
  ENTERING: "ENTERING", ACTIVATING: "ACTIVATING", EXITING: "EXITING", COOLDOWN: "COOLDOWN"
});

export function calculatePowerCharge(details = {}, config = COSMII_POWER_CONFIG) {
  let gain = 0;
  for (const length of details.matchLengths || []) {
    if (length >= 5) gain += config.match5Value;
    else if (length === 4) gain += config.match4Value;
    else if (length === 3) gain += config.match3Value;
  }
  if (details.combo > 1) gain += (details.combo - 1) * config.chainBonusMultiplier;
  gain += Math.max(0, details.specialRemovedCount || 0) * config.specialPieceValue;
  return gain;
}

export class CosmiiPowerManager {
  constructor(config = COSMII_POWER_CONFIG, callbacks = {}) {
    this.config = config;
    this.callbacks = callbacks;
    this.state = COSMII_POWER_STATES.DISABLED;
    this.gauge = 0;
    this.elapsed = 0;
    this.effectTriggered = false;
  }

  reset(enabled) {
    this.state = enabled ? COSMII_POWER_STATES.CHARGING : COSMII_POWER_STATES.DISABLED;
    this.gauge = 0;
    this.elapsed = 0;
    this.effectTriggered = false;
    this.callbacks.onGaugeChanged?.(this.gauge, false);
  }

  disable() { this.reset(false); }

  addCharge(details) {
    if (this.state !== COSMII_POWER_STATES.CHARGING) return 0;
    const previous = this.gauge;
    this.gauge = Math.min(this.config.gaugeMax, previous + calculatePowerCharge(details, this.config));
    if (this.gauge >= this.config.gaugeMax) {
      this.state = COSMII_POWER_STATES.READY;
      this.callbacks.onGaugeFull?.();
    }
    this.callbacks.onGaugeChanged?.(this.gauge, this.gauge >= this.config.gaugeMax);
    return this.gauge - previous;
  }

  isReady() { return this.state === COSMII_POWER_STATES.READY; }

  isBusy() {
    return [COSMII_POWER_STATES.ENTERING, COSMII_POWER_STATES.ACTIVATING,
      COSMII_POWER_STATES.EXITING, COSMII_POWER_STATES.COOLDOWN].includes(this.state);
  }

  begin() {
    if (!this.isReady()) return false;
    this.state = COSMII_POWER_STATES.ENTERING;
    this.elapsed = 0;
    this.effectTriggered = false;
    this.callbacks.onEntry?.();
    return true;
  }

  finishEffect() {
    if (this.state !== COSMII_POWER_STATES.ACTIVATING || !this.effectTriggered) return false;
    this.state = COSMII_POWER_STATES.EXITING;
    this.elapsed = 0;
    this.gauge = 0;
    this.callbacks.onGaugeChanged?.(this.gauge, false);
    this.callbacks.onExit?.();
    return true;
  }

  update(dt) {
    if (!this.isBusy() || dt <= 0) return;
    this.elapsed += dt;
    const timing = this.config.timing;
    if (this.state === COSMII_POWER_STATES.ENTERING && this.elapsed >= timing.entrySeconds) {
      this.state = COSMII_POWER_STATES.ACTIVATING;
      this.elapsed = 0;
      this.callbacks.onEffectStart?.();
      return;
    }
    if (this.state === COSMII_POWER_STATES.ACTIVATING && !this.effectTriggered && this.elapsed >= timing.effectDelaySeconds) {
      this.effectTriggered = true;
      this.callbacks.onActivate?.();
      return;
    }
    if (this.state === COSMII_POWER_STATES.EXITING && this.elapsed >= timing.exitSeconds) {
      this.state = COSMII_POWER_STATES.COOLDOWN;
      this.elapsed = 0;
      return;
    }
    if (this.state === COSMII_POWER_STATES.COOLDOWN && this.elapsed >= timing.cooldownSeconds) {
      this.state = COSMII_POWER_STATES.CHARGING;
      this.elapsed = 0;
      this.effectTriggered = false;
      this.callbacks.onComplete?.();
    }
  }
}

export function findMostCommonColorCells(board, typeCount) {
  const counts = new Array(typeCount).fill(0);
  for (const row of board) {
    for (const tile of row) {
      if (tile && Number.isInteger(tile.t) && tile.t >= 0 && tile.t < typeCount) counts[tile.t]++;
    }
  }
  let targetType = null;
  let count = 0;
  for (let type = 0; type < counts.length; type++) {
    if (counts[type] > count) { targetType = type; count = counts[type]; }
  }
  const cells = new Set();
  if (targetType !== null) {
    for (let row = 0; row < board.length; row++) {
      for (let column = 0; column < board[row].length; column++) {
        if (board[row][column]?.t === targetType) cells.add(`${row},${column}`);
      }
    }
  }
  return { targetType, count, cells };
}

export function pickRandomCosmii(images, random = Math.random) {
  const available = images.filter(Boolean);
  return available.length ? available[Math.floor(random() * available.length)] : null;
}

export function calculateCosmiiPowerLayout({ board, imageAspect }) {
  const height = Math.min(board.height * 0.72, board.width / imageAspect);
  const width = height * imageAspect;
  return { x: board.x + (board.width - width) / 2, y: board.y + (board.height - height) / 2, width, height };
}

export function getCosmiiPowerPresentation(rect, phase, progress, reduceMotion = false) {
  if (reduceMotion) return rect;
  const t = Math.max(0, Math.min(1, progress));
  const scale = phase === COSMII_POWER_STATES.ENTERING ? 0.35 + 0.65 * t
    : phase === COSMII_POWER_STATES.EXITING || phase === COSMII_POWER_STATES.COOLDOWN ? 1 - t * 0.45 : 1;
  const width = rect.width * scale;
  const height = rect.height * scale;
  return { x: rect.x + (rect.width - width) / 2, y: rect.y + (rect.height - height) / 2, width, height };
}

export class CosmiiPowerResult {
  constructor() { this.reset(); }
  reset() { this.activations = 0; this.piecesRemoved = 0; this.scoreGained = 0; }
  record({ piecesRemoved = 0, scoreGained = 0 } = {}) {
    this.activations++;
    this.piecesRemoved += piecesRemoved;
    this.scoreGained += scoreGained;
  }
  render(container) {
    if (!container || !this.activations) return;
    const row = document.createElement("div");
    row.className = "cosmii-power-result";
    row.textContent = `Cosmiiパワー ${this.activations}回・${this.piecesRemoved}個消去・+${this.scoreGained}点`;
    container.appendChild(row);
  }
}