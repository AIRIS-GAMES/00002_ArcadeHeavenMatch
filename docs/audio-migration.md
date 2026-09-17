# HTML media audio migration

## TestFlight silence follow-up (2026-09-17)

Reported on iPhone 17 / iOS 26.x, TestFlight version 1.09 (build 20): both music and effects are silent even with silent mode disabled. The exact OS version is still unknown. Local bundle files match the source audio; this does not establish which files are in the distributed archive. The earlier silent-switch explanation does not account for this report.

Playback errors are now retained instead of silently discarded. A later playback attempt reloads an element with a media error before calling `play()`; healthy elements retain the existing pool behavior. This repairs a recovery gap, but is not yet a confirmed fix for the device report.

Settings now provides separate BGM (3 seconds) and effect checks using the existing media elements. Expand the result to copy the error, playback progress, media readiness, source, lifecycle flags, user agent, and native app version/build when available. Advancing playback time does **not** prove audible speaker output. Closing settings, muting, or backgrounding stops the check. Saved sound preferences are respected.

Run `AUDIO_SETTINGS_TEST=1 MOBILE_TEST_VIEWPORT=390x844 MOBILE_WEB_ROOT=ios/App/App/public npm run test:mobile` to verify the checks in Chromium and WebKit (set environment variables separately in PowerShell). Generate native files with `npm run cap:sync`, then archive and distribute a new build from Xcode. The current Windows environment cannot compile or distribute an iOS archive. On the affected device, run both checks with sound ON and retain each result. Initial launch and foreground recovery, plus screen recording, remain device verification steps. No native audio-session override was introduced.

## Comparison and pre-change inventory

The initial working tree was clean. Reference: `C:/MyWork/startup/00010_CosmiiCannon/www/index.html` (read only).

| Path in the original source | Behavior before migration |
| --- | --- |
| Reference, lines 3483-3575 | Two exclusive HTML BGM elements, file-based effects, `pause()` / seek to zero / `play()`, gesture unlock and saved preferences |
| Reference, lines 4092-4105 | Visibility and page-hide pause handling |
| `index.html:1507` | One HTML BGM element, `Asset/BGM.mp3`, volume 0.18 |
| `index.html:1859-1978` | Runtime oscillator synthesis, gain stages, compressor, silent buffer unlock |
| `ios/App/App/AppDelegate.swift:3-16` | Explicit playback session activation with mixing enabled |

No native audio player or custom audio plugin was found. No convolution, filter or runtime noise generator was present. All runtime synthesis, silent-buffer unlocking, gain stages, compressor and native session configuration have been removed.

Original sound call sites (line numbers before migration):

| Sound | Call sites in `index.html` | Replacement |
| --- | --- | --- |
| Swap | 2695 | `swap.wav` |
| Deny | 2686, 2721 | `deny.wav` |
| Match/chain | 2933 | `clear-0.wav` through `clear-5.wav` |
| Bell | 2743, 2771, 3139, 3564, 3679 | `bell.wav` |
| Bomb | 2750, 2772 | `bomb.wav` |
| Time bonus | 2811 | `time.wav` |
| Color clear | 2501, 2737, 2825 | `color.wav` |
| Stage clear | 3177 | `stage.wav` |
| Lose | 3220 | `lose.wav` |
| Horror notification | 3987 | `horror.wav` |
| Coin reward | 3192, 3499; synthesis at 3951-3957 | `coin-0.wav` through `coin-5.wav` |
| Countdown | 4436 | `tick-0.wav` through `tick-9.wav` |
| BGM start/resume | 1890, 1990, 1997, 3249, 3572, 3583, 3734 | Same single media element |
| BGM pause | 1889, 1984, 3238, 3692 | Pause BGM and stop short effects |
| BGM stop/reset | 3219, 3268 | Pause and seek to zero |

