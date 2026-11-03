# Architecture

Hearth & Home 3D is a single-page WebGL scene plus a DOM control layer. There is no framework, build step, module system or backend. `index.html` supplies the markup and CDN script tags, `style.css` supplies the warm-cabin design system, and `script.js` is one strict-mode IIFE that owns every runtime object.

## 1. Module map

| Area | Identifiers | Responsibility |
| --- | --- | --- |
| App constants | `APP`, `STORAGE_KEY`, `RING_CIRCUMFERENCE`, `REDUCED_MOTION`, `TOUCH`, `LOW_POWER`, `DPR` | Version 1.1.0, storage key `hearthHome3D.v1`, power/DPR policy |
| Persistence | `DEFAULT_SETTINGS`, `DEFAULT_LAYERS`, `LAYER_KEYS`, `normalizeLayers`, `loadLocal`, `persistNow`, `persistSoon`, `snapshotTimer`, `safeNumber` | Settings/profile/timer load, validation, debounced save |
| Textures | `textureCache`, `makeCanvas`, `makeTexture`, `getTextures`, `stoneDraw`, `woodDraw`, `rugDraw`, `wallpaperDraw`, `glowDraw`, `flameDraw`, `sparkDraw`, `cloudDraw`, `cloudSeaDraw`, `artDraw`, `nightWindowDraw`, `balloonDraw`, `bumpDraw` | Canvas-generated maps; no bundled images |
| Particles | `createParticles`, `createDust`, `PARTICLE_VERTEX`, `PARTICLE_FRAGMENT`, `createBirds`, `createFireflies` | GPU points for flame, embers, smoke, dust; line-segment birds; firefly motes |
| Worlds | `WORLDS`, `buildFireplaceWorld`, `buildOceanWorld`, `buildSkyWorld`, `makeIsland` | Three separate `THREE.Scene` graphs, built once at boot |
| Renderer | `initThree`, `installOrbitFallback`, `onResize`, `applyWorld`, `switchScene`, `updateSceneUI`, `animate` | Renderer/camera/controls, world swap, one animation loop |
| Audio | `SoundEngine`, `sound`, `SoundEngine.prototype.*` | Noise buffers, fire bed, five layer buses, scheduled events, chime |
| Timer | `timer`, `focusMs`, `breakMs`, `initTimer`, `startTicker`, `stopTicker`, `tickTimer`, `startTimer`, `pauseTimer`, `resetTimer`, `skipPhase`, `completePhase`, `renderTimer` | Timestamp Pomodoro with restore |
| Statistics | `profile`, `updateStats`, `formatHours`, `formatMinutes`, `dayKey` | Totals, today, consecutive-day streak |
| UI | `toast`, `setRangeFill`, `updateSoundUI`, `updateLayerUI`, `enableSound`, `toggleSound`, `toggleLayer`, `autoStartSound`, `wakeSound`, `updateVolumeUI`, `toggleMinimal`, `updateLastSaved`, `rotateQuote`, `bindUI` | DOM state, mixer, minimal HUD, quotes, keyboard |
| Transfer | `downloadSessionLog`, `handleSessionFile`, `importSessionData`, `syncSettingsToUI` | JSON Blob export and deduplicated import |
| Public API | `window.HearthHome3D` | `settings`, `profile`, `timer`, `sound`, `switchScene`, `toggleMinimal`, `toggleLayer`, `enableSound`, `updateSoundUI`, getters `scene`, `world`, `worlds`, `camera`, `controls` |

## 2. Boot sequence

1. `index.html` loads Three.js r128, then `OrbitControls` from `three@0.128.0`, then `script.js`.
2. `boot()` runs on `DOMContentLoaded` (or immediately if already parsed).
3. `loadLocal()` reads `localStorage['hearthHome3D.v1']`, clamps settings, filters history, stores `savedTimerState`.
4. `bindUI()` attaches every listener, paints volumes and sound UI, restores minimal mode.
5. `initTimer()` builds the clock and restores a running timer if its `endAt` is still valid.
6. `updateStats()`, `syncSettingsToUI()`, `updateSoundUI()`, `updateLayerUI(settings.scene)`.
7. `initQuotes()` starts a 24 s quote rotation.
8. `initThree()`:
   - `installOrbitFallback()` fills in a minimal controls object only if the CDN script failed.
   - Creates `WebGLRenderer` on `#scene-canvas` with `antialias: !LOW_POWER`, `powerPreference: 'high-performance'`, DPR cap, PCF soft shadows, sRGB output, ACES tone mapping.
   - Creates a 46° perspective camera (`near 0.1`, `far 500`) and `OrbitControls` with damping, no pan, rotate speed 0.55, zoom speed 0.7.
   - Calls `buildFireplaceWorld()`, `buildOceanWorld()`, `buildSkyWorld()` immediately. All three scenes stay resident; switching only changes camera, exposure and limits.
   - `applyWorld(settings.scene, true)` snaps the camera to the saved world.
   - Starts `animate()`.
