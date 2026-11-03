# Reproduction book

This is the rebuild and verification book for **Hearth & Home 3D v1.1.0**. Read it with [ARCHITECTURE](ARCHITECTURE.md), [TESTING](TESTING.md) and [DEPLOYMENT](DEPLOYMENT.md).

> **If the three source files exist, they are the source of truth.** Do not rewrite the app from this book for style reasons. Use it to understand, verify, extend, or reconstruct. Documentation commits do not change app behaviour.

## 1. Scope

Build one static page that renders three cozy environments and a focus ritual:

- **Environments:** Cozy Fireplace (night study room with a stone hearth), Ocean Drift (sunset sea, sailboat, lighthouse), Sky Soar (floating islands, hot-air balloon, cloud sea).
- **3D:** Three.js r128 via CDN plus `OrbitControls`; procedural geometry and Canvas textures; no model or image assets.
- **Fire:** GPU flame, ember, smoke and dust particles; flickering shadow-casting point light; animated ember bed and candles.
- **Audio:** Web Audio synthesis only. Five layers (Fire, Room, Waves, Wind, Rain), three shared volume sliders, per-scene layer mixes, scheduled crackles/waves/rain, and a completion chime.
- **Focus ritual:** Pomodoro with 1–120 min focus, 1–45 min break, auto-start break, pause/resume/reset/skip, progress ring, title countdown, restore after refresh.
- **Data:** `localStorage` stats/settings/timer; download `fireplace_sanctuary_log.json`; deduplicated import.
- **UI:** warm cabin glassmorphism, scene switcher, distraction-free mode (`H`), responsive panel stack, toasts, rotating quotes.
- **Languages:** English-only interface. No i18n layer and no language toggle. Do not add one unless the product changes.
- **Delivery:** `index.html`, `style.css`, `script.js`, GitHub Pages at the repository root. No build, no package manager, no backend.
- **Release:** `APP.version = "1.1.0"`; log `version` 1.1.0; storage schema `hearthHome3D.v1` with `soundSchema: 2`.

It is **not** a game engine, not an offline-first app (CDNs and fonts require network), not a multi-user service, and not a Pomodoro account system. It does not include recorded media, analytics, or a 3D object-picking layer.

## 2. Requirements matrix