The old `audio()` gesture calls at 2693, 3237, 3248, 3267, 3359, 3429, 3504, 3517, 3570, 3581, 3591, 3596, 3600, 3602, 3611, 3616, 3631, 3635, 3639, 3643, 3660, 3661, 3687, 3704, 3705, 3707, 3713, 3720, 3732 and 3902 now only unlock HTML media playback.

## Playback and settings

All 31 effects are HTML audio elements, as in the reference implementation. No Web Audio anywhere. Three deviations from a literal copy of the reference exist, all aimed at the iOS stutter, which comes from doing pause, seek and play on the frame a sound has to start. The reference has four elements and fires them rarely; this game has 31 firing through chains.

1. `swap`, `deny` and `clear-0..5` get two voices each and are rewound in their `ended` handler, so a trigger only has to call `play()`. The seek still costs, but not on the frame that needs the sound. When both voices for a key are still sounding, the fallback restarts one, which is what produces the benign `AbortError` that `test:mobile` filters out.
2. Only those chain-rate effects use `preload="auto"`. The rest use `preload="none"` and load on first use, so iOS does not hold 31 prepared media pipelines.
3. At most three effects overlap and one key retriggers at most every 100 ms.

Effects are triggered from the game loop rather than from a tap. In browsers, pooled elements are started muted once on the first gesture, then paused and rewound. Completion restores the current sound setting, rather than a setting captured before the asynchronous play call. Native Capacitor skips this priming: its WKWebView configuration sets `mediaTypesRequiringUserActionForPlayback = []`, so starting 16 muted elements is unnecessary. BGM remains a single element and repeated requests reuse it without resetting its position. This reduces native startup contention; it does not establish the cause of silence in a particular TestFlight build. Device playback and screen recording still need verification.

Visibility, page-hide and the official Capacitor App state event stop effects and suspend BGM. Foreground recovery restores only requested BGM; short effects are discarded. Explicit game pause, title return and game over cancel BGM intent. Native inactivity still blocks playback if a browser focus event arrives first. Failed autoplay is caught and BGM can retry on a later gesture.

This game has one shared sound switch, not separate music/effects switches. The existing `ohanapon-muted` key, `1`/`0` values and UI remain unchanged. The reference game's preference schema is not imported. The added official `@capacitor/app` dependency observes lifecycle only; its Android back-button handler is disabled to preserve existing navigation.

| Audio | Element volume |
| --- | --- |
| BGM | 0.32 |
| Deny, horror | 0.30 |
| Countdown | 0.35 |
| Swap, lose, coins | 0.40 |
| Time, color clear | 0.45 |
| Match, bell, bomb, stage clear | 0.50 |

Every effect is normalized to a PCM peak of 0.50 by `scripts/generate-sfx.mjs`, with short edge fades; relative balance comes from the element volumes above. BGM uses a separate copy attenuated by 6.02 dB, measured decoded peak -6.6 dBFS. Original `Asset/BGM.mp3` is retained as source material.

Resulting levels, and the budget that keeps them safe:

| | Effective peak |
| --- | --- |
| Loudest effect (0.50 x 0.50) | 0.250, -12.0 dBFS |
| Quietest effect (0.50 x 0.30) | 0.150, -16.5 dBFS |
| BGM (0.467 x 0.32) | 0.149, -16.5 dBFS |
| BGM plus three simultaneous loudest effects | 0.899, below full scale |

`tests/audio.test.js` asserts all three: the file peak, a floor under the effective effect level, and the three-effect sum staying below clipping. Listening on an iPhone is still necessary to judge balance.

## Source and generation

Authoritative files: root `index.html`, `Asset/standard/audio/`, `scripts/generate-sfx.mjs`, `capacitor.config.json`, package manifests and native `AppDelegate.swift`.

Regenerate WAVs with `node scripts/generate-sfx.mjs`. This Node-only offline renderer preserves the previous pitches, timing and exponential envelopes; no synthesis runs in the game.

The attenuated BGM was made with FFmpeg 6.1.1:

