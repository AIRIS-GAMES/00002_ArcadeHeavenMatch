import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sound = html.split("//================ Sound ================")[1].split("//================ Game State")[0];

function setup(saved = "0", extra = {}) {
  const elements = [];
  let time = 0;
  class Audio {
    constructor(src) {
      this.src = src; this.paused = true; this._t = 0; this.ended = false;
      this.muted = false; this.volume = 0; this.preload = "";
      this.calls = []; this.events = {}; this.reject = false;
      elements.push(this);
    }
    get currentTime() { return this._t; }
    set currentTime(v) { if (this._t !== v) this.calls.push("seek"); this._t = v; }
    pause() { this.calls.push("pause"); this.paused = true; }
    play() {
      // Real play() resumes from the current position; only leave 0 so a pooled voice
      // stops looking idle. Assign the backing field so this does not log a seek.
      this.calls.push("play"); this.paused = false; this._t = this._t || 0.01;
      return this.reject ? Promise.reject(new Error("blocked")) : Promise.resolve();
    }
    finish() { this.paused = true; this.ended = true; if (this.events.ended) this.events.ended(); }
    addEventListener(name, fn) { this.events[name] = fn; }
    load() { this.calls.push("load"); }
  }
  const bgm = new Audio("bgm");
  const events = {}, nativeEvents = {}, storage = new Map([["ohanapon-muted", saved]]);
  const document = {
    hidden: false,
    getElementById: id => (id === "bgm" ? bgm : null),
    addEventListener: (name, fn) => { events[name] = fn; }
  };
  const window = {
    addEventListener: (name, fn) => { events[name] = fn; },
    Capacitor: {
      isNativePlatform: () => true,
      // The injected iOS bridge has no registerPlugin; listeners return a handle.
      Plugins: { App: { addListener: (name, fn) => {
        nativeEvents[name] = fn;
        return { remove: async () => {} };
      } } }
    }
  };
  const context = vm.createContext({
    Audio, document, window, performance: { now: () => time }, Promise,
    gameStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) },
    stopGameLoop() { }, resetFrameClock() { }, ensureGameLoop() { }, resetPointerInput() { }, ...extra
  });
  vm.runInContext(sound + '\nlet state="idle"; applyMuted();', context);
  const run = code => vm.runInContext(code, context);
  const settled = () => new Promise(r => setImmediate(r));
  return {
    elements, bgm, events, nativeEvents, storage, document, run, settled,
    advance(ms) { time += ms; },
    effects: () => elements.slice(1),
    pool: key => run(`sfx.get(${JSON.stringify(key)})`),
    async unlock() { run("unlockAudio()"); await settled(); for (const e of elements.slice(1)) e.calls.length = 0; }
  };
}

test("no Web Audio survives anywhere in the sound code", () => {
  assert.doesNotMatch(sound, /AudioContext|webkitAudioContext/);
  assert.doesNotMatch(sound, /createBufferSource|createOscillator|createGain|Convolver|BiquadFilter/);
  assert.match(sound, /new Audio\(/);
});

test("startup tolerates an absent or failing native lifecycle plugin", async () => {
  for (const app of [undefined, {},
    { addListener() { throw new Error("unavailable"); } },
    { addListener() { return Promise.reject(new Error("unavailable")); } }
  ]) {
    const h = setup("0", {
      window: { addEventListener() {}, Capacitor: {
        isNativePlatform: () => true, Plugins: { App: app }
      } },
      console: { warn() {} }
    });
    await h.unlock();
    h.run("playBgm()");
    assert.equal(h.bgm.paused, false);
  }
});

test("every effect is a media element and every WAV records loud enough without clipping", () => {
  const h = setup();
  const sources = h.run("[...sfxSources.entries()]");
  assert.equal(sources.length, 31);
  const peaks = new Map();
  for (const [, source] of sources) {
    const wav = readFileSync(new URL("../" + source, import.meta.url));
    assert.equal(wav.toString("ascii", 0, 4), "RIFF");
    assert.equal(wav.readUInt16LE(20), 1);
    assert.equal(wav.readUInt32LE(24), 44100);
    let peak = 0;
    for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)) / 32767);
    // iOS screen recording taps app audio before the hardware volume control, so a quiet mix
    // records into the noise floor and plays back as crackle whatever the phone volume is.
    assert.ok(Math.abs(peak - .5) < .001, source + " peak " + peak);
    assert.ok((wav.length - 44) / 88200 < 1, source);
    peaks.set(source, peak);
  }
  const volumes = h.run("[...sfxVolumes.values()]");
  assert.ok(volumes.every(v => v >= .3 && v <= .7));
  const loudestEffect = Math.max(...peaks.values()) * Math.max(...volumes);
  assert.ok(loudestEffect >= .15, "effects must not sink toward the noise floor");
  const bgmPeak = .467 * h.run("BGM_DEFAULT_VOLUME");   // decoded peak -6.6 dBFS, see docs
  assert.ok(bgmPeak >= .1 && bgmPeak <= .25, "BGM peak " + bgmPeak);
  assert.ok(bgmPeak + loudestEffect * h.run("SFX_MAX_VOICES") < 1, "the voice cap must not clip");
});

