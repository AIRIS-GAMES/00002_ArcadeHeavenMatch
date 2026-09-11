export class OhsunStageResult {
  constructor() {
    this.reset();
  }

  reset() {
    this.activations = 0;
    this.piecesRemoved = 0;
    this.scoreGained = 0;
    this.remove();
  }

  record({ piecesRemoved = 0, scoreGained = 0 } = {}) {
    this.activations++;
    this.piecesRemoved += Math.max(0, Number(piecesRemoved) || 0);
    this.scoreGained += Math.max(0, Number(scoreGained) || 0);
  }

  render(panel, beforeElement = null) {
    this.remove();
    if (!panel || this.activations < 1) return null;
    const row = document.createElement("div");
    row.className = "ohsun-result-summary";
    row.setAttribute("role", "status");
    row.textContent = `おっ！サン ${this.activations}回登場・${this.piecesRemoved}個消去・+${this.scoreGained}点`;
    panel.insertBefore(row, beforeElement);
    this.element = row;
    return row;
  }

  remove() {
    if (this.element) this.element.remove();
    this.element = null;
  }
}
