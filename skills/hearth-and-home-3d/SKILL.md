---
name: Hearth & Home 3D
description: Build a static Three.js cozy sanctuary with a procedural fireplace room, particle fire, five-layer synthesized soundscape, Pomodoro timer, local persistence, JSON export and a GitHub Pages release.
version: 1.0.0
---

# Hearth & Home 3D

Build a cozy, single-page 3D study sanctuary from three files: a procedural
fireplace room, an ocean sunset, a floating-island sky, a synthesized Web Audio
mixer, and a Pomodoro ritual with local statistics.

`assets/template/` is the finished **Hearth & Home 3D v1.1.0** app, not a blank
starter. Use it as a working reference: run it, read the sections below, then
replace the world content and copy while keeping the renderer, timer, audio
graph and persistence contracts.

## When to use

- The user wants a cozy 3D room, fireplace, focus sanctuary, ambient
  soundscape, or a Three.js scene with a Pomodoro ritual.
- The result must be one HTML page with no framework, build step or backend,
  served from GitHub Pages.
- You need procedural geometry, Canvas textures, a GPU particle fire, and
  synthesized audio with no recorded media.
- You want a reference implementation that already handles `localStorage`,
  running-timer restore, JSON export/import and a five-layer mixer.

**Not for:** offline-first apps (Three.js and Google Fonts are CDN-loaded), games
with physics/collision, 3D object picking or hotspots, multi-user accounts, or a
generic marketing site. Do not use it to reskin an unrelated product and claim
it is a new engine.

## What it produces

| File | Role |
| --- | --- |
| `index.html` | Canvas, top bar, scene switcher, Pomodoro panel, mixer, log panel, minimal HUD, loader |
| `style.css` | Warm-cabin glass design, palette, responsive panel stack, reduced-motion rules |
| `script.js` | One IIFE: helpers, persistence, textures, particles, three worlds, renderer, audio, timer, UI, boot |

Runtime dependencies are pinned CDNs: Three.js `r128`, `OrbitControls` from
`three@0.128.0`, and Fraunces/Inter from Google Fonts. No `package.json`.

## Workflow

```sh
# 1. scaffold from the reference
mkdir -p ~/Projects/my-sanctuary
cp skills/hearth-and-home-3d/assets/template/index.html \
   skills/hearth-and-home-3d/assets/template/style.css \
   skills/hearth-and-home-3d/assets/template/script.js \
   ~/Projects/my-sanctuary/
cd ~/Projects/my-sanctuary
git init -b main
touch .nojekyll

# 2. run
python3 -m http.server 8080        # http://localhost:8080

# 3. check syntax after every edit
node --check script.js

# 4. add your own static release check (see references/verification.md)
node scripts/check.mjs

# 5. deploy
git add -A && git commit -m "feat: build sanctuary" && git push origin main
```

Set GitHub Pages to **Deploy from a branch → main → / (root)**. `.nojekyll`
must exist and be empty.

## Module map

| Section in `script.js` | Key functions | What to keep |
| --- | --- | --- |
| 0 Helpers | `clamp`, `lerp`, `rand`, `smoothstep`, `easeOutCubic` | Used everywhere; do not rename casually |
| 1 Persistence | `DEFAULT_SETTINGS`, `DEFAULT_LAYERS`, `loadLocal`, `persistNow`, `snapshotTimer` | Key `hearthHome3D.v1`; validation rules |
| 2 Textures | `getTextures`, `stoneDraw`, `woodDraw`, `nightWindowDraw` | Canvas only; no image assets |
| 3 Particles | `createParticles`, `createDust`, `createBirds` | Typed attributes + custom point shader |
| 4 Worlds | `buildFireplaceWorld`, `buildOceanWorld`, `buildSkyWorld`, `makeIsland` | World contract and authored coordinates |
| 5 Renderer | `initThree`, `applyWorld`, `switchScene`, `animate` | One renderer/camera/loop; worlds built once |
| 6 Audio | `SoundEngine` | Graph, layer buses, schedulers, truthful UI labels |
| 7 Timer | `initTimer`, `tickTimer`, `completePhase`, `renderTimer` | `endAt` timestamps; skip never logs |
| 8 UI | `bindUI`, `updateSoundUI`, `toggleLayer`, `importSessionData` | DOM truth over intended state |
| 9 Boot | `boot`, `window.HearthHome3D` | Order matters; build worlds before camera apply |

## Core recipes