9. `hideLoader()` after 700 ms (250 ms with reduced motion); `autoStartSound()` after 650 ms.

`animate()` computes `dt = min(clock.getDelta(), 0.05)` and `t = clock.elapsedTime`, updates orbit controls, applies the camera tween, calls `activeWorld.update(t, dt)`, then renders `activeWorld.scene`.

## 3. The fireplace room, coordinate by coordinate

World units are metres in spirit but not physically calibrated. The camera looks from `(0.45, 2.95, 6.2)` toward `(0, 2.0, -2.45)`, with distance limits `4..8.6`, polar `1.0..1.62`, azimuth `±0.95`. Exposure is `1.08`. Background is `0x110a06`; fog is `FogExp2(0x160d08, 0.028)`.

### Shell

| Object | Geometry / transform |
| --- | --- |
| Floor | `PlaneGeometry(22, 18)`, rotated `-π/2`, `(0, 0, 0)` |
| Back wall | `PlaneGeometry(22, 9)`, `(0, 4.5, -6.6)` |
| Left / right walls | `PlaneGeometry(18, 9)`, `(∓11, 4.5, 0)`, rotated `±π/2` |
| Ceiling | `PlaneGeometry(22, 18)`, rotated `π/2`, `(0, 7, 0)` |
| Ceiling beams | Five `22 × 0.24 × 0.3` boxes at `y = 6.86`, `z = -5.6 + i * 2.6` |
| Rug | `5.7 × 4.0` plane, `(0.2, 0.012, -1.45)` |

### Hearth group at `(0, 0, -5.0)`

| Object | Geometry / transform |
| --- | --- |
| Hearth slab | `5.6 × 0.28 × 2.2` at `(0, 0.14, 0.55)`; top slab `5.2 × 0.12 × 2.0` at `y 0.30` |
| Pillars | `0.95 × 2.95 × 1.35` at `x ±1.75`, `y 1.78` |
| Lintel | `4.45 × 0.66 × 1.35` at `y 2.90` |
| Mantel | `5.15 × 0.24 × 1.62` at `y 3.35, z 0.14`; dark under-board at `y 3.20` |
| Corbels | `0.34 × 0.42 × 0.40` at `x ±2.20`, `y 3.08, z 0.42` |
| Chimney breast | `4.0 × 3.5 × 1.18` at `y 5.22, z -0.12`; stone trim at `y 3.52` |
| Decorative stones | 14 small boxes on the breast at `z 0.72`, `x ±(1.45..2.05)` |
| Firebox back | Soot plane `2.7 × 2.32` at `y 1.47, z -0.57` |
| Firebox sides | Soot planes `1.2 × 2.32` at `x ±1.34`; top plane `2.7 × 1.2` at `y 2.62` |
| Ash bed | Box `2.72 × 0.08 × 1.20` at `y 0.34, z 0.05` |
| Opening trim | Soot boxes at `x ±1.36`, `y 1.55`; lintel trim at `y 2.72, z 0.72` |
| Glow plane | `2.1 × 1.3` at `(0, 1.0, -0.5)`, additive, base opacity 0.32 |
| Opening sprite | `4.2 × 3.0` at `(0, 1.3, 0.95)`, additive, base opacity 0.16 |
| Logs | Four cylinders: `len/r/y/z` = `2.05/0.22/0.55/0.08`, `1.8/0.19/0.55/0.38`, `1.72/0.18/0.84/0.24`, `1.5/0.15/1.02/0.10`; the upper two use the char material |
| Embers | 22 icosahedron rocks in `x ±1.0`, `y 0.36..0.48`, `z -0.35..0.5` |
| Flames | 320 points, origin `(0, 0.62, 0.52)`, spread `0.58/0.08/0.16` |
| Flame body | 110 points, origin `(0, 0.58, 0.38)`, larger and slower |
| Embers (particles) | 72 points, origin `(0, 0.66, 0.48)`, upward acceleration, flicker 14 |
| Smoke | 32 points, origin `(0, 1.45, 0.3)`, normal blending, opacity 0.07 |
| Dust | 110 motes (66 on low power) in an `8 × 6.4 × 8` box around the room |
| Candles | Two on the mantel at `x -1.7` (`h 0.55`) and `x 1.85` (`h 0.38`), `z 0.66`, base `y 3.47` |
| Mantel books | Four stacked boxes at `x 0.55`, `y 3.47 + i * 0.078`, `z 0.62` |
| Framed art | `1.0 × 0.7` at `y 4.25, z 0.47`, behind a `1.15 × 0.85 × 0.06` frame |
| Mantel clock | Brass cylinder at `(-0.85, 3.72, 0.60)`, face at `z 0.655`, fixed hands |
| Hearth plant | Pot at `(-2.35, 0.44, 0.70)`, eight cone leaves |