| # | Requirement | Implementation | Where |
| --- | --- | --- | --- |
| 1 | Stone hearth and mantel | Hearth slab, pillars, lintel, mantel, chimney breast, 14 decorative stones | `buildFireplaceWorld` in `script.js` |
| 2 | Stacked wooden logs | Four cylinders with glow ends and char material | `buildFireplaceWorld` |
| 3 | Rising flame particles in orange/yellow/red | 320-point `createParticles` flame + 110-point body, five-stop colour ramps | `createParticles`, `buildFireplaceWorld` |
| 4 | Swirling and fading | `swirl`, `fadeIn`/`fadeOut`, `sizeMode: 'flame'` | `createParticles` |
| 5 | Flickering amber light with shadows | `fireLight` point light, animated intensity/position, 1024² shadow map | `buildFireplaceWorld.update` |
| 6 | Three-scene switcher | Top-bar buttons, keyboard `1/2/3`, `switchScene`, 420 ms fade, 1.5 s camera tween | `index.html`, `switchScene`, `applyWorld` |
| 7 | Ocean world | Custom wave shader, boat buoyancy, lighthouse, clouds, birds | `buildOceanWorld` |
| 8 | Sky world | Six islands, balloon, cloud sea, fireflies, birds, waterfall | `buildSkyWorld`, `makeIsland` |
| 9 | Procedural fire sound | Pink/brown noise beds + rumble + 0.13 Hz breathing LFO | `SoundEngine.prototype.start` |
| 10 | Random crackles/pops | Scheduled 70–620 ms highpass bursts, 8% deep pops, stereo pan | `scheduleCrackles`, `playCrackle` |
| 11 | Low-frequency hearth rumble | 44 Hz sine + 67 Hz triangle | `SoundEngine.prototype.start` |
| 12 | Volume mixer | Crackle, Ambience, Master sliders (0–100 %) | `index.html`, `bindVolume`, `applyVolumes` |
| 13 | Five selectable layers | Fire/Room/Waves/Wind/Rain chips | `.layer-chip`, `toggleLayer`, `applyLayers` |
| 14 | Per-scene mixes | `settings.layers[scene]`, defaults per world | `DEFAULT_LAYERS`, `normalizeLayers`, `updateLayerUI` |
| 15 | Sound on by default | `DEFAULT_SETTINGS.soundOn = true`; boot auto-start at 650 ms; gesture wake | `boot`, `autoStartSound`, `wakeSound` |
| 16 | 25/5 Pomodoro | `focusMinutes` 25, `breakMinutes` 5, adjustable | `DEFAULT_SETTINGS`, `focusMs`, `breakMs` |
| 17 | Accurate countdown | `endAt` timestamps + 250 ms poll | `startTimer`, `tickTimer` |
| 18 | Auto-start break | 1600 ms delay after a completed focus block | `completePhase` |
| 19 | Progress ring | `RING_CIRCUMFERENCE = 2π·86`; stroke-dashoffset | `renderTimer`, `style.css` |
| 20 | Session stats and streak | Recompute from history; local-day streak | `updateStats` |
| 21 | Restore running timer | `snapshotTimer` + valid `endAt` check | `persistNow`, `initTimer` |
| 22 | localStorage persistence | Settings, profile, timer under `hearthHome3D.v1` | `loadLocal`, `persistNow` |
| 23 | JSON export | Blob download `fireplace_sanctuary_log.json` | `downloadSessionLog` |
| 24 | JSON import and merge | Validate, dedupe by `id`, sort, cap 1200 | `handleSessionFile`, `importSessionData` |
| 25 | Distraction-free mode | `body.minimal`, minimal HUD, `H`/`Esc` | `toggleMinimal`, `style.css` |
| 26 | Warm cabin UI | CSS variables, glass panels, Fraunces/Inter, grain/vignette | `style.css`, `index.html` |
| 27 | Responsive layout | Breakpoints 1180/960/560 px and short-window rules | `style.css` |
| 28 | Keyboard shortcuts | Space, H, M, R, 1/2/3, Esc | `bindUI` |
| 29 | Local-only/privacy | No fetch/XHR/WebSocket, exports via Blob | `script.js` |
| 30 | Pages delivery | Root of `main`, `.nojekyll` | repo |

Late requirements that became product behaviour:

- **Automatic sound plus user-selectable layers** (user request after v1.0.0). Implemented as the five-layer mixer, not as five separate fixed scenes.
- **User volume control** (same request). Implemented as three shared sliders, with Fire governed by Crackle and Room/Waves/Wind/Rain by Ambience.
- **Sound enabled by default** (explicit user diagnosis). A one-time `soundSchema < 2` migration flips returning visitors to `soundOn: true` while preserving later explicit mutes.

## 3. Non-negotiable constraints

| Constraint | Why | How it is enforced or preserved |
| --- | --- | --- |
| Three source files, no build | Simple Pages deployment; editable in place | No package.json, bundler or generated CSS |
| Three.js r128 + matching OrbitControls | Shader/encoding/API compatibility | CDN URLs pinned in `index.html` |
| No recorded audio or image assets | Originality, size, offline-ish ethos | All textures Canvas-generated; all sound synthesized |
| Fixed authored scenes | Camera framing and light positions were composed together | No random room generation except cosmetic details |
| No 3D picking | The canvas is a camera surface; all controls are DOM | No `Raycaster` in `script.js` |
| Fixed time-of-day per scene | Each environment is a composed mood | No clock-driven sun or lighting control |
| Timer is timestamp-based | Background-tab throttling must not stretch blocks | `endAt`, not decrementing counter |
| Skipped phases never count | Statistics must represent real focus | `completePhase('skip')` bypasses history |
| Mutes persist after migration | Respect explicit user intent | `soundSchema: 2` and `soundOn` check |
| Export/import has no backend | Privacy and portability | Blob download + `FileReader` |
| No secrets or personal data in the app | Public repository | No credentials, accounts or analytics |
| Docs and static check ship together | Maintainability | `AGENTS.md`, `docs/`, `scripts/check.mjs` |

