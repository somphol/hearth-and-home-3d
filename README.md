# Hearth & Home 3D

### Cozy Fireplace & Study Sanctuary

A single-page, interactive 3D focus sanctuary: a hand-built stone fireplace with a living particle fire, a synthesized crackling hearth, a Pomodoro ritual, and two quieter places to drift — a sunset ocean and a floating sky archipelago.

**Live demo:** [somphol.github.io/hearth-and-home-3d](https://somphol.github.io/hearth-and-home-3d/)

![Hearth & Home 3D — cozy fireplace](preview-fireplace.jpg)

## The experience

| 🔥 Cozy Fireplace | 🌊 Ocean Drift | ☁️ Sky Soar |
| --- | --- | --- |
| ![Fireplace](preview-fireplace.jpg) | ![Ocean](preview-ocean.jpg) | ![Sky](preview-sky.jpg) |

- **Cozy Fireplace** — a procedural study room with a stone hearth, stacked logs, a bookshelf, armchair, rug, candlelight, and a flickering fire that casts dynamic shadows.
- **Ocean Drift** — an animated sunset sea with a lantern-lit sailboat, a distant lighthouse, drifting clouds, and a custom water shader.
- **Sky Soar** — floating islands, a striped hot-air balloon, birds, a tiny cabin with a warm window, fireflies, and a sea of clouds.

Switch environments at any time without reloading. Each one brings its own soundscape and camera framing.

## Highlights

### 3D & atmosphere
- Three.js r128 with `OrbitControls`, ACES tone mapping, sRGB output, and soft shadow maps.
- Procedural canvas textures for stone, wood, rugs, night windows, book spines, framed art, clouds, and balloon fabric — no external image assets.
- A 400+ point GPU particle system for flames, embers, smoke, and dust, with a custom shader and per-particle colour, size, and alpha.
- A flickering point light inside the hearth, plus a warm room fill, window moonlight, candle glows, and an animated ember bed.
- Fireplace, ocean, and sky each have their own update loop, camera limits, fog/exposure, and ambient motion.

### Sound, synthesized live
No audio files are downloaded. The Web Audio API builds everything in the browser:
- Filtered pink/brown noise for the steady burn of the fire.
- Random high-frequency impulses with stereo panning for wood pops and crackles.
- A low sine/triangle hearth rumble and a slow-breathing fire bed.
- Separate room-tone, ocean-swell, and wind layers that crossfade with the scene.
- A gentle synthesized chime when a focus block finishes.
- Independent Crackle / Ambience / Master volume sliders.

Audio starts only after you click **Enable Sound**, respecting browser autoplay rules.

### Pomodoro ritual
- 25/5 minute focus and break blocks, fully adjustable (1–120 focus, 1–45 break).
- Timestamp-based countdown that stays accurate through tab throttling and sleep.
- Animated progress ring, auto-starting breaks, pause/resume, reset, and skip.
- Session count, minutes today, total hours, and a consecutive-day streak.
- Running timer is restored after a refresh.
- Completion chime, title-bar countdown, and a compact minimal HUD.

### Persistence & portable logs
- Statistics, settings, volumes, and the active scene are stored in `localStorage`.
- **💾 Save Study Session** downloads `fireplace_sanctuary_log.json`.
- **📂 Load Session Log** merges focus sessions from another device, deduplicating by session id.
- Everything stays local — there is no backend, account, or tracking.

## Run it

There is no build step and no package manager.

```bash
cd hearth-and-home-3d
python3 -m http.server 8080
```

Then open <http://localhost:8080>. You can also open `index.html` directly in a modern browser, though serving over HTTP is recommended.

Internet access is required for the Three.js CDN scripts and Google Fonts. The UI falls back to system serif/sans fonts if Google Fonts is unavailable.

## Controls

| Input | Action |
| --- | --- |
| Drag / one-finger drag | Orbit the scene |
| Scroll / pinch | Zoom |
| `Space` | Start / pause the timer |
| `H` | Toggle distraction-free mode |
| `1` / `2` / `3` | Fireplace / Ocean / Sky |
| `M` | Toggle sound |
| `R` | Reset the current timer |
| `Esc` | Leave distraction-free mode |

The public API is also exposed for tinkering in the console:

```js
HearthHome3D.scene            // "fireplace" | "ocean" | "sky"
HearthHome3D.timer            // current Pomodoro state
HearthHome3D.switchScene("sky")
HearthHome3D.toggleMinimal()
```

## Project structure

```
hearth-and-home-3d/
├── index.html                 # semantic UI, panels, SVG ring, loaders
├── style.css                  # warm cabin glassmorphism design system
├── script.js                  # Three.js worlds, particles, audio, timer, storage
├── preview-fireplace.jpg
├── preview-ocean.jpg
├── preview-sky.jpg
├── SESSION_STATE.json         # build telemetry for this project
├── LICENSE
└── THIRD_PARTY_NOTICES.md
```

## Study log format

```json
{
  "app": "Hearth & Home 3D",
  "version": "1.0.0",
  "exportedAt": "2026-11-01T00:00:00.000Z",
  "profile": {
    "totalFocusSeconds": 9000,
    "sessionsCompleted": 6,
    "history": [
      {
        "id": "focus_...",
        "mode": "focus",
        "startedAt": "...",
        "completedAt": "...",
        "durationSeconds": 1500,
        "scene": "fireplace"
      }
    ]
  },
  "settings": {
    "scene": "fireplace",
    "fireVolume": 0.7,
    "ambienceVolume": 0.45,
    "masterVolume": 0.8,
    "focusMinutes": 25,
    "breakMinutes": 5,
    "autoStartBreak": true
  }
}
```

Imports are validated and merged by session id, so re-importing the same log never double-counts study time.

## Build telemetry

Measured from the OpenCode session database when the app was feature-complete:

| Metric | Value |
| --- | --- |
| Build time | **33m 13s** (1,993 s) |
| Model | **DeepSeek V4.1 Flash** (`opencode-go/deepseek-v4.1-flash`) |
| Harness | OpenCode 2.2.5 |
| Non-cached tokens | **569,993** (input + cache write + output + reasoning) |
| Total tokens processed | **25,979,913** (includes 25,409,920 cache reads) |
| Measured at | 2026-11-01T08:09:25.465000Z |

The full machine-readable record — including the raw session fields, per-file deliverable sizes, and credits — is in [SESSION_STATE.json](SESSION_STATE.json). Cache reads are replayed context and are shown separately from fresh work. The final git commit and upload happen after this snapshot, so they add a small amount of usage.

## Credits

Built with **[OpenCode](https://opencode.ai)** — the open-source AI coding agent.

- **Model:** DeepSeek V4.1 Flash (`opencode-go/deepseek-v4.1-flash`)
- **Harness:** OpenCode 2.2.5
- **Project concept & direction:** Somphol Boonjing

Standing on the shoulders of:

- [Three.js](https://threejs.org/) r128 — MIT
- `OrbitControls` from the Three.js examples — MIT
- [Fraunces](https://fonts.google.com/specimen/Fraunces) and [Inter](https://fonts.google.com/specimen/Inter) — SIL Open Font License 1.1

The fire, waves, wind, crackles, and chimes are synthesized at runtime; no recorded audio is included.

## License

MIT © 2026 Somphol Boonjing. See [LICENSE](LICENSE).