### Other furniture

| Object | Transform / notes |
| --- | --- |
| Bookshelf | Group at `(-5.2, 0, -6.0)`; carcass `3.0 × 4.7 × 0.3`; four shelves at `y 0.95, 1.82, 2.69, 3.56`; random-width books along each shelf |
| Armchair | Group at `(4.15, 0, -1.35)`, rotated `y = -1.75`; base, seat cushion, angled back, rolled top, wings, arms, four legs, pillow, throw |
| Side table | Group at `(5.65, 0, 0.15)`; round top radius `0.66` at `y 0.68`, stem, base, mug, brass lamp |
| Lamp light | `PointLight(0xffb46b, 0.55, 7, 2)` at `(5.41, 1.36, 0.13)` |
| Window | Group at `(10.93, 3.15, -1.8)`, rotated `-π/2`; `3.1 × 2.5` night-glass plane, dark frame, stone sill |
| Wall art | `1.7 × 1.15` at `(-2.55, 4.4, -6.55)` with four frame bars |
| Floor plant | Pot at `(-7.9, 0.28, -4.7)`, 14 cone leaves up to ~2 m |

Randomness in book widths/heights, decorative stones, leaf angles and ember placement uses `Math.random()` at build time. There is no fixed seed, so the room is structurally identical but slightly different in detail on every load.

## 4. Lighting and the "time-of-day" model

There is **no clock-driven time-of-day system**. Each world is authored at one fixed moment, and only animation changes over time. There is no sun-angle update, no sunrise/sunset interpolation, no user lighting control.

`buildFireplaceWorld` is a **night interior**: a cold moon fills the window while the hearth provides the warm key.

| Light | Colour | Intensity / distance / decay | Position |
| --- | --- | --- | --- |
| Hemisphere | sky `0x5b6d8c`, ground `0x2b170a` | 0.5 | — |
| Ambient | `0xffc38a` | 0.25 | — |
| Fire point | `0xff8a3a` | 1.8 / 22 / 2, castShadow | `(0, 1.35, -4.05)` |
| Room fill | `0xffa860` | 0.30 / 15 / 2 | `(0, 4.6, -1.2)` |
| Fire fill | `0xff4d12` | animated around 0.55 / 6 / 2 | `(0, 0.95, -4.75)` |
| Moon | `0x8fb4ff` directional | 0.32 | `(9, 6, 2)` |
| Ember point | `0xff6a1a` | animated around 0.22 / 5 / 2 | `(0, 0.7, -4.6)` |
| Lamp point | `0xffb46b` | 0.55 / 7 / 2 | `(5.41, 1.36, 0.13)` |

The fire shadow map is 1024² (512² on low power), near 0.25, far 22, bias -0.0012, radius 3. Shadow casting is limited to the main fire light.

`buildOceanWorld` is a **sunset**: background `0x1a3550`, sun direction `normalize(-0.38, 0.20, -0.90)`, directional light `0xffc58a` at 1.35, hemisphere `0x8fb4d9/0x163240` at 0.75, ambient `0xffd6b0` at 0.12. Sky-dome stops are `0x0d1d3d` (top), `0x7d6076` (mid), `0xffb27a` (low).

`buildSkyWorld` is a **golden day**: background `0xbcd7ee`, linear fog `0xe8d3bd` from 110 to 420, sun direction `normalize(-0.62, 0.14, -0.77)`, directional light `0xffd9a6` at 1.55, hemisphere `0xbfd9f2/0xd9c3a4` at 0.5, ambient `0xffe6c8` at 0.1. Sky-dome stops are `0x245a9a`, `0x9fc6e6`, `0xffcf9e`.

Tone-mapping exposure is set per world: fireplace `1.08`, ocean `1.0`, sky `1.06`; the renderer's initial value is `1.1`.