## 4. Reference environment

| Item | Value |
| --- | --- |
| OS used for build | macOS (Apple Silicon) |
| Browser used for interaction checks | Google Chrome headless, `--headless=new`, SwiftShader WebGL |
| Desktop viewport | 1440×900 |
| Mobile viewport | 390×844 |
| Node.js | 26.13.0 local |
| Python | 3.x, only `python3 -m http.server` |
| Package installs | none |
| CI | none in this repository; the GitHub-managed `pages-build-deployment` workflow publishes the branch |

The app itself needs a modern browser with WebGL and Web Audio. It does **not** need Node; Node is only for local checks.

## 5. Repository map

| Path | Role |
| --- | --- |
| `index.html` | 281-line shell: canvas, top bar, timer panel, mixer, log panel, quote, hints, minimal HUD, toasts, loader, CDN tags |
| `style.css` | 915-line design system and responsive layout |
| `script.js` | 3768-line IIFE: helpers, persistence, textures, particles, worlds, renderer, audio, timer, UI, boot |
| `scripts/check.mjs` | Dependency-free release checks |
| `docs/` | Architecture, reproduction, testing, deployment, social card |
| `skills/hearth-and-home-3d/` | Reusable build skill; template copies must stay byte-identical |
| `preview-*.jpg` | README screenshots captured from the running app |
| `docs/social-card.png` | 1200×630 Open Graph/Twitter image |
| `SESSION_STATE.json` | Historical build time/token/deployment record; not loaded by the app |
| `.nojekyll` | Empty file; disables Jekyll processing on Pages |
| `sitemap.xml`, `robots.txt` | Pages discovery metadata |

## 6. Build from empty directory

Each stage ends with an acceptance check. Do not skip ahead; the later stages assume the DOM IDs and constants exist.

### Stage 0 — Scaffold

```bash
mkdir -p ~/Projects/hearth-and-home-3d/{docs,scripts,skills/hearth-and-home-3d/{assets/template,references}}
cd ~/Projects/hearth-and-home-3d
git init -b main
touch .nojekyll
```

Add an MIT `LICENSE`, `.gitignore` (`.DS_Store`, `*.log`, `node_modules/`), and `README.md`.

**Accept:** `ls` shows the three source filenames you are about to create and `.nojekyll` is zero bytes.

### Stage 1 — HTML shell

Create `index.html` with these required IDs/classes, in this order: `#scene-canvas`, `.vignette`, `.grain`, `#scene-fade`, `.topbar`, `.scene-switch` with three `.scene-btn[data-scene]`, `#sound-toggle`, `#ui-toggle`, `.layout`, `#timer-heading`, `#session-pill`/`#session-count`, `.timer-ring` with `#ring-progress`, `#timer-mode`, `#timer-time`, `#timer-note`, `#timer-start`/`#start-label`, `#timer-reset`, `#timer-skip`, `#focus-minutes`, `#break-minutes`, `#stat-today`, `#stat-total`, `#stat-streak`, `#audio-heading`, `#audio-power`, five `.layer-chip[data-layer]` (`fire`, `room`, `ocean`, `wind`, `rain`), `#layer-mix`, `#fire-volume`/`#fire-volume-out`, `#ambience-volume`/`#ambience-volume-out`, `#master-volume`/`#master-volume-out`, `#save-session`, `#load-session`, `#session-file`, `#last-saved`, `#quote-card`/`#quote-text`/`#quote-source`, `.hint-bar`, `#scene-hint`, `#minimal-hud`/`#mini-timer`/`#mini-play`/`#mini-sound`/`#mini-exit`, `#toast-stack`, `#loader`/`#loader-sub`, `<noscript>`.