```sh
ffmpeg -i Asset/BGM.mp3 -af volume=0.5 -codec:a libmp3lame -q:a 2 Asset/standard/audio/bgm.mp3
```

The committed audio assets require no FFmpeg dependency at runtime or during a normal build.

Run `npm ci`, `npm test`, then `npm run cap:sync`. The last command builds `dist` from root sources and copies it into both native projects, including `ios/App/App/public`. No generated web files are manually edited. Supply the normal Supabase build environment or `.env.local`; this checkout's previous generated connection values were preserved for the verification build. Generated directories are ignored for new files, so fresh checkouts must run the build/sync step.

## Verification

- `npm test`: 53 passing, including 14 audio tests covering the absence of Web Audio, file peaks and the clipping budget, the pool and preload split, gesture priming, a trigger costing only `play()`, the second voice, the retrigger window, the three-voice cap, stop handling, repeated BGM starts, mute and reload, lifecycle ordering, autoplay rejection, and the iOS audio session.
- `npm run cap:sync`: Web build and both native syncs succeed.
- All 32 audio assets are byte-identical in source, dist and both native outputs. The iOS HTML matches dist. A sync-after hook normalizes Windows path separators in Capacitor's generated Swift package manifest.
- The legacy standalone `node _test.js` fails at its existing CommonJS `require` under the repository's ES module mode. It is not part of `npm test`; the obsolete audio stub was removed but unrelated legacy test repair is outside this migration.
- No retired synthesis or custom native session path remains in game code.
- iOS compilation and physical recording are NOT verified on the Windows workstation. Capacitor sync is not an Xcode build.

On a Mac with Xcode, install dependencies and run the normal sync with the existing build environment, then:

```sh
xcodebuild -project ios/App/App.xcodeproj -scheme App -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
```

For a device install, select the existing signing team and iPhone target in Xcode and run the App scheme.

## iPhone recording checklist

### SE playback stutter follow-up

- Addressed inside the media-element design by pooling and rewinding after playback, so the seek leaves the frame that starts a sound. Note that the Web Audio build this was first attempted with never reached a device, so there is no measurement showing media elements cannot meet the target.
- Measured on the Windows workstation before the change: the synchronous JavaScript cost of a trigger was at most 0.4 ms in Chromium and 1 ms in WebKit, and render was p95 0.6 ms. Desktop Chrome held 60 fps with zero frames over 25 ms whether or not sound played, so the stutter never reproduced off-device. The cost was inside the platform media stack, which is why only the iPhone showed it.
- Mute, pause and background handling stop only live voices. Effect volumes, audio files, BGM volume and the saved sound setting are unchanged.
- `test:mobile` exercises real media playback events in Chromium and WebKit, not speaker quality or iPhone frame rate. It cannot substitute for a device check.
- Run `AUDIO_GAMEPLAY_TEST=1 npm run test:mobile` (PowerShell: `$env:AUDIO_GAMEPLAY_TEST='1'; npm run test:mobile`) to exercise BGM-only, SFX-only and combined playback with repeated swaps in Chromium and WebKit. This checks real media playback events, not physical speaker quality or iPhone frame rate.

Use the actual app in a debug build. In Safari Web Inspector for that app, install this temporary console-only playback filter before starting a game. It changes no source, UI or saved data; reloading removes it. The shared sound switch must be ON.

```js
window.recordingMode = "both";
window.recordingOriginalPlay ??= HTMLMediaElement.prototype.play;
window.recordingElements ??= new Set();
HTMLMediaElement.prototype.play = function () {
  window.recordingElements.add(this);
  const music = this.id === "bgm";
  if ((window.recordingMode === "bgm" && !music) ||
      (window.recordingMode === "sfx" && music)) {
    this.pause();
    return Promise.resolve();
  }
  return window.recordingOriginalPlay.call(this);
};
window.setRecordingMode = function (mode) {
  window.recordingMode = mode;
  for (const element of window.recordingElements) element.pause();
};
```

