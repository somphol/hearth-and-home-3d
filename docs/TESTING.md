# Testing

This file separates what was **actually executed** from what was only read from source. It is intentionally conservative: a test that was not run is marked as such, even when the code path looks correct.

## 1. What runs today

These commands were run for the documentation release (Node 26.13.0, macOS):

| Command | Result |
| --- | --- |
| `node --check script.js` | Pass; no output, exit 0 |
| `node scripts/check.mjs` | Pass; prints `OK <n> checks`, exit 0 |
| `python3 -m http.server 8080` + `curl -I` for `/`, `/style.css`, `/script.js` | Pass; all 200 |
| `curl -sI https://somphol.github.io/hearth-and-home-3d/` | Pass; HTTP 200, `cache-control: max-age=600` |
| `node ~/.config/opencode/skills/skill-publish/scripts/check-skill.mjs skills/hearth-and-home-3d` | Pass (see the run log in the release report) |

`node scripts/check.mjs` is dependency-free and checks:

1. Required release files exist: `index.html`, `style.css`, `script.js`, `README.md`, `AGENTS.md`, the four docs, and the skill tree.
2. Every local `src` / `href` in `index.html` resolves to a real file (http(s), `data:`, `#`, `mailto:` and protocol-relative URLs are ignored).
3. Every relative Markdown link/image in `README.md`, `AGENTS.md` and `docs/*.md` resolves, including links inside the skill.
4. `node --check` passes for every `.js`/`.mjs` file in the repo.
5. Every JSON file parses.
6. The three skill template files are byte-identical to the release sources.

It does **not** run a browser, test WebGL, listen to audio, or prove visual correctness.

## 2. Browser tests actually run during the original build

Environment: Google Chrome `--headless=new` with SwiftShader WebGL (`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`), driven over the DevTools Protocol from temporary scripts outside the repository. Desktop 1440×900, mobile emulation 390×844. These were run on 2026-11-01 against localhost and the live Pages URL; they are **not** re-run by `scripts/check.mjs`.

| Check | Result | Evidence |
| --- | --- | --- |
| Page boots, one canvas, loader cleared | Pass | `canvases: 1`, loader `display: none`; later `loader: "none"` |
| No uncaught JS exceptions on load | Pass | CDP `Runtime.exceptionThrown` empty; final `errors: none` |
| Fireplace renders with visible fire | Pass after tuning | Screenshots `final-fireplace.png`, `new-fireplace.png`; earlier "washed out / hidden behind logs" was fixed |
| Ocean scene renders, boat/lighthouse/water | Pass | `final-ocean.png`, `new-ocean.png` |
| Sky scene renders, islands/balloon | Pass | `final-sky.png`, `new-sky.png` |
| Scene buttons switch world and UI | Pass | `scene: ocean`, `scene: sky`; active button and hint updated |
| Scene-switch fade clears | Pass | `fadeClass: "scene-fade"`, `fadeOpacity: "0"` |
| Minimal/distraction-free mode | Pass | `HearthHome3D.toggleMinimal()`, `final-minimal.png` |
| Sound starts on gesture | Pass | cold load `suspended` + label `Tap to hear`; after pointerdown `running`, label `Sound On` |
| Mute / unmute | Pass | master gain 0 and back; label `Sound Off` / `Sound On` |
| Layer toggles and gains | Pass | Fire→fireBus .7, Room→room 1; Rain gain follows chip; per-scene mixes |
| Per-scene mix persistence | Pass | stored layer booleans and restored gains after reload |
| Sound preference migration | Pass | old payload without `soundSchema` → `soundOn: true`, schema 2 |
| Volume sliders | Pass | fire 0.35 / 0.22, ambience .66, master .55 reflected in settings and UI |
| Timer start/pause and duration change | Pass | running, pause, 30-min setting applied; clock updated |
| Focus completion | Pass (accelerated) | Timer forced to 1.2 s; exactly one focus entry, break mode next |
| Session stats and streak | Pass | after import: today `5m`, total `0.2h`, streak 2, session count 3 |
| JSON export | Pass | Captured Blob contained version 1.1.0, layers and volumes |
| JSON import | Pass | 2 new sessions added, duplicate prevention by id, settings/volumes applied, toast reported 2 |
| Re-import dedupe | Reasoned from `existing` set in `importSessionData`; not separately printed | Source review |
| Mobile 390×844 layout | Pass with caveat | `docScroll 390×844`; `.layout` scroll 1076 vs client 722 (intentional internal scroll); only `.grain` reported as oversized |
| Live Pages load and version | Pass | `version 1.1.0`, `soundOn true`, label `Tap to hear`, loader none, `errors none` |
| Orbit drag / pinch / wheel as a human gesture | Not verified | Camera was moved programmatically; no synthetic drag test |
| Keyboard shortcuts (`Space`, `H`, `M`, `R`, `1/2/3`, `Esc`) | Not verified | Listeners read in source; not exercised via key events |
| Running-timer restore after refresh | Not verified | Code path reviewed (`savedTimerState`, `endAt` window); no dedicated reload assertion in the transcript |
| Safari / Firefox / iOS / Android | Not verified | Only Chrome tested |
| Screen reader / focus order | Not verified | Semantic controls exist; no assistive-tech pass |
| Audio spectral quality / loudness | Not verified | Listened qualitatively during build; no measurement |