Load order at the end of `<body>`:

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
<script src="script.js"></script>
```

**Accept:** every ID above exists exactly once; `node scripts/check.mjs` (added later) resolves the two local files.

### Stage 2 — CSS system

Define the `:root` tokens from `style.css` (`--amber #f3bc76`, `--ember #e86524`, `--bg #120b07`, panel/line/radius/serif/sans/ease). Build the fixed full-screen canvas, atmosphere overlays, top bar, desktop layout (`inset: 88px 26px 46px`, timer `372px`, side stack `344px`), glass panels, ring, stats, mixer, quote, hints, minimal HUD, toasts, loader, and breakpoints at 1180/960/560 px. Add `prefers-reduced-motion` and print rules.

**Accept:** at 1440×900 the timer is bottom-left and the mixer/log stack bottom-right; at 390×844 the panels form one scrollable column and the scene switcher sits at the bottom.

### Stage 3 — Constants, persistence, textures

Implement `APP`, `STORAGE_KEY`, `LOW_POWER`, `DPR`, `DEFAULT_SETTINGS`, `DEFAULT_LAYERS`, `safeNumber`, `normalizeLayers`, `loadLocal`, `isValidHistoryEntry`, `persistNow`, `snapshotTimer`. Then `makeCanvas`, `makeTexture`, `getTextures` and every `*Draw` function.

**Accept:** booting with no storage creates a profile with `createdAt`; a payload round-trips through `localStorage`; no `TextureLoader` or image URL appears.

### Stage 4 — Particle engine

Implement `PARTICLE_VERTEX`, `PARTICLE_FRAGMENT`, `createParticles` (typed attributes, colour stops, spawn/age, fade, size modes, gravity, swirl, flicker), `createDust`, `createBirds`, `createFireflies`.

**Accept:** a test Points object renders and animates; the fire configuration uses count 320 and a five-stop ramp `0xffe9a8 → 0xffb84a → 0xff7a1a → 0xe23a0e → 0x5a0e00`.

### Stage 5 — Worlds

Implement `buildFireplaceWorld` first (shell, hearth, logs, particles, props, lights, `update`), then `buildOceanWorld` (sky dome, water shader, boat, lighthouse, clouds), then `buildSkyWorld` (`makeIsland`, balloon, cloud sea, birds, fireflies). Return the world contract:

```js
{ name, scene, position, target, exposure, limits, update, clampCameraY? }
```

**Accept:** each world renders alone with its authored camera; the fireplace fire is visibly in front of the logs, not swallowed by them.

### Stage 6 — Renderer and switching

Implement `installOrbitFallback`, `initThree`, `onResize`, `applyWorld`, `switchScene`, `updateSceneUI`, `animate`. Build all worlds once; never rebuild on switch.

**Accept:** `1/2/3` and the buttons switch with a fade and a 1.5 s camera move; orbit clamps match `limits`; resize keeps aspect; no console exceptions.

### Stage 7 — Audio

Implement `SoundEngine` in this order: constructor, `activeLayers`, `makeNoise`, `makeCrackleBuffer`, `start` (master → compressor → buses; fire bed; four ambience layers), `applyLayers`, `setScene`, `setLayer`, `applyVolumes`, `setEnabled`, `syncSchedulers`, `scheduleCrackles`/`playCrackle`, `scheduleOcean`/`playWave`, `scheduleRain`/`playRainDrop`, `chime`. Instantiate `const sound = new SoundEngine()`.

**Accept:** with a user gesture, `ctx.state === 'running'`; Fire gain follows `fireVolume`; Wave/Wind/Rain gains follow their chips; mute sets master gain to 0; export includes `layers`.

### Stage 8 — Timer and stats

Implement `focusMs`, `breakMs`, `initTimer`, ticker, start/pause/reset/skip, `completePhase`, `flashTitle`, `renderTimer`, `updateStats`, `applyDurationSettings`. Use `endAt` and `profile.history` as described in [ARCHITECTURE](ARCHITECTURE.md).

**Accept:** a 1-minute focus block completes into a break, appends exactly one entry, increments sessions and total; skipping does not; refresh during a running block resumes with the correct remaining time.

