import { calculateGaugeGain } from "./OhsunGauge.js";

export const OHSUN_EVENT_STATES = Object.freeze({
  DISABLED: "DISABLED",
  CHARGING: "CHARGING",
  READY: "READY",
  ENTERING: "ENTERING",
  ACTIVATING: "ACTIVATING",
  EXITING: "EXITING",
  COOLDOWN: "COOLDOWN"
});

export class OhsunEventManager {
  constructor(config, callbacks = {}) {
    this.config = config;
    this.callbacks = callbacks;
    this.state = OHSUN_EVENT_STATES.DISABLED;
    this.gauge = 0;
    this.elapsed = 0;
    this.effectTriggered = false;
  }

  reset(enabled) {
    this.state = enabled ? OHSUN_EVENT_STATES.CHARGING : OHSUN_EVENT_STATES.DISABLED;
    this.gauge = 0;
    this.elapsed = 0;
    this.effectTriggered = false;
    this.callbacks.onGaugeChanged?.(this.gauge, false);
  }

  disable() {
    this.reset(false);
  }

  addCharge(details) {
    if (this.state !== OHSUN_EVENT_STATES.CHARGING) return 0;
    const gain = calculateGaugeGain(details, this.config);
    if (gain <= 0) return 0;
    const previous = this.gauge;
    this.gauge = Math.min(this.config.gaugeMax, previous + gain);
    if (this.gauge >= this.config.gaugeMax) {
      this.state = OHSUN_EVENT_STATES.READY;
      this.callbacks.onGaugeFull?.();
    }
    this.callbacks.onGaugeChanged?.(this.gauge, true);
    return this.gauge - previous;
  }

  isReady() {
    return this.state === OHSUN_EVENT_STATES.READY;
  }

  isBusy() {
    return [
      OHSUN_EVENT_STATES.ENTERING,
      OHSUN_EVENT_STATES.ACTIVATING,
      OHSUN_EVENT_STATES.EXITING,
      OHSUN_EVENT_STATES.COOLDOWN
    ].includes(this.state);
  }

  begin() {
    if (!this.isReady()) return false;
    this.state = OHSUN_EVENT_STATES.ENTERING;
    this.elapsed = 0;
    this.effectTriggered = false;
    this.callbacks.onEntry?.();
    return true;
  }

  finishEffect() {
    if (this.state !== OHSUN_EVENT_STATES.ACTIVATING || !this.effectTriggered) return false;
    this.state = OHSUN_EVENT_STATES.EXITING;
    this.elapsed = 0;
    this.gauge = 0;
    this.callbacks.onGaugeChanged?.(this.gauge, false);
    this.callbacks.onExit?.();
    return true;
  }

  update(dt) {
    const timing = this.config.timing;
    if (!this.isBusy() || dt <= 0) return;
    this.elapsed += dt;
    if (this.state === OHSUN_EVENT_STATES.ENTERING && this.elapsed >= timing.entrySeconds) {
      this.state = OHSUN_EVENT_STATES.ACTIVATING;
      this.elapsed = 0;
      this.callbacks.onEffectStart?.();
      return;
    }
    if (this.state === OHSUN_EVENT_STATES.ACTIVATING && !this.effectTriggered && this.elapsed >= timing.effectDelaySeconds) {
      this.effectTriggered = true;
      this.callbacks.onActivate?.();
      return;
    }
    if (this.state === OHSUN_EVENT_STATES.EXITING && this.elapsed >= timing.exitSeconds) {
      this.state = OHSUN_EVENT_STATES.COOLDOWN;
      this.elapsed = 0;
      return;
    }
    if (this.state === OHSUN_EVENT_STATES.COOLDOWN && this.elapsed >= timing.cooldownSeconds) {
      this.state = OHSUN_EVENT_STATES.CHARGING;
      this.elapsed = 0;
      this.effectTriggered = false;
      this.callbacks.onComplete?.();
    }
  }
}