## 5. Interaction surfaces and "hotspots"

There is **no raycasting, no object hover, and no 3D hotspot system** anywhere in `script.js`. The canvas is a camera surface only:

- Drag / one-finger drag orbits (theta/phi), clamped by each world's `limits`.
- Wheel / pinch zooms between `minDistance` and `maxDistance`.
- Pan is disabled. The canvas uses `touch-action: none`.
- The ocean world clamps camera `y` to `1.2` after controls update so the camera cannot go under the water.

All interaction is DOM:

| Surface | Effect |
| --- | --- |
| `.scene-btn[data-scene]` (Fireplace / Ocean / Sky) | `switchScene`, persisted |
| `#sound-toggle`, `#audio-power`, `#mini-sound` | `toggleSound` / `enableSound` |
| `.layer-chip[data-layer]` (fire/room/ocean/wind/rain) | `toggleLayer`; per-scene mix, persisted |
| `#fire-volume`, `#ambience-volume`, `#master-volume` | Update settings and call `sound.applyVolumes()` |
| `#timer-start`, `#timer-reset`, `#timer-skip` | Start/pause, reset, skip phase |
| `#focus-minutes`, `#break-minutes` | Clamp and apply durations |
| `#save-session` | Download `fireplace_sanctuary_log.json` |
| `#load-session` / `#session-file` | Import and merge a log |
| `#ui-toggle`, `#mini-exit`, `#mini-timer`, `#mini-play` | Distraction-free mode and mini controls |

Keyboard (ignored while typing in inputs): `Space` start/pause, `H` minimal mode, `M` mute, `R` reset, `1/2/3` scenes, `Esc` leave minimal. Space is not hijacked while a button, link or summary has focus.

## 6. Render pipeline

1. `getTextures()` lazily builds and caches all `CanvasTexture` maps once.
2. Each world is a `THREE.Scene` with its own background, fog and lights.
3. `createParticles` allocates typed attributes (`position`, `aColor`, `aSize`, `aAlpha`) and a `ShaderMaterial`. Point size in the vertex shader is `aSize * uScale / max(0.001, -mv.z)` with `uScale = 300 * DPR`; alpha is faded with `smoothstep`, then optional sinusoidal flicker.
4. Particle counts are reduced by 32% on `LOW_POWER`; dust by 40%; firefly count by 40%.
5. Per-frame `activeWorld.update(t, dt)` animates particles, lights, water uniforms, drifting clouds, birds, islands, balloon and fireflies.
6. `renderer.render(activeWorld.scene, camera)` is called after every update. There is no post-processing pass; the vignette and film grain are CSS overlays.

## 7. Audio design

`SoundEngine` creates its graph lazily on `start()`, which is called by `autoStartSound()` 650 ms after boot or by an explicit toggle.

### Graph

```text
fire bed ──────────────► fireBus ─┐
                                  ├─► compressor ─► master ─► destination
room / ocean / wind / rain ─► ambBus ┘
scheduled crackles ─────► fireBus
scheduled waves/drops ──► layerGains
completion chime ───────► compressor
```

- `master.gain` starts at 0 and ramps to `settings.masterVolume` with a 0.6 s time constant.
- Compressor: threshold -18 dB, knee 22, ratio 4, attack 0.004 s, release 0.28 s.
- `ambBus.gain = settings.ambienceVolume`; `fireBus.gain = settings.fireVolume` when the fire layer is on, otherwise 0.
- Layer buses (room/ocean/wind/rain) ramp between 0 and 1 with `setTargetAtTime`; scene switches use a 0.9 s ramp, instant restore 0.05 s, layer toggles 0.22 s.

### Noise sources

| Buffer | Length | Recipe |
| --- | --- | --- |
| Pink | 6 s stereo | Paul Kellet-style seven-pole filter, scaled by 0.11 |
| White | 3 s stereo | `random * 0.6` |
| Brown | 5 s stereo | leaky integrator `(brown + 0.02 * white) / 1.02`, scaled by 3.2 |
| Crackle | 0.35 s mono | white noise times `(1 - i/length)^5` |

### Fire bed

- Pink loop → lowpass 520 Hz, Q 0.7 → gain 0.32 → `fireBus`.
- Brown loop → lowpass 150 Hz → gain 0.28 → `fireBus`.
- Sine 44 Hz at 0.035 and triangle 67 Hz at 0.012 → `fireBus`.
- A 0.13 Hz sine LFO at depth 0.06 modulates the pink gain, giving the slow "breathing" bed.

