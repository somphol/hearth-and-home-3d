# Method

This is the build order and the decisions that are hard to infer from the
template. The template is the finished app; this file explains why it is shaped
the way it is.

## 1. Build order

Build in this order. Each stage is runnable.

1. **Shell.** `index.html` with canvas, top bar, scene buttons, timer panel,
   mixer, log panel, minimal HUD, toast stack and loader. Keep the IDs stable;
   the script queries them directly.
2. **Design tokens.** `style.css` `:root`: amber/ember palette on `#120b07`,
   glass panels, `--radius: 20px`, Fraunces/Inter stacks, `--ease`.
3. **Constants + persistence.** `APP`, `STORAGE_KEY`, `DEFAULT_SETTINGS`,
   `DEFAULT_LAYERS`, `safeNumber`, `loadLocal`, `persistNow`, `snapshotTimer`.
4. **Textures.** `getTextures` + all `*Draw` functions. Canvas textures are
   cached once; never load an image at runtime.
5. **Particles.** `createParticles` with typed attributes and a point shader;
   then dust, birds, fireflies.
6. **Fireplace world.** Shell → hearth → firebox → logs → particles → props →
   lights → `update`. This is the emotional core; finish it before the other
   worlds.
7. **Ocean world.** Sky dome + custom water shader + boat + lighthouse +
   clouds. Reuse the same texture cache.
8. **Sky world.** Islands, balloon, cloud sea, birds, fireflies. Build
   `makeIsland` once and vary the spec.
9. **Renderer.** Build all worlds once, apply the saved camera, start one
   animation loop.
10. **Audio.** Graph → fire bed → four ambience chains → layer buses →
    schedulers → chime.
11. **Timer.** Timestamp countdown, completion, history, stats, restore.
12. **UI wiring.** Every button/chip/slider/key, truthful sound labels, minimal
    mode, export/import.
13. **Boot + checks + docs.** `boot`, public API, static check, README/AGENTS,
    Pages.

## 2. Coordinate budget

The fireplace room is a stage set, not a simulation. Keep these anchors if you
recompose it:

```text
floor        22 × 18 at y=0
back wall    z=-6.6, height 9, top y=9
side walls   x=±11
ceiling      y=7
camera       (0.45, 2.95, 6.2) → (0, 2.0, -2.45)
hearth group (0, 0, -5.0)
firebox      opening roughly x ±1.34, y 0.34..2.62
logs         y 0.55..1.02, z 0.08..0.38
rug          5.7 × 4 at (0.2, 0.012, -1.45)
chair        (4.15, 0, -1.35), rotated -1.75
table        (5.65, 0, 0.15)
window       (10.93, 3.15, -1.8), rotated -90°
shelf        (-5.2, 0, -6.0)
floor plant  (-7.9, 0, -4.7)
```

Camera limits: distance `4..8.6`, polar `1.0..1.62`, azimuth `±0.95`. These keep
the camera inside the room and above the rug. If the room grows, widen the
limits and re-check the edges for wall clipping.

The ocean camera is `(0.5, 3.9, 17)` → `(0, 2.1, 0)`, distance `6..42`, polar
`1.2..1.56`, with a hard `camera.y >= 1.2` clamp. The sky camera is
`(0, 11.2, 32)` → `(0, 11.4, -6)`, distance `10..58`, polar `1.05..1.72`.

## 3. Lighting model

Each world is one fixed time of day. There is no sun clock and no user lighting
control.

- **Fireplace — night interior.** Warm key from the hearth, cool moon from the
  right window. Hemisphere `0x5b6d8c/0x2b170a` at 0.5; ambient `0xffc38a` at
  0.25; fire point `0xff8a3a` at 1.8, distance 22, decay 2, shadows; room fill
  `0xffa860` at 0.30; fire fill `0xff4d12` near the logs; moon `0x8fb4ff` at
  0.32; ember point `0xff6a1a` at ~0.22; lamp `0xffb46b` at 0.55.
- **Ocean — sunset.** Sun direction `normalize(-0.38, 0.20, -0.90)`, directional
  `0xffc58a` at 1.35, hemisphere `0x8fb4d9/0x163240` at 0.75, ambient
  `0xffd6b0` at 0.12. Sky stops `0x0d1d3d / 0x7d6076 / 0xffb27a`.
- **Sky — golden day.** Sun direction `normalize(-0.62, 0.14, -0.77)`,
  directional `0xffd9a6` at 1.55, hemisphere `0xbfd9f2/0xd9c3a4` at 0.5,
  ambient `0xffe6c8` at 0.1. Fog `0xe8d3bd`, 110–420. Sky stops
  `0x245a9a / 0x9fc6e6 / 0xffcf9e`.

Exposure is per world: `1.08 / 1.0 / 1.06`. The renderer starts at 1.1 and
`applyWorld` sets the active value. Keep ACES tone mapping and sRGB output.

## 4. Fire recipe

The fire is four `createParticles` systems plus a set of light animations:

| System | Count | Origin | Size | Opacity | Notes |
| --- | --- | --- | --- | --- | --- |
| Flames | 320 | `(0, 0.62, 0.52)` | 0.28–0.62 | 0.90 | Additive, `sizeMode: flame`, speed 0.9–1.7 |
| Body | 110 | `(0, 0.58, 0.38)` | 0.55–1.05 | 0.36 | Slower, wider, adds volume |
| Embers | 72 | `(0, 0.66, 0.48)` | 0.045–0.11 | 0.95 | Gravity -0.05 (accelerates up), flicker 14 |
| Smoke | 32 | `(0, 1.45, 0.30)` | 0.45–1.0 | 0.07 | Normal blending, `sizeMode: grow` |

