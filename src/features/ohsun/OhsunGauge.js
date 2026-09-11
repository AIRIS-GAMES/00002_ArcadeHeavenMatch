export function matchGaugeValue(matchLength, config) {
  if (matchLength >= 5) return config.match5Value;
  if (matchLength === 4) return config.match4Value;
  if (matchLength === 3) return config.match3Value;
  return 0;
}

export function calculateGaugeGain({ matchLengths = [], combo = 1, specialRemovedCount = 0 } = {}, config) {
  const matchValue = matchLengths.reduce((sum, length) => sum + matchGaugeValue(length, config), 0);
  const chainValue = combo >= 2 ? combo * config.chainBonusMultiplier : 0;
  const specialValue = Math.max(0, specialRemovedCount) * config.specialPieceValue;
  return matchValue + chainValue + specialValue;
}

export class OhsunGaugeView {
  constructor(host, maxValue) {
    this.maxValue = maxValue;
    this.root = document.createElement("div");
    this.root.id = "ohsun-gauge";
    this.root.setAttribute("role", "meter");
    this.root.setAttribute("aria-label", "太陽ゲージ");
    this.root.innerHTML = [
      '<span class="ohsun-gauge-icon" aria-hidden="true">☀</span>',
      '<span class="ohsun-gauge-track"><span class="ohsun-gauge-fill"></span></span>',
      '<span class="ohsun-gauge-value">0%</span>',
      '<span class="ohsun-gauge-ready" aria-live="polite"></span>'
    ].join("");
    host.appendChild(this.root);
    this.fill = this.root.querySelector(".ohsun-gauge-fill");
    this.value = this.root.querySelector(".ohsun-gauge-value");
    this.ready = this.root.querySelector(".ohsun-gauge-ready");
    this.setValue(0, false);
  }

  setValue(value, announceReady = true) {
    const percent = Math.max(0, Math.min(100, value / this.maxValue * 100));
    this.fill.style.width = percent + "%";
    this.value.textContent = Math.round(percent) + "%";
    this.root.setAttribute("aria-valuemin", "0");
    this.root.setAttribute("aria-valuemax", String(this.maxValue));
    this.root.setAttribute("aria-valuenow", String(Math.round(value)));
    this.root.classList.toggle("is-glowing", percent >= 80);
    if (percent >= 100 && !this.root.classList.contains("is-full")) {
      this.root.classList.add("is-full");
      if (announceReady) this.ready.textContent = "おっ！サン登場！";
    } else if (percent < 100) {
      this.root.classList.remove("is-full");
      this.ready.textContent = "";
    }
  }

  destroy() {
    this.root.remove();
  }
}