1. Call `setRecordingMode("bgm")`, then tap the game to retry BGM playback. Start Control Center screen recording with microphone OFF. Record at least 30 seconds, including opening and closing Control Center.
2. Repeat with `setRecordingMode("sfx")`. Exercise swaps, invalid moves, chains, all special pieces, coins, countdown, stage clear, defeat and the collaboration notification.
3. Repeat with `setRecordingMode("both")`, including rapid chains and coin rewards. Check for distortion, crackling, clipping and doubled music. Compare captured playback as well as live speaker output.
4. For each mode, leave the app, lock/unlock, return and pause/resume the game. BGM should resume from position only when gameplay requests it. Old short effects must not replay. Check title, shop, result and retry transitions.
5. Reload to remove the temporary filter. Turn sound OFF, background/restore and relaunch the app. Confirm silence and the saved OFF label. Turn ON and confirm recovery.
6. Check hardware silent-mode behavior. The native session override is back, deliberately: see the audio session decision below.

Record device model, iOS version, output route, app revision and the three resulting recordings with the test result. These device checks remain pending.

## Recording level (why the effects are not quiet)

Screen recordings were garbled through three completely different audio implementations: realtime oscillator synthesis, HTML audio elements, and Web Audio buffers. That ruled out the implementation, because all three measured within 1 dB of each other.

| Build | Effective effect output |
| --- | --- |
| Oscillator synthesis (0.18 x 0.55 x 0.42 x 0.82) | -29.3 dBFS |
| HTML audio elements (peak 0.08 x volume 0.40) | -29.9 dBFS |
| Web Audio buffers, briefly, never shipped to a device | -29.9 dBFS |
| `00010_CosmiiCannon` CannonShot (peak 1.00 x volume 0.80) | **-1.9 dBFS** |

The reference game, whose recordings are clean, is about 28 dB louder. iOS screen recording taps app audio before the hardware volume control, so raising the phone volume fixes the speaker but never the recording: a mix sitting at -30 dBFS is captured at -30 dBFS, needs roughly 30 dB of gain to hear back, and brings the recorder AAC and quantization noise up with it. That is the crackle.

The original 0.08 ceiling came from this migration and was aimed at avoiding clipping. The aim was right and the margin was about 20 dB too generous. Do not lower these levels to buy headroom without re-checking a recording.

## Audio session decision (iOS)

`AppDelegate` sets no `AVAudioSession` category at all. WKWebView manages the session itself and must be left to do so. Each row below was observed on device, one change at a time.

| AppDelegate | Ring/silent switch | Control Center screen recording |
| --- | --- | --- |
| `.playback` + `.mixWithOthers` | Game stays audible | Captures **no app audio at all** |
| `.playback`, no options | Game stays audible | Captures **garbled audio**, BGM and effects alike |
| No override (current) | **Game is muted** | Expected clean; pending device check |

What settled it: the garbling affected BGM as well. BGM is a plain HTML audio element and never touches Web Audio, so the effect path could not explain it and the session was the only cause the two could share. Summing was ruled out by arithmetic as well - BGM peaks at 0.093 after its element volume, each effect at 0.040, so BGM plus four simultaneous effects reaches 0.253 against a 1.0 ceiling.

The brief banned Web Audio because recordings were garbled. On this evidence the ban and the clean-recording goal are separable: the garbling tracked the output level, not the API. The implementation is back on media elements per the brief regardless, since nothing measured justified deviating from it.

Constraints for anyone changing this:

- Do not add an `AVAudioSession` override without re-running the recording checklist. `tests/audio.test.js` asserts the override is absent, ignoring comments.
- `.mixWithOthers` is the worst case: it marks the audio non-primary and the recorder captures nothing.
- Do not switch to an ambient category to stop background audio. Backgrounding is already handled in JavaScript through the Capacitor App `appStateChange` listener.
- The ring/silent switch muting the game is the accepted cost of recordable audio. Revisit only with a product requirement, and re-test recording if you do.

Pending on device: confirm a Control Center recording now contains clean BGM and effects.