test("chain-rate effects are pooled and preloaded, the rest load on first use", () => {
  const h = setup();
  for (const key of ["swap", "deny", "clear-0", "clear-5"]) {
    assert.equal(h.pool(key).length, 2, key);
    assert.ok(h.pool(key).every(e => e.preload === "auto"), key);
  }
  for (const key of ["bell", "bomb", "stage", "tick-3", "coin-2"]) {
    assert.equal(h.pool(key).length, 1, key);
    assert.ok(h.pool(key).every(e => e.preload === "none"), key);
  }
});

test("a gesture primes the pooled elements muted, then restores their mute state", async () => {
  const h = setup("0", { window: { addEventListener() {} } });
  h.run("unlockAudio()");
  const primed = h.effects().filter(e => e.calls.includes("play"));
  assert.equal(primed.length, 16, "swap, deny and clear-0..5, two voices each");
  await h.settled();
  assert.ok(primed.every(e => e.paused && e.currentTime === 0 && e.muted === false));
  // Priming happens once, not on every tap.
  for (const e of h.effects()) e.calls.length = 0;
  h.run("unlockAudio()");
  assert.ok(h.effects().every(e => e.calls.length === 0));
});

test("native startup starts requested audio without priming every pooled effect", async () => {
  const h = setup();
  h.run("unlockAudio(); playBgm(); sndSwap()");
  await h.settled();
  assert.equal(h.bgm.paused, false);
  assert.equal(h.pool("swap")[0].paused, false);
  assert.equal(h.pool("swap")[0].muted, false);
  assert.equal(h.effects().filter(e => e.calls.includes("play")).length, 1);
});

test("pending browser priming respects sound settings changed during the gesture", async () => {
  for (const saved of ["0", "1"]) {
    const h = setup(saved, { window: { addEventListener() {} } });
    h.run("unlockAudio(); toggleMute()");
    await h.settled();
    assert.ok(h.elements.every(e => e.muted === (saved === "0")));
  }
});

test("browser priming completion does not stop an effect already used by the game", async () => {
  const h = setup("0", { window: { addEventListener() {} } });
  h.run("unlockAudio(); sndSwap()");
  await h.settled();
  assert.equal(h.pool("swap")[0].paused, false);
  assert.equal(h.pool("swap")[0].muted, false);
});

test("a rewound voice starts with play() alone, with no seek on the trigger", async () => {
  const h = setup();
  await h.unlock();
  h.run("sndSwap()");
  const [first, second] = h.pool("swap");
  assert.deepEqual(first.calls, ["play"], "no pause or seek on the frame that starts a sound");
  first.finish();
  assert.deepEqual(first.calls, ["play", "seek"], "the rewind lands after playback, not before");
  h.advance(120);
  h.run("sndSwap()");
  assert.deepEqual(first.calls, ["play", "seek", "play"]);
  assert.deepEqual(second.calls, []);
});

test("a second voice covers a retrigger while the first is still sounding", async () => {
  const h = setup();
  await h.unlock();
  h.run("sndSwap()");
  h.advance(120);
  h.run("sndSwap()");
  const [first, second] = h.pool("swap");
  assert.equal(first.paused, false);
  assert.deepEqual(second.calls, ["play"], "the idle voice needs no seek either");
});

test("a burst of one effect starts a single voice per retrigger window", async () => {
  const h = setup();
  await h.unlock();
  h.run("for(let i=0;i<56;i++) sndBomb()");
  const bomb = h.pool("bomb")[0];
  assert.deepEqual(bomb.calls, ["play"]);
  h.advance(99); h.run("sndBomb()");
  assert.equal(bomb.calls.length, 1);
  h.advance(1); h.run("sndBomb()");
  assert.deepEqual(bomb.calls, ["play", "pause", "seek", "play"]);
});

test("at most three effects overlap", async () => {
  const h = setup();
  await h.unlock();
  h.run("sndBell(); sndBomb(); sndTime(); sndColorClear(); sndLose()");
  assert.equal(h.run("activeSfx.size"), 3);
  assert.equal(h.effects().filter(e => !e.paused).length, 3);
});