The GPU stall / `ReadPixels` warnings seen in headless SwiftShader are a driver-level noise source, not app exceptions. The app's own error log was clean.

## 3. Manual matrix

Use this when changing behaviour. Status is the current honest state.

### Desktop

| Test | Steps | Expected | Status |
| --- | --- | --- | --- |
| Cold load | Serve, open `/` in Chrome | Loader clears, fireplace visible, no console errors | Pass (headless) |
| Scene switch | Click Ocean, then Sky, then Fireplace | Fade, camera tween, hint text changes, active button updates | Pass (headless) |
| Orbit | Drag across the canvas | Camera orbits within limits; no wall clipping | Not verified |
| Zoom | Wheel / pinch | Distance clamps at 4/8.6 (fireplace), 6/42 (ocean), 10/58 (sky) | Not verified as gesture |
| Focus mode | Press `H`, then `Esc` | Panels fade, mini HUD appears, `Esc` restores | Partial: button/toggle tested, keys not |
| Timer | Space or Begin focus; wait; Pause; Reset | Ring drains, title counts down, pause freezes, reset restores full block | Partial: click start/pause tested; `Space` not |
| Completion | Run a 1-minute focus block | One session logged, chime, break starts after ~1.6 s | Partial: accelerated 1.2 s completion passed |
| Refresh during block | Start, reload, wait | Same remaining time, "The hearth kept your place" toast | Not verified |
| Export | Click Save Study Session | `fireplace_sanctuary_log.json` downloads with profile/settings | Pass (Blob inspected) |
| Import | Click Load, pick a valid log | Sessions merge by id; toast reports added count | Pass |
| Invalid import | Pick a non-JSON file | Error toast, no crash | Not verified |
| Fullscreen/short window | Resize to 1440×700 | Quote hides, ring shrinks, panels fit | Reasoned from CSS; not screenshotted |

### Mobile 390×844

| Test | Steps | Expected | Status |
| --- | --- | --- | --- |
| Layout | Load at 390×844 | Single column, internal `.layout` scroll, scene switch at bottom | Pass (headless metrics + screenshots) |
| Horizontal scroll | Swipe sideways | No document-level horizontal scroll | Pass (docScroll width 390); `.grain` is oversized by design |
| Bottom controls | Scroll to bottom | Save/Load reachable above the scene switcher | Pass (screenshot) |
| Touch orbit | One-finger drag | Orbit without page scroll on canvas | Not verified |
| Audio on mobile | Tap once | `Tap to hear` → `Sound On`; no clipped/blocked context | Not verified on a real device |

### Persistence

| Test | Expected | Status |
| --- | --- | --- |
| Settings survive reload | Scene, volumes, focus/break, layers, sound preference | Pass (headless reload) |
| Mute survives reload | `soundOn: false`, schema 2, label `Sound Off`, no context created | Pass (headless) |
| Old payload migration | Missing schema → sound on once | Pass (headless) |
| Stats recomputed from history | `totalFocusSeconds` = sum of focus durations, not stored total | Pass (import recomputed 601 s from 1 + 2×300 s) |
| History cap | At most 1200 entries | Reasoned from `slice(-1200)`; not load-tested |
| Corrupt storage | Warning, app continues in memory | Reasoned from `try/catch`; not injected |

### Audio

| Test | Expected | Status |
| --- | --- | --- |
| First gesture starts | Context `running`, label `Sound On` | Pass (headless) |
| Mute | Master gain 0, persisted | Pass (headless) |
| Layer mix | Fire→Crackle, Room/Waves/Wind/Rain→Ambience | Pass (gain inspection) |
| Scene mix | Each scene restores its own layer booleans | Pass (headless) |
| Completion chime | Focus arpeggio / break triad | Pass only in the sense that `chime()` ran; not auditioned in automation |
| Rain layer | Droplets audible above the bed | Heard during build; no measurement |

## 4. Static checks and what they cannot see

`scripts/check.mjs` is deliberately dependency-free and fast. It catches broken paths, broken docs links, syntax errors, malformed JSON, and skill-template drift. It cannot catch:

- WebGL shader compile failures or visual regressions.
- Audio graph mistakes that still parse.
- Layout breakage at a new viewport.
- A timer that is logically wrong but syntactically valid.
- A copied template that is byte-identical but semantically stale.

For those, run the manual matrix and, if possible, a headless browser pass with screenshots at 1440×900 and 390×844.

## 5. Known gaps

- No browser automation is committed; the original CDP harness lived in `/tmp` and was intentionally not added to the repo.
- Safari, Firefox, iOS and Android are untested. The app uses standard WebGL, Canvas 2D, Web Audio, `localStorage` and `FileReader`; those are expected to work, but expectation is not verification.
- Keyboard shortcuts, orbit gestures, timer restore, invalid-import handling and history-cap behaviour are reasoned from source, not exercised in this pass.
- Audio was tuned by ear. No LUFS, spectral or clipping measurement exists.
- Reduced motion is CSS-only; 3D animation continues.
- Mobile verification used device emulation, not a physical phone; touch, safe-area and audio behaviour may differ.
- `localStorage` on `file://` is browser-profile-specific and can be blocked; the app degrades to in-memory state with a console warning, but that path was not forced in a test.
- Pages deployment settings are inferred from the managed workflow and `.nojekyll`, not read from an authenticated settings API.
