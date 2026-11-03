# Verification

Three layers, in increasing cost: syntax/static checks, runtime state checks in a
browser console, and visual/manual checks. Do not skip from a green static check
to a claim that the app is visually correct.

## 1. Static checks

From the project root:

```sh
node --check script.js
node scripts/check.mjs
```

Expected:

```text
# node --check: no output, exit 0

OK <n> checks
# exit 0
```

`node scripts/check.mjs` verifies:

- required files exist (`index.html`, `style.css`, `script.js`, `README.md`,
  `AGENTS.md`, the docs set, the skill and its three template files);
- every local `src`/`href` in `index.html` resolves (http(s), `data:`, `#`,
  `mailto:` skipped);
- every relative Markdown link/image in `README.md`, `AGENTS.md`, `docs/*.md`
  and the skill resolves;
- `node --check` passes for every `.js`/`.mjs` file;
- every `.json` parses;
- `skills/hearth-and-home-3d/assets/template/{index.html,style.css,script.js}`
  is byte-identical to the release source.

If it fails, each problem is listed as `FAIL: ...`; fix paths/syntax rather than
loosening the check. The script has no npm dependencies.

Validate the skill separately:

```sh
node ~/.config/opencode/skills/skill-publish/scripts/check-skill.mjs \
  skills/hearth-and-home-3d
```

Expected one `OK hearth-and-home-3d — "<name>", <files> files, <MB>` line and
exit 0. The directory name must stay lowercase kebab-case.

## 2. Serve and probe

```sh
python3 -m http.server 8080
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/style.css
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/script.js
```

Expected `200` three times. With network access the page loads Three.js and
fonts. Without it, the timer still boots but the loader reports that the 3D
scene could not start.

## 3. Runtime state checks

Open DevTools on the page. The public API is `window.HearthHome3D`.

### Boot and scenes

```js
HearthHome3D.version                 // "1.1.0"
HearthHome3D.scene                   // "fireplace"
Object.keys(HearthHome3D.worlds)     // ["fireplace", "ocean", "sky"]
HearthHome3D.world.name              // "fireplace"
document.querySelector('#loader').style.display   // "none" after boot
document.querySelectorAll('#scene-canvas').length // 1
```

Switch:

```js
HearthHome3D.switchScene('ocean');
HearthHome3D.scene;                  // "ocean" after the tween
HearthHome3D.world.limits;           // { minDistance: 6, maxDistance: 42, ... }
```

Click the `[data-scene=sky]` and `[data-scene=fireplace]` buttons too; the
`.scene-btn.is-active` class and `aria-pressed` must follow.

### Sound truthfulness

Cold load in Chrome (no gesture yet):

```js
({ enabled: HearthHome3D.sound.enabled,
   started: HearthHome3D.sound.started,
   state: HearthHome3D.sound.ctx && HearthHome3D.sound.ctx.state,
   label: document.querySelector('.sound-label').textContent })
// label: "Tap to hear" (or "Sound On" if the browser allowed startup)
```

After clicking anywhere:

```js
HearthHome3D.sound.ctx.state         // "running"
document.querySelector('.sound-label').textContent  // "Sound On"
```

Layers and gains (allow ~1 s for ramps):

```js
HearthHome3D.settings.layers.fireplace
// { fire: true, room: true, ocean: false, wind: false, rain: false }

HearthHome3D.sound.fireBus.gain.value        // ~0.7 (fireVolume)
HearthHome3D.sound.layerGains.room.gain.value // ~1 when room is on
```

Toggle Rain and check `settings.layers[scene].rain === true`, the rain gain
rises, and the mix label becomes `Custom mix`. Switch scenes and confirm each
restores its own booleans.

Mute:

```js
// click #sound-toggle
HearthHome3D.sound.enabled            // false
HearthHome3D.sound.master.gain.value  // ~0 after ramp
localStorage.getItem('hearthHome3D.v1') // settings.soundOn === false
// reload: label "Sound Off", started false, no ctx (or muted)
```

### Timer and persistence

```js
// start
document.querySelector('#timer-start').click();
HearthHome3D.timer.running            // true
HearthHome3D.timer.endAt > Date.now() // true

// pause
document.querySelector('#timer-start').click();
HearthHome3D.timer.running            // false
```

A quick completion test (same technique used during the build):