### Stage 9 — UI wiring and transfer

Implement `QUOTES`, `rotateQuote`, `toast`, `setRangeFill`, sound/mixer UI, `enableSound`, `toggleSound`, `toggleLayer`, `autoStartSound`, `wakeSound`, `updateVolumeUI`, `toggleMinimal`, `updateLastSaved`, `downloadSessionLog`, `handleSessionFile`, `importSessionData`, `syncSettingsToUI`, `bindUI`, `initQuotes`.

**Accept:** every control has a listener; keyboard shortcuts work outside inputs; export downloads valid JSON; re-importing the same file adds zero sessions.

### Stage 10 — Boot and API

Implement `hideLoader`, `boot`, the `readyState` guard, and `window.HearthHome3D` with the getters listed in [ARCHITECTURE](ARCHITECTURE.md).

**Accept:** first load hides the loader, the saved scene is restored, and console access to `HearthHome3D.scene` matches the active world.

### Stage 11 — Release material

Add preview images, social card, `README.md`, `AGENTS.md`, `docs/`, `scripts/check.mjs`, and the skill with byte-identical template copies.

**Accept:** `node scripts/check.mjs` prints `OK <n> checks`; the template files compare equal to the release sources.

## 7. Where the non-obvious numbers came from

None of these are physical measurements. They are composition and tuning choices, mostly iterated against headless screenshots.

| Number | Origin / rationale |
| --- | --- |
| Room `22 × 18`, walls 9, ceiling 7 | Large enough for the camera's 46° cone at 4–8.6 units, while the back wall at `z -6.6` frames the hearth tightly |
| Camera `46°`, `near 0.1`, `far 500` | Wide enough to show the hearth + chair; far plane covers the 300-unit sky domes and 700-unit water |
| Fireplace camera `(0.45, 2.95, 6.2)` → `(0, 2.0, -2.45)` | Slight right offset avoids a symmetrical postcard view; target sits above the firebox opening |
| Distance `4..8.6`, polar `1.0..1.62`, azimuth `±0.95` | Keeps the camera inside the room and above the rug; prevents seeing through walls |
| Hearth at `z -5.0`, back wall `-6.6` | 1.6 units of chimney depth, so the breast reads in front of the wall |
| Fire light `(0, 1.35, -4.05)`, distance 22 | Just in front of the logs; warm falloff reaches the chair and rug without blowing out stone |
| Fire particle counts 320/110/72/32 | Enough density for a 2.1-unit-wide fire at 60 fps; reduced 32% on low power |
| Particle `uScale = 300 * DPR` | Point sizes were tuned so a 0.28–0.62 size reads as flame at the default camera distance |
| Ring radius 86 in a 200 viewBox | Leaves room for the glow filter without clipping |
| 420 ms scene fade / 1.5 s camera tween | Mask the swap, then let the eye settle; reduced motion cuts the fade to 60 ms |
| 650 ms sound start delay / 700 ms loader | Avoids competing with first paint; loader clears once the first frames are ready |
| 250 ms timer poll | Smooth seconds without a per-frame timer; `endAt` keeps accuracy |
| 1600 ms auto-break delay | Lets the completion chime and toast land before the next block starts |
| 350 ms persist debounce / 12 s running save | Coalesces slider drags while keeping crash loss small |
| Crackle interval 70–620 ms, 8% deep pops | Sparse enough to feel organic; the low pop adds body without becoming a metronome |
| Wave interval 6.2–12.5 s | Slow swell instead of a loop; the 0.085 Hz LFO inside the layer adds continuous motion |
| Rain drop interval 55–280 ms | Dense patter at low gain; highpass 1600–5200 Hz keeps it above the fire bed |
| Chime C5–C6 / G4–D5 | Consonant major arpeggios that sit above the noise beds |
| Palette `#f3bc76`, `#e86524`, `#120b07` | Amber/ember on near-black brown; chosen for candlelit contrast, not sampled from a photo |
| Quote rotation 24 s, grain 9 s steps | Slow enough to be ambient, fast enough to notice on a long focus block |

