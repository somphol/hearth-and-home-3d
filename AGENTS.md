# AGENTS.md — Hearth & Home 3D

> **Start here for handoff:** [docs/REPRODUCTION.md](docs/REPRODUCTION.md) is the rebuild and verification book. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) is the module map. [docs/TESTING.md](docs/TESTING.md) separates what was actually run from what was only reasoned about. [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) covers GitHub Pages operations.

## 1. What this is

A static, single-page 3D "cozy study sanctuary": a procedural fireplace room, an ocean sunset and a floating-island sky, each with orbiting camera framing, animated props, a particle fire, and a synthesized Web Audio soundscape. A Pomodoro timer, local statistics, per-scene sound mixes, JSON export/import and a distraction-free mode sit on top.

It produces one HTML page from three source files. It is **not** a game, not a WebGL engine, not an offline app (Three.js and Google Fonts load from CDNs), not a server product and not a Pomodoro SaaS. Current release: **v1.1.0**.

Live copy: <https://somphol.github.io/hearth-and-home-3d/>
Local master: `~/Projects/hearth-and-home-3d`

## 2. Commands

There is no install, package manager or build step.

```bash
# run
cd ~/Projects/hearth-and-home-3d
python3 -m http.server 8080          # http://localhost:8080
# opening index.html directly also works, but CDN + font access still needs the network

# verify
node --check script.js
node scripts/check.mjs               # static release checks, dependency-free

# deploy = push to main; GitHub Pages publishes the repository root
git push origin main
```

`scripts/check.mjs` verifies required files, local `src`/`href` targets in `index.html`, relative Markdown links, `node --check` for every JavaScript file, JSON parsing, and byte-identical skill template copies. It prints `OK <n> checks` and exits 0, or lists `FAIL` lines and exits 1. Browser behaviour is not covered by that script; see [docs/TESTING.md](docs/TESTING.md).

## 3. Architecture

Load order is `index.html` → `style.css` → `script.js`, with Three.js r128 and `OrbitControls` loaded from CDNs before `script.js`.

`script.js` is one IIFE in nine sections:

1. **Helpers and constants** — `APP`, `STORAGE_KEY`, `LOW_POWER`, `DPR`, math helpers.
2. **Persistence** — `DEFAULT_SETTINGS`, `DEFAULT_LAYERS`, `loadLocal`, `persistNow`, `persistSoon`, `snapshotTimer`. Key: `hearthHome3D.v1`.
3. **Procedural textures** — `getTextures` builds every map with Canvas 2D (`stoneDraw`, `woodDraw`, `rugDraw`, `nightWindowDraw`, `balloonDraw`, …). No image files are used at runtime.
4. **Particles** — `createParticles` (custom point shader), `createDust`, `createBirds`, `createFireflies`.
5. **Worlds** — `buildFireplaceWorld`, `buildOceanWorld`, `buildSkyWorld`, `makeIsland`. Each returns `{ scene, position, target, exposure, limits, update }`.
6. **Renderer and switching** — `initThree` builds all three worlds once, `applyWorld` swaps exposure/camera limits, `switchScene` fades, `animate` runs one `requestAnimationFrame` loop.
7. **Sound** — `SoundEngine` / `sound`: noise buffers, fire bed, five layer buses, scheduled crackles/waves/drops, completion `chime`.
8. **Timer and UI** — `timer`, `initTimer`, `startTimer`, `tickTimer`, `completePhase`, `renderTimer`, `updateStats`, `bindUI`, `downloadSessionLog`, `importSessionData`, `toggleMinimal`.
9. **Boot** — `boot` calls `loadLocal` → `bindUI` → `initTimer` → `updateStats` → `syncSettingsToUI` → `updateSoundUI` / `updateLayerUI` → `initQuotes` → `initThree` → `autoStartSound` (650 ms later).

Key behaviours:

- Timers are timestamp-based: `timer.endAt = Date.now() + remainingMs`, polled every 250 ms, so tab throttling does not stretch a block.
- The focus ring circumference is `2 * Math.PI * 86`; the dash offset is `C * (1 - remaining / total)`.
- Fire light flicker is a sum of sines plus a damped random walk (`flick *= 0.94`), clamped to `[0.55, 1.2]` of a 1.8-intensity point light.
- Scene changes do not rebuild geometry. `applyWorld(name, false)` starts a 1.5 s `easeOutCubic` camera tween and disables orbit until it finishes.
- The fireplace room, all props, and the lighting rig are described coordinate-by-coordinate in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Persistence shape: `{ version, app, savedAt, settings, profile, timer }`. `settings` includes the active scene, three volumes, focus/break minutes, auto-start, minimal mode, `soundOn`, `soundSchema` and per-scene `layers`. `profile.history` keeps at most 1200 validated focus/break entries; stats are recomputed from it. A running timer is stored as `{ mode, running, remainingMs, totalMs, endAt, phaseStartAt }` and restored only if `endAt` is still in the future and within the block length plus 2 s.