test("stopping sound pauses and rewinds only live voices", async () => {
  const h = setup();
  await h.unlock();
  h.run("sndSwap(); sndBell(); stopSfx()");
  assert.deepEqual(h.pool("swap")[0].calls, ["play", "pause", "seek"]);
  assert.deepEqual(h.pool("bell")[0].calls, ["play", "pause", "seek"]);
  assert.equal(h.run("activeSfx.size"), 0);
  assert.ok(h.pool("tick-0")[0].calls.length === 0, "idle files are never touched");
});

test("BGM stays one element and repeated starts do not restart it", async () => {
  const h = setup();
  h.run("playBgm()");
  assert.equal(h.bgm.paused, true, "no BGM before a gesture");
  await h.unlock();
  h.run("playBgm(); playBgm()");
  assert.equal(h.bgm.calls.filter(c => c === "play").length, 1);
  h.bgm.currentTime = 12;
  h.run("pauseBgm(); restoreAudio()");
  assert.equal(h.bgm.paused, true);
  h.run("playBgm()");
  assert.equal(h.bgm.currentTime, 12, "resumes from position");
  h.run("stopBgm(); restoreAudio()");
  assert.equal(h.bgm.paused, true);
  assert.equal(h.bgm.currentTime, 0);
});

test("muting silences everything, stops voices and survives a reload", async () => {
  const h = setup();
  await h.unlock();
  h.run("sndSwap()");
  h.run("toggleMute()");
  assert.ok(h.elements.every(e => e.muted));
  assert.equal(h.run("activeSfx.size"), 0);
  h.run("sndBell()");
  assert.equal(h.pool("bell")[0].calls.length, 0);
  assert.equal(h.storage.get("ohanapon-muted"), "1");

  const reload = setup(h.storage.get("ohanapon-muted"));
  reload.run("unlockAudio(); playBgm(); sndBomb()");
  await reload.settled();
  assert.ok(reload.elements.every(e => e.paused));
  assert.ok(reload.elements.every(e => e.muted));
});

test("visibility and native lifecycle preserve BGM intent without replaying stale effects", async () => {
  const h = setup();
  await h.unlock();
  h.run("playBgm(); sndBell()");
  h.bgm.currentTime = 7;

  h.document.hidden = true; h.events.visibilitychange();
  assert.ok(h.elements.every(e => e.paused));
  h.run("sndBomb()");
  assert.equal(h.pool("bomb")[0].calls.length, 0);

  h.nativeEvents.appStateChange({ isActive: false });
  h.document.hidden = false; h.events.visibilitychange(); h.events.focus();
  assert.equal(h.bgm.paused, true, "native inactive still blocks BGM");
  h.nativeEvents.appStateChange({ isActive: true });
  assert.equal(h.bgm.paused, false);
  assert.equal(h.bgm.currentTime, 7);
  assert.ok(h.effects().every(e => e.paused), "old effects must not replay");

  h.events.pagehide(); assert.equal(h.bgm.paused, true);
  h.events.pageshow(); assert.equal(h.bgm.paused, false);
});

test("autoplay rejection releases the voice and a later gesture can retry", async () => {
  const h = setup();
  await h.unlock();
  const swap = h.pool("swap")[0];
  swap.reject = true;
  h.run("sndSwap()");
  await h.settled();
  assert.equal(h.run("activeSfx.size"), 0);
  swap.reject = false; swap.paused = true; swap.currentTime = 0;
  h.run("sndSwap()");
  assert.equal(h.run("activeSfx.size"), 1);

  h.bgm.reject = true;
  h.run("playBgm()");
  await h.settled();
  h.bgm.paused = true; h.bgm.reject = false;
  h.run("unlockAudio()");
  assert.equal(h.bgm.paused, false);
});

test("iOS leaves the audio session to WKWebView so screen recording stays clean", () => {
  const appDelegate = readFileSync(new URL("../ios/App/App/AppDelegate.swift", import.meta.url), "utf8");
  // Overriding the session garbled Control Center recordings for BGM and effects alike, and
  // .mixWithOthers dropped app audio from them entirely. Both reproduced on device.
  // Assert on code rather than the file so the comments stay free to name what is banned.
  const code = appDelegate
    .split(String.fromCharCode(10))
    .filter(line => !line.trim().startsWith("//"))
    .join(String.fromCharCode(10));
  assert.ok(!code.includes("AVFoundation"));
  assert.ok(!code.includes("AVAudioSession"));
  assert.ok(!code.includes("setCategory"));
  assert.ok(!code.includes("mixWithOthers"));
});