The fireplace detail (books, embers, leaves, stones) uses `Math.random()` at construction, so it varies between loads. That is cosmetic only; no layout, collision or game state depends on it.

## 8. Verification procedure

From the repository root:

```bash
node --check script.js
node scripts/check.mjs
python3 -m http.server 8080
```

Expected:

- `node --check script.js` prints nothing and exits 0.
- `node scripts/check.mjs` prints one `OK <n> checks` line and exits 0. Current `n` is reported by the run, not hard-coded here.
- `http://localhost:8080/` returns the page with status 200; `style.css` and `script.js` return 200.
- With network access, the loader clears and the fireplace renders; the console has no uncaught exceptions.
- Sound: cold load shows **Tap to hear** in Chrome; one click/keypress changes it to **Sound On** and the fire bed is audible at the stored volume.
- Scene buttons change the world and the hint text; the URL does not change.
- Timer: set Focus to 1 minute, run it, confirm one session is logged, break mode starts after ~1.6 s, and a refresh during a running block restores the remaining time.
- Export: download the log, re-import it, and confirm the toast reports no new sessions.
- Mobile 390×844: the panel column scrolls internally; the scene switcher is reachable at the bottom; no horizontal document scroll.

The detailed manual matrix and the limits of what was actually tested are in [TESTING](TESTING.md). Do not copy a "verified" claim from this book without running the check.

## 9. What was tried and rejected

From the original build session:

- **Sound off by default.** The first release shipped `soundOn: false` and an explicit Enable Sound button. The user rejected this as the main reason the experience felt silent. v1.1.0 flipped the default, added a one-time schema migration, and kept a gesture fallback for autoplay policy. Do not reintroduce an off-by-default gate.
- **Fixed per-scene crossfade.** The first audio design crossfaded one fixed mix per scene (`room` only in fireplace, `ocean` in ocean, `wind` in sky). The user asked for selectable sounds, so this was replaced by five independent layer buses with per-scene boolean mixes. The old fixed-crossfade approach would regress the mixer.
- **Flames present but not visible / washed out.** The first render showed the room but no readable fire; a CDP inspection confirmed the Points objects existed. Tuning the particle scale/placement and the lighting/exposure was required before the fire read in front of the logs. If you change `uScale`, particle sizes, or the fire-light intensity, re-check the fire visually rather than trusting the object count.
- **Duplicate `backPanel` declaration.** Adding firebox panels introduced `SyntaxError: Identifier 'backPanel' has already been declared`; the page stayed on the loader. The duplicate was removed and `node --check`/`new Function` was added to the loop. This is why syntax checking is part of release verification.
- **Pages deployment race.** A second Pages deployment was requested while the previous one was still in progress, producing `Deployment request failed ... due to in progress deployment`. The deployment eventually succeeded without a force-push. Do not hammer the Pages API; push once and let the workflow finish.
- **Mobile overflow detector noise.** At 390×844 the document width stayed 390 while `.layout` scrolled internally; the only "overflow" report was the decorative `.grain` layer at `inset: -50%`. Treat that as expected, not a bug, and do not remove the grain to satisfy a naive detector.

## 10. Deviations and unfinished parts

- **Sound is not guaranteed audible on load.** The code requests it, but browser autoplay policy can keep the context suspended. The UI is deliberately honest (`Tap to hear`).
- **No CI workflow is committed.** Pages uses GitHub's managed deployment. Static checks are local/manual.
- **No automated browser test suite.** The original CDP harness was temporary (outside the repo); only static checks are reproducible from the repository.
- **Browser coverage is Chrome-heavy.** Safari/Firefox/iOS were not formally tested.
- **Reduced motion does not stop the 3D animation.** CSS animations and loader/fade timings respond to the preference; particles and worlds keep running.
- **No loudness normalisation.** Layer and master gains are design values, not measured LUFS.
- **The app requires network for Three.js and fonts.** It is not an offline bundle; the README says so.
- **`SESSION_STATE.json` includes local build metadata.** It is historical and must not become runtime input.
