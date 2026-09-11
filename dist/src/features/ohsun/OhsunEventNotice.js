const NOTICE_STYLE_ID = "ohsun-event-notice-styles";

function ensureNoticeStyles() {
  const existing = document.getElementById(NOTICE_STYLE_ID);
  if (existing) return existing;
  const link = document.createElement("link");
  link.id = NOTICE_STYLE_ID;
  link.rel = "stylesheet";
  link.href = new URL("./ohsun-event-notice.css?v=20260911-3", import.meta.url).href;
  document.head.appendChild(link);
  return link;
}

function officialImage(source, className, alt) {
  const image = source.cloneNode(false);
  image.className = className;
  image.alt = alt;
  image.draggable = false;
  return image;
}

function formatDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric"
  }).format(date);
}

export function formatOhsunEventPeriod(config) {
  const starts = formatDate(config?.startsAt);
  const ends = formatDate(config?.endsAt);
  return starts && ends ? `${starts} ～ ${ends}` : "";
}

export class OhsunEventNotice {
  constructor(host, sourceImage, config) {
    if (!host || !sourceImage?.src || !config?.notice) {
      throw new Error("OhsunEventNotice requires a host, official image, and notice config.");
    }
    this.host = host;
    this.config = config;
    this.previousFocus = null;
    this.openFrame = 0;
    this.styleLink = ensureNoticeStyles();
    this.onKeyDown = event => this.handleKeyDown(event);
    this.createBanner(sourceImage);
    this.createMenuCopyright();
    this.createDialog(sourceImage);
  }

  createMenuCopyright() {
    const title = this.host.closest("#title");
    if (!title || !this.config.copyrightNotice) return;
    const copyright = document.createElement("small");
    copyright.className = "ohsun-event-menu-copyright";
    copyright.textContent = this.config.copyrightNotice;
    title.appendChild(copyright);
    this.menuCopyright = copyright;
  }

  createBanner(sourceImage) {
    const notice = this.config.notice;
    const banner = document.createElement("button");
    banner.id = "ohsun-event-banner";
    banner.className = "ohsun-event-banner";
    banner.type = "button";
    banner.setAttribute("aria-haspopup", "dialog");
    banner.setAttribute("aria-controls", "ohsun-event-dialog");
    banner.setAttribute("aria-label", `${notice.bannerText} ${notice.bannerHint}`);

    banner.appendChild(officialImage(sourceImage, "ohsun-event-banner-image", ""));
    const copy = document.createElement("span");
    copy.className = "ohsun-event-banner-copy";
    const title = document.createElement("span");
    title.className = "ohsun-event-banner-title";
    title.textContent = notice.bannerText;
    const hint = document.createElement("span");
    hint.className = "ohsun-event-banner-hint";
    hint.textContent = notice.bannerHint;
    copy.append(title, hint);
    banner.appendChild(copy);
    const arrow = document.createElement("span");
    arrow.className = "ohsun-event-banner-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "›";
    banner.appendChild(arrow);
    banner.addEventListener("click", () => this.open());

    this.root = banner;
    this.host.classList.add("has-ohsun-notice");
    this.host.prepend(banner);
  }

  createDialog(sourceImage) {
    const notice = this.config.notice;
    const backdrop = document.createElement("div");
    backdrop.id = "ohsun-event-dialog";
    backdrop.className = "ohsun-event-dialog-backdrop";
    backdrop.hidden = true;

    const dialog = document.createElement("section");
    dialog.className = "ohsun-event-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "ohsun-event-dialog-title");

    const close = document.createElement("button");
    close.className = "ohsun-event-dialog-x";
    close.type = "button";
    close.setAttribute("aria-label", "コラボイベントの説明を閉じる");
    close.textContent = "×";
    close.addEventListener("click", () => this.close());

    const title = document.createElement("h2");
    title.id = "ohsun-event-dialog-title";
    title.textContent = notice.dialogTitle;

    const visual = document.createElement("div");
    visual.className = "ohsun-event-dialog-visual";
    visual.appendChild(officialImage(sourceImage, "ohsun-event-dialog-image", "おっ！サン"));

    const lead = document.createElement("p");
    lead.className = "ohsun-event-dialog-lead";
    lead.textContent = notice.lead;

    const steps = document.createElement("ol");
    steps.className = "ohsun-event-dialog-steps";
    for (const step of notice.steps) {
      const item = document.createElement("li");
      item.textContent = step;
      steps.appendChild(item);
    }

    const period = document.createElement("p");
    period.className = "ohsun-event-dialog-period";
    const periodText = formatOhsunEventPeriod(this.config);
    period.textContent = periodText ? `${notice.periodLabel}：${periodText}` : "";
    period.hidden = !periodText;

    const copyright = document.createElement("p");
    copyright.className = "ohsun-event-dialog-copyright";
    copyright.textContent = this.config.copyrightNotice ?? "";
    copyright.hidden = !copyright.textContent;

    const accept = document.createElement("button");
    accept.className = "ohsun-event-dialog-accept";
    accept.type = "button";
    accept.textContent = notice.closeButtonText;
    accept.addEventListener("click", () => this.close());

    dialog.append(close, title, visual, lead, steps, period, copyright, accept);
    backdrop.appendChild(dialog);
    backdrop.addEventListener("click", event => {
      if (event.target === backdrop) this.close();
    });
    document.body.appendChild(backdrop);

    this.dialogRoot = backdrop;
    this.dialog = dialog;
    this.closeButton = close;
  }

  open() {
    if (!this.dialogRoot?.hidden) return;
    this.previousFocus = this.root;
    this.dialogRoot.hidden = false;
    document.body.classList.add("ohsun-event-dialog-open");
    document.addEventListener("keydown", this.onKeyDown);
    this.openFrame = requestAnimationFrame(() => {
      this.openFrame = 0;
      this.dialogRoot?.classList.add("is-open");
    });
    this.closeButton.focus({ preventScroll: true });
  }

  close({ restoreFocus = true } = {}) {
    if (!this.dialogRoot || this.dialogRoot.hidden) return;
    if (this.openFrame) {
      cancelAnimationFrame(this.openFrame);
      this.openFrame = 0;
    }
    this.dialogRoot.classList.remove("is-open");
    this.dialogRoot.hidden = true;
    document.body.classList.remove("ohsun-event-dialog-open");
    document.removeEventListener("keydown", this.onKeyDown);
    if (restoreFocus && this.previousFocus?.isConnected) {
      this.previousFocus.focus({ preventScroll: true });
    }
    this.previousFocus = null;
  }

  handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = [...this.dialog.querySelectorAll("button:not([disabled])")];
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  destroy() {
    this.close({ restoreFocus: false });
    this.root?.remove();
    this.menuCopyright?.remove();
    this.dialogRoot?.remove();
    this.host?.classList.remove("has-ohsun-notice");
    this.styleLink?.remove();
    this.root = null;
    this.menuCopyright = null;
    this.dialogRoot = null;
  }
}