```js
HearthHome3D.timer.mode = 'focus';
HearthHome3D.timer.totalMs = 1200;
HearthHome3D.timer.remainingMs = 1200;
HearthHome3D.timer.phaseStartAt = Date.now() - 1200;
document.querySelector('#timer-start').click();
// wait ~2.5 s
HearthHome3D.timer.mode                // "break"
HearthHome3D.profile.sessionsCompleted // +1
HearthHome3D.profile.history.at(-1).durationSeconds // 1
```

Skipping must add nothing:

```js
const before = HearthHome3D.profile.history.length;
document.querySelector('#timer-skip').click();
HearthHome3D.profile.history.length === before // true
```

Restore (manual): start a block, reload, wait for boot, and check
`HearthHome3D.timer.running` and the remaining time. The stored `endAt` must be
in the future and within `totalMs + 2000`; otherwise the timer resets to a full
block.

### Export/import

```js
// capture the Blob without downloading
let captured;
const orig = URL.createObjectURL;
URL.createObjectURL = (b) => (captured = b, orig.call(URL, b));
document.querySelector('#save-session').click();
URL.createObjectURL = orig;
const payload = JSON.parse(await captured.text());
payload.version;                 // "1.1.0"
payload.settings.layers;         // per-scene mixes
payload.profile.history.length;  // current history
```

Import the same payload twice; the second toast must say no new sessions were
found. Importing a log with new ids must add exactly those entries and recompute
stats from history.

### Mobile metrics

At 390×844:

```js
({ inner: [innerWidth, innerHeight],
   doc: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
   layout: (() => { const l = document.querySelector('.layout');
     return { client: l.clientHeight, scroll: l.scrollHeight, overflowY: getComputedStyle(l).overflowY }; })() })
```

Expected: inner and doc width both 390; `overflowY: "auto"`; `scroll > client`
(intentional internal scroll). The `.grain` layer may be reported as wider than
the viewport because it uses `inset: -50%`; that is not document overflow.

## 4. Visual checks

Capture at least:

1. Fireplace at the default camera, 1440×900 — visible flame in front of the
   logs, warm wall gradient, cool window, readable UI.
2. Ocean — sunset sky, water highlights, boat floating on the swell, lighthouse.
3. Sky — islands, balloon, cloud sea, no clipped island undersides.
4. Minimal mode — panels hidden, mini HUD visible, canvas still orbiting.
5. Mobile 390×844 — one column, bottom scene switcher, no horizontal document
   scroll.

The original build used Chrome headless with SwiftShader:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --no-first-run --no-default-browser-check \
  --user-data-dir=/tmp/hearth-profile \
  --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader \
  --window-size=1440,900 --virtual-time-budget=12000 \
  --screenshot=/tmp/hearth.png http://localhost:8080/
```

This only proves first paint. For interaction, drive the page over the DevTools
Protocol and collect `Runtime.exceptionThrown`; a clean screenshot is not a clean
console.

## 5. Expected results summary

| Check | Expected |
| --- | --- |
| `node --check script.js` | silent, exit 0 |
| `node scripts/check.mjs` | `OK <n> checks`, exit 0 |
| `check-skill.mjs` | `OK hearth-and-home-3d ...`, exit 0 |
| Local HTTP | `/`, `/style.css`, `/script.js` all 200 |
| Boot | loader gone, 1 canvas, no uncaught exceptions |
| Scenes | three buttons, correct active state, camera tween, no rebuild errors |
| Fire | visible flames/embers/smoke at the default camera |
| Sound | `Tap to hear` until gesture, then `Sound On`; gains follow chips/sliders |
| Timer | accurate countdown, one entry per completed focus block, skip adds none |
| Persistence | mute/layers/volumes survive reload; running timer restores |
| Export/import | valid JSON; id dedupe; stats recomputed from history |
| Mobile | no document horizontal scroll; internal panel scroll |

## 6. What still needs a human

- Listening: crackle density, wave timing, rain balance, chime loudness.
- Real touch: pinch zoom, one-finger orbit, iOS audio unlock.
- Safari/Firefox: shader compilation, `AudioContext` state names, `FileReader`.
- Accessibility: keyboard order, focus visibility, screen-reader labels.
- Long-run stability: a 25-minute block, repeated scene switches, memory growth.