### 1. Make the fire read on camera

The particle system is easy to get "present but invisible". Treat it as a
composition problem, not a count problem.

1. Place the camera first: fireplace `(0.45, 2.95, 6.2)` → target `(0, 2.0, -2.45)`.
2. Keep the firebox opening around `z -5`, logs at `y 0.55–1.02`, flame origin
   `(0, 0.62, 0.52)` relative to the hearth group.
3. Start with `uScale = 300 * DPR`, flame size `0.28–0.62`, count 320; add the
   110-point body for volume and 72 embers for sparks.
4. Give the fire a real light: `PointLight(0xff8a3a, 1.8, 22, 2)` at
   `(0, 1.35, -4.05)` with `castShadow`, plus a small `fireFill` near the logs.
5. Animate intensity with the sum-of-sines + damped random walk in
   `buildFireplaceWorld.update`; clamp to `[0.55, 1.2]` of 1.8.
6. Screenshot at the default camera before tuning further. If the logs hide the
   flame, move the origin forward or raise the particle size; do not just add
   more particles.

### 2. Add or retune a sound layer

1. Add the key to `LAYER_KEYS` and to **all three** `DEFAULT_LAYERS` scenes.
2. Create a gain bus in `SoundEngine.prototype.start` and connect it to `ambBus`.
3. Build the source chain: a `BufferSource` from `pinkBuffer`/`brownBuffer`/
   `whiteBuffer`, a `BiquadFilter`, a gain, then the bus. Add a slow LFO to the
   gain for movement.
4. Extend `applyLayers` so the bus ramps to `layers[key] ? 1 : 0`.
5. Extend `syncSchedulers` if the layer needs discrete events; guard every
   `play*` method with `ctx.state === 'running'` and the active layer.
6. Add a `.layer-chip[data-layer]` in `index.html`; `toggleLayer` and
   `updateLayerUI` pick it up automatically.
7. Test with the context running, not just after clicking the chip: inspect the
   gain value and confirm the stored `settings.layers` booleans.

### 3. Keep the Pomodoro honest

1. Never decrement a counter. Store `timer.endAt = Date.now() + remainingMs` and
   poll every 250 ms.
2. On tick, if `endAt - Date.now() <= 0`, call `completePhase('complete')`.
3. Log a history entry only when `finishedMode === 'focus' && reason === 'complete'`.
   `skipPhase` must call `completePhase('skip')` and add nothing.
4. Compute `durationSeconds` from `timer.totalMs`, not from wall clock.
5. Persist `{ mode, running, remainingMs, totalMs, endAt, phaseStartAt }`; on
   boot, restore only when `endAt` is in the future and within
   `totalMs + 2000`.
6. Recompute stats from `profile.history` (`updateStats`), so a stale stored
   total can never win.

## Failure boundaries

- **No offline promise.** Three.js, OrbitControls and fonts are remote. The page
  can show a loader error if the CDN is blocked.
- **Autoplay is best-effort.** The code starts the audio context, but browsers
  may keep it suspended. Report **Tap to hear** until `ctx.state === 'running'`.
  Never claim audible autoplay.
- **No 3D picking.** The canvas is orbit/zoom only. Add DOM controls for every
  action; do not imply clickable props.
- **No physics.** Boat buoyancy and camera clamps are hand-authored formulas, not
  collision.
- **No fixed seed.** Cosmetic room details vary per load; do not build tests that
  depend on exact book/ember placement.
- **No browser test suite in the template.** Add one if the change is visual or
  interactive; static checks cannot see shaders or audio.
- **The template is a finished app.** Rebranding the title is not a new project;
  replace the world content and verify it.

## Verification

```sh
node --check script.js
node scripts/check.mjs
python3 -m http.server 8080
```

Expected: silent syntax check; `OK <n> checks`; page 200 with a cleared loader,
visible fire, working scene buttons, `Tap to hear` → `Sound On` after a gesture,
and one logged session after a completed focus block. For the manual matrix and
the exact code-level checks, read `references/verification.md`.

## Reference files

- `references/method.md` — build order, coordinate budget, audio graph, formulas.
- `references/lessons.md` — bugs that actually happened and what regresses.
- `references/verification.md` — exact checks, expected output, browser matrix.
- `assets/template/` — the released `index.html`, `style.css`, `script.js`
  (byte-identical copies; do not edit them in place).
- `ATTRIBUTION.md` — origin, new work, licence.