Colour stops are the identity of the fire:

```text
flames: 0xffe9a8 → 0xffb84a → 0xff7a1a → 0xe23a0e → 0x5a0e00
body:   0xffc766 → 0xff7a1a → 0xd63a0c → 0x4a0a00
embers: 0xfff3c0 → 0xffb347 → 0xff6a1a → 0xc72900
smoke:  0x5c4a3c → 0x6b5c50 → 0x3c342d
```

Point size is `aSize * uScale / max(0.001, -mv.z)` with `uScale = 300 * DPR`.
`sizeMode` scales by `0.55 + 0.75·sin(kπ)` (flame), `0.45 + 1.7k` (grow), or
`1 - 0.55k` (shrink). Alpha is `smoothstep(fadeIn) * (1 - smoothstep(fadeOut)) *
opacity`, optionally flickering.

The main light:

```text
flick += (random() - 0.5) * dt * 3.2
flick *= 0.94
f = 0.86 + 0.10·sin(9.3t)·sin(4.1t) + 0.06·sin(22.7t + 1.4) + 0.35·flick
intensity = 1.8 · clamp(f, 0.55, 1.2)
x = sin(6.4t) · 0.06
y = 1.35 + sin(8.7t + 1.2) · 0.04
```

Keep `dt` capped at 0.05 in `animate` and reset the clock delta when the tab
returns; otherwise a backgrounded tab can produce a violent flicker step.

## 5. Water and motion recipes

The ocean surface and the boat use the same height function:

```text
h = 0.26·sin(0.32x + 0.8t)
  + 0.18·sin(0.45z - 0.62t)
  + 0.30·sin(0.16(x+z) + 0.45t)
  + 0.07·sin(0.85x - 0.55z + 1.5t)
```

Normals are finite differences with `e = 0.55`:
`N = normalize(-hx/(2e), 1, -hz/(2e))`. Fresnel is `pow(1 - dot(N,V), 3)`;
specular is `pow(dot(R,V), 320)`; sparkle uses exponent 900. Foam is
`smoothstep(0.68, 1, height) * 0.1`; distance haze is
`smoothstep(70, 300, dist) * 0.72` toward `vec3(0.62, 0.47, 0.42)`.

The boat sits at `oceanHeight(x, z, t) - 0.08`, rolls `±0.035` on z, pitches
`±0.03` on x, and yaws `±0.08` on y with three different frequencies. The
lighthouse glow pulses at 1.9 rad/s.

In the sky world, islands bob `±0.32` at 0.32 rad/s, the balloon bobs `±0.9`
and drifts `±2.2` on x, clouds wrap at `x > 180` back to `-180`, and the burner
emissive pulses around 1.9–2.4.

## 6. Audio graph

```text
master (0 → masterVolume) ─► destination
   ▲
compressor (threshold -18, knee 22, ratio 4, attack .004, release .28)
   ▲                         ▲
fireBus                    ambBus
   ▲                         ▲
fire bed + crackles        room / ocean / wind / rain buses
```

- Noise: pink 6 s (seven-pole filter × 0.11), white 3 s (`random * 0.6`),
  brown 5 s (`(brown + 0.02w) / 1.02 × 3.2`), crackle 0.35 s
  (`white × (1 - i/n)^5`).
- Fire bed: pink → LP 520 Q .7 → .32; brown → LP 150 → .28; sine 44 Hz at
  .035; triangle 67 Hz at .012; 0.13 Hz LFO at .06 on the pink gain.
- Room: brown → LP 130 → .32.
- Ocean: pink → LP 780 Q .9 → .26, 0.085 Hz swell at .16; white → BP 2400 Q .5
  → .035.
- Wind: pink → BP 540 Q .55 → .30, 0.11 Hz gust at .17; white → BP 1300 Q 3.2
  → .018.
- Rain: white → HP 900 → LP 7800 → .18, 0.06 Hz LFO at .04; pink → LP 1100
  → .10.
- Crackles every 70–620 ms with 8% deep pops; waves every 6.2–12.5 s; drops
  every 55–280 ms.
- Chime: focus C5 E5 G5 C6; break G4 B4 D5; 0.16 s stagger, 1.8 s decay,
  octave shimmer.

The UI must derive its label from `sound.enabled` and `ctx.state`. The intended
preference (`settings.soundOn`) is not proof of audibility.

## 7. Timer and persistence contract

```text
remainingMs = endAt - Date.now()
fraction    = clamp(remainingMs / max(1, totalMs), 0, 1)
dashoffset  = 2π·86 · (1 - fraction)
```

- Poll every 250 ms while running.
- A natural focus completion appends exactly one entry and increments
  `sessionsCompleted`; a skip does not.
- `durationSeconds = round(totalMs / 1000)`.
- Persist `{ mode, running, remainingMs, totalMs, endAt, phaseStartAt }`.
- Restore only if `0 < endAt - Date.now() <= totalMs + 2000`.
- Recompute stats from history every time; never trust stored totals.
- The storage migration (`soundSchema < 2` → `soundOn: true`) runs exactly once.
  A schema-2 explicit mute must survive reloads.

## 8. Invariants

- One renderer, one camera, one `requestAnimationFrame` loop, three persistent
  scenes.
- `applyWorld` is the only place exposure and orbit limits change.
- Scene switches never rebuild geometry.
- No image/audio assets; no `fetch`/XHR/WebSocket in `script.js`.
- No 3D picking; all actions are DOM.
- The canvas is fixed behind the UI; panels are pointer-transparent except
  their own children.
- The five layer keys exist for all three scenes.
- A visible sound state is always true of the actual context.
- The static check must pass before a release.