### Layers

| Layer | Sources and filters | Nominal gain |
| --- | --- | --- |
| Room | Brown → lowpass 130 Hz | 0.32 |
| Ocean | Pink → lowpass 780 Hz, Q 0.9, with 0.085 Hz swell LFO at depth 0.16; white → bandpass 2400 Hz, Q 0.5 | 0.26 + 0.035 hiss |
| Wind | Pink → bandpass 540 Hz, Q 0.55, with 0.11 Hz gust LFO at depth 0.17; white → bandpass 1300 Hz, Q 3.2 | 0.30 + 0.018 whistle |
| Rain | White → highpass 900 → lowpass 7800, with 0.06 Hz LFO at depth 0.04; pink → lowpass 1100 | 0.18 + 0.10 body |

### Scheduled events

- **Crackles** start after 180 ms, then every `rand(70, 620)` ms while fire is on (800 ms otherwise). Each is a 0.035–0.16 s highpass burst (950–3400 Hz, Q 0.4–1.6), peak 0.12–0.55, stereo-panned ±0.7. An 8% chance adds a triangle "wood pop" sweeping 120–210 Hz down to 45–80 Hz.
- **Waves** every 6.2–12.5 s: pink noise lowpass sweeping 1200 → 240 Hz over 3.4 s, gain peaking 0.16–0.3 at 1.1 s and decaying by 4.2 s.
- **Rain drops** every 55–280 ms: 0.015–0.055 s highpass 1600–5200 Hz, peak 0.015–0.07, panned ±0.85.
- **Chime** on natural completion only: focus uses C5/E5/G5/C6 (`523.25, 659.25, 783.99, 1046.5`), break uses G4/B4/D5 (`392, 493.88, 587.33`). Sine notes enter 0.16 s apart, peak 0.09, decay 1.8 s, each with an octave shimmer at 0.02.

### Lifecycle and UI truthfulness

`start()` creates the context and buses and returns a Promise. `setEnabled()` only changes gain; `applyVolumes()` re-reads settings. `updateSoundUI()` derives the label from real state, not intent:

- not enabled and never started and not muted before → `Enable Sound`
- not enabled but started or muted preference → `Sound Off`
- enabled but context not `running` → `Tap to hear`
- enabled and running → `Sound On`

`wakeSound` runs on `pointerdown`, `keydown` and `touchstart`; it ignores the sound buttons and the `M` key so those handlers remain authoritative. Browsers that require a gesture keep the context suspended until then; the app never reports sound as audible while `ctx.state !== 'running'`.

## 8. State and persistence

`localStorage` key: `hearthHome3D.v1`.

```json
{
  "version": 1,
  "app": "Hearth & Home 3D",
  "savedAt": 1790000000000,
  "settings": {
    "scene": "fireplace",
    "fireVolume": 0.7,
    "ambienceVolume": 0.45,
    "masterVolume": 0.8,
    "focusMinutes": 25,
    "breakMinutes": 5,
    "autoStartBreak": true,
    "minimal": false,
    "soundOn": true,
    "soundSchema": 2,
    "layers": {
      "fireplace": { "fire": true, "room": true, "ocean": false, "wind": false, "rain": false },
      "ocean": { "fire": false, "room": false, "ocean": true, "wind": true, "rain": false },
      "sky": { "fire": false, "room": false, "ocean": false, "wind": true, "rain": false }
    }
  },
  "profile": {
    "totalFocusSeconds": 0,
    "sessionsCompleted": 0,
    "createdAt": "ISO",
    "updatedAt": "ISO",
    "history": [
      {
        "id": "focus_<timestamp>_<random>",
        "mode": "focus",
        "startedAt": "ISO",
        "completedAt": "ISO",
        "durationSeconds": 1500,
        "scene": "fireplace"
      }
    ]
  },
  "timer": {
    "mode": "focus",
    "running": false,
    "remainingMs": 1500000,
    "totalMs": 1500000,
    "endAt": 0,
    "phaseStartAt": null
  }
}
```

Validation rules in `loadLocal`:

- `scene` must be one of `fireplace`, `ocean`, `sky`.
- Volumes clamp to `[0,1]`; focus to `[1,120]` minutes; break to `[1,45]`.
- `autoStartBreak` defaults true; `minimal` is coerced boolean.
- If `soundSchema` is missing or `< 2`, `soundOn` is forced true once (the v1.1.0 migration); afterwards `soundOn !== false` is honoured.
- History keeps only entries with `mode` `focus`/`break`, a string `id`, and a parseable `completedAt`; the last 1200 are kept.
- A saved timer is adopted only when `endAt - Date.now()` is positive and no greater than `totalMs + 2000`; otherwise it resets to a full block.