## 4. Decisions and constraints

- **No build, no framework, no bundler.** Three source files plus assets. Do not add a package.json-driven build or a module bundler.
- **The CDN pins are part of the app.** Three.js is `r128` (`three.min.js`) and `OrbitControls` is `three@0.128.0`. Mixing versions breaks `THREE.OrbitControls` and shader/encoding assumptions. `installOrbitFallback()` exists only as a safety net if the controls script fails.
- **The three worlds are authored coordinates, not generated layouts.** If you move the fireplace, camera limits, fire-light position, particle origins, room walls and the rug must move together. There is no physics engine and no collision.
- **Lighting is a fixed time-of-day design, not a clock.** The fireplace is a night interior (cool moon through the window against a warm hearth); the ocean is a sunset; the sky is a golden day. There is no day/night cycle and no user time control. Only animation (flicker, waves, drift) changes over time.
- **No 3D interaction hotspots.** The canvas is orbit/zoom only; there is no raycasting, hover picking or object clicking. Every control is an HTML button, chip, slider or keyboard shortcut.
- **Audio is synthesized; no audio files.** Do not add `<audio>`, recorded loops or remote media. Layer mixes are per scene and persisted; the master/ambience/crackle sliders are shared.
- **Autoplay is best-effort.** Sound is intended to start on load, but browsers suspend `AudioContext` until a gesture. `wakeSound` retries on the first pointer/key/touch; the UI must keep reporting **Tap to hear** until the context is actually `running`. Do not claim audible autoplay.
- **Timer semantics are fixed.** A skipped phase is not logged; only a naturally completed focus block appends history and increments the session count. Break completion chimes but does not count. Session duration comes from `timer.totalMs`, not wall-clock drift.
- **The persistence migration is intentional.** Stored settings without `soundSchema` (or with schema < 2) are upgraded to `soundOn: true` once. Explicit mute in v1.1.0+ persists.
- **Everything stays local.** No analytics, accounts, network requests from `script.js`, or server. Export is a client-side Blob named `fireplace_sanctuary_log.json`; import deduplicates by history `id` and caps at 1200 entries.
- **Documentation and the static check are part of the release.** Changing behaviour without updating [docs/TESTING.md](docs/TESTING.md) or the check script is an incomplete change.

## 5. Known issues

- **Network required at runtime.** Three.js, OrbitControls and Google Fonts are remote. The room falls back to system fonts, but the 3D scene cannot start without the Three.js CDN.
- **Browser coverage is limited.** Verified interactively in headless Chrome (desktop 1440×900 and mobile 390×844). Safari, Firefox, iOS Safari and Android Chrome were not formally automated. See [docs/TESTING.md](docs/TESTING.md).
- **Autoplay remains browser-dependent.** On a cold load Chrome reports `suspended`; the first gesture starts audio. Some browsers may require a second gesture.
- **Mobile is a scrolling panel stack, not a separate layout.** Below 960 px the panels scroll inside `.layout`; the canvas stays fixed behind. Very short desktop windows hide the quote card and shrink the ring.
- **The grain overlay is larger than the viewport** (`inset: -50%`) by design, so a naive overflow detector reports it. The document itself does not scroll horizontally in the tested viewport.
- **No automated browser suite is committed.** The original headless CDP scripts lived in a temp directory and are not in the repo; only static checks run here.
- **No reduced-motion-specific 3D path.** `prefers-reduced-motion` is honoured for CSS and loader/scene-fade timings, but particles and world animation continue.
- **Audio quality is design-tuned, not measured.** Filter frequencies and gains were set by ear/iteration; there is no loudness normalisation across scenes.

## 6. Continuity

- **Deployed copy:** GitHub Pages at <https://somphol.github.io/hearth-and-home-3d/>, built from `main` at the repository root. `.nojekyll` is present.
- **Local master:** `~/Projects/hearth-and-home-3d`.
- **Release history:** [CHANGELOG.md](CHANGELOG.md). `SESSION_STATE.json` is the historical build/token record; do not wire it into the app.
- **Documentation map:** [README.md](README.md) is the human entry point; [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) the technical map; [docs/REPRODUCTION.md](docs/REPRODUCTION.md) the rebuild book; [docs/TESTING.md](docs/TESTING.md) the verified matrix and gaps; [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) Pages operations; [skills/hearth-and-home-3d/SKILL.md](skills/hearth-and-home-3d/SKILL.md) the reusable build skill.
- **Policies:** [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), [SECURITY.md](SECURITY.md), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), [LICENSE](LICENSE).
- **Publishing:** keep the repository public (MIT) and Pages on `main` / root. If the repository is renamed, update the absolute URLs in `index.html` (canonical, Open Graph, Twitter), `README.md`, `AGENTS.md`, `sitemap.xml`, `robots.txt`, `SESSION_STATE.json` and the social-card metadata. Do not force-push `main`.