`persistNow()` stamps `profile.updatedAt`, writes synchronously, and sets `storageAvailable = false` after a storage error. `persistSoon` debounces 350 ms. Additional saves happen on phase completion, settings changes, import, `beforeunload`, and every 12 s while running. The profile is recomputed from history in `updateStats()` rather than trusted from stored totals.

Export is `{ app, version, exportedAt, profile, settings, note }`; import accepts either that shape or a bare profile, filters by `isValidHistoryEntry`, deduplicates by `id`, sorts by `completedAt`, and caps at 1200.

## 9. Formulas and invariants

**Timer ring** (`RING_CIRCUMFERENCE = 2π·86 ≈ 540.354`):

```text
fraction = clamp(remainingMs / max(1, totalMs), 0, 1)
strokeDashoffset = C * (1 - fraction)
remainingMs = endAt - Date.now()      // while running
```

**Fire light flicker**:

```text
flick += (random() - 0.5) * dt * 3.2
flick *= 0.94
f = 0.86 + 0.10·sin(9.3t)·sin(4.1t) + 0.06·sin(22.7t + 1.4) + 0.35·flick
fireLight.intensity = 1.8 · clamp(f, 0.55, 1.2)
fireLight.x = sin(6.4t) · 0.06
fireLight.y = 1.35 + sin(8.7t + 1.2) · 0.04
```

**Ocean surface** — the same four-sine function exists in the vertex shader and in JS `oceanHeight(x, z, t)` for buoyancy:

```text
h = 0.26·sin(0.32x + 0.8t)
  + 0.18·sin(0.45z − 0.62t)
  + 0.30·sin(0.16(x+z) + 0.45t)
  + 0.07·sin(0.85x − 0.55z + 1.5t)
```

Normals come from finite differences with `e = 0.55`; the boat sits at `h − 0.08` and rolls with three small sine terms.

**Particle point size**:

```text
gl_PointSize = aSize · uScale / max(0.001, −mv.z),   uScale = 300 · DPR
```

**Streak** (`updateStats`): collect local `YYYY-MM-DD` keys from focus history; start at today, or yesterday if today has no session; walk backwards while the key exists. Cap 3650. The display uses `formatMinutes` for today and `formatHours(seconds/3600).toFixed(1) + 'h'` for the total.

Invariants that must stay true:

- One renderer, one camera, one animation loop, three persistent scenes.
- `activeWorld` is always one of `WORLDS`; `applyWorld` is the only place exposure and control limits change.
- Scene switch never mutates geometry; camera tween and fade are the transition contract.
- Only a naturally completed focus block creates a history entry; skip does not.
- A visible sound label must match `sound.enabled` and `ctx.state`.
- The five layer keys exist for all three scenes, even when a scene's default is silent.
- Local `src`/`href` assets and relative Markdown links stay resolvable; `scripts/check.mjs` enforces this.

## 10. Extension points

- **New world:** write `buildXWorld()` returning `{ name, scene, position, target, exposure, limits, update, clampCameraY? }`, register it in `initThree`, add a `.scene-btn` with `data-scene`, extend the `hints` map in `switchScene`, add a `DEFAULT_LAYERS.x` entry, and add its mix name in `updateLayerUI`.
- **New sound layer:** add a key to `LAYER_KEYS` and every `DEFAULT_LAYERS` scene, create a gain bus in `start()`, connect sources, extend `applyLayers` and `syncSchedulers`, then add a `.layer-chip` and CSS. Keep per-scene persistence symmetric.
- **Room prop:** add geometry inside `buildFireplaceWorld` using `addBox`/`makeMaterial` and the existing texture cache. Keep coordinates inside the 22×18×9 shell and either cast or receive shadows deliberately.
- **New persisted setting:** add it to `DEFAULT_SETTINGS`, validate it in `loadLocal`, include it in `downloadSessionLog`, accept it in `importSessionData`, and sync its control in `syncSettingsToUI`.
- **New export field:** bump `APP.version` and [CHANGELOG.md](../CHANGELOG.md); keep import backward-compatible.
- **Accessibility:** all current controls are native buttons/inputs with labels. If adding a canvas interaction, it needs a DOM equivalent and visible focus, because the canvas is currently `role="img"`.
