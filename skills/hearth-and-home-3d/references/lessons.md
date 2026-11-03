# Lessons

Bugs and dead ends from the actual build, and the regressions each one predicts.

## 1. The fire existed but was invisible

**Symptom:** the room rendered, the loader cleared, but there was no readable
fire. A CDP inspection showed the `THREE.Points` objects present with the
expected counts and shader material.

**Cause:** the composition, not the object graph — particle scale/placement and
the surrounding light/exposure did not make the flame read from the default
camera.

**Fix:** retune the fire as a camera problem: bring the flame origin in front of
the logs, verify `uScale`, increase the body particles, and give the fire a
stronger shadow-casting light plus a small fill. Confirm with a screenshot at the
default camera, not with an object count.

**Regression:** changing `uScale`, particle sizes, `toneMappingExposure`, or the
fire-light distance without a visual check can make the fire disappear again.
"Points exist" is not evidence that the fire is visible.

## 2. The fire was washed out and hidden behind the logs

**Symptom:** after the first fix, the fire was technically there but pale and
occluded.

**Fix:** raise/move the flame body relative to the log stack, adjust the glow
opacity, and balance the fire light against the room fill. The current logs sit
at `y 0.55–1.02` and the flame origin at `y 0.62, z 0.52`; the body at
`y 0.58, z 0.38`.

**Regression:** moving the logs forward, lowering the flame origin, or raising
the ambient/room fill will hide the fire again. Re-check from the default camera
and from a close orbit.

## 3. Duplicate `backPanel` broke the whole page

**Symptom:** `SyntaxError: Identifier 'backPanel' has already been declared`.
The loader stayed on screen because the entire IIFE never executed.

**Cause:** adding firebox geometry introduced a second `const backPanel` in the
same function scope.

**Fix:** remove the duplicate and add syntax verification to the edit loop
(`node --check script.js`); the original session used `new Function` as a quick
parse check before opening the browser.

**Regression:** a syntax error is fatal and invisible in a screenshot except as a
stuck loader. Always run `node --check` before judging a visual change. Browser
console errors are the second check.

## 4. Sound was off by default

**Symptom:** users opened the app, saw a silent scene, and assumed the audio was
broken. The first release shipped `soundOn: false` and an explicit Enable Sound
button.

**Fix (v1.1.0):** default `soundOn: true`, auto-start the engine 650 ms after
boot, wake it on the first pointer/key/touch, and keep a one-time
`soundSchema < 2` migration so returning visitors get the new default. Explicit
mutes after schema 2 persist.

**Regression:** re-gating sound behind a button, removing `wakeSound`, or
migrating on every load (which would override a deliberate mute) are all
user-visible regressions. Also do not label the button "Sound On" while the
context is suspended; the user cannot hear it.

## 5. Fixed scene crossfades did not satisfy "pick your sounds"

**Symptom:** the first audio design had one fixed mix per scene (`room` only in
fireplace, `ocean` in ocean, `wind` in sky). The user asked for automatic sound
*and* the ability to choose layers.

**Fix:** replace the scene crossfade with five independent layer buses (fire,
room, ocean, wind, rain), per-scene boolean mixes, and saved selections. Scene
switches now recall the scene's mix instead of forcing a fixed one.

**Regression:** collapsing back to a scene-only gain (or forgetting to add a new
scene's `DEFAULT_LAYERS`) makes the mixer lie about what is playing.

## 6. AudioContext warnings from the completion chime

**Symptom:** `The AudioContext was not allowed to start...` warnings traced
through `chime → completePhase → tickTimer` when a timer completed before any
gesture.

**Cause:** the chime tried to schedule oscillators on a suspended context.

**Fix:** the engine reports pending state honestly and the UI says **Tap to
hear**; the first gesture resumes. `chime()` still guards on `ctx`/`started`/
`enabled`, but a suspended context can still warn at the browser level.

**Regression:** do not treat the warning as proof that the app is broken. Do not
remove the guard; do not claim the chime was heard when the context never ran.

## 7. Pages deployment race

**Symptom:** `Deployment request failed ... due to in progress deployment` after
requesting a second Pages build while the previous one was still running.

**Fix:** wait for the queued deployment to finish; the successful build followed
without a force-push.

**Regression:** pushing several commits rapidly, or calling the Pages build API
in a loop, can produce a failed run that looks like a code problem. Check the
Actions run and the live commit before changing code.

## 8. Mobile "overflow" was the grain overlay

**Symptom:** a viewport audit at 390×844 reported `DIV.grain: 590` while the
document width stayed 390.

**Cause:** `.grain` uses `inset: -50%` so the animated noise covers the viewport
during translation. It is decorative and clipped by the fixed canvas stack.

**Fix:** none; document it. The real mobile behaviour is an internally scrolling
`.layout` (client 722, scroll 1076) with the scene switcher pinned at the bottom.

**Regression:** do not "fix" the grain by removing the texture or adding
`overflow: hidden` to the body without checking the atmosphere and panel
scrolling. Do not use a naive `scrollWidth > clientWidth` check on the whole
document as the only mobile gate.

## 9. Stats drifted when stored totals were trusted

**Symptom:** an imported log carried `totalFocusSeconds: 3000` but the history
only summed to 601 s. Trusting the stored total would have shown a false number.

**Fix:** `updateStats()` always recomputes totals and session count from
`profile.history`; imported history is filtered and deduplicated first.

**Regression:** if a new code path writes `profile.totalFocusSeconds` directly
without history, the next `updateStats()` will erase it. History is the source of
truth.

## 10. Timer drift if you decrement a counter

**Symptom (design-level, avoided):** a `setInterval` counter loses time when the
tab is throttled or the machine sleeps.

**Fix:** `endAt` timestamps and a 250 ms poll; completion is decided by
`endAt - Date.now()`, not by counting ticks. A restored timer is adopted only
within `totalMs + 2000` of `endAt`.

**Regression:** adding a pause that mutates `remainingMs` without clearing
`endAt`, or restoring an expired timer as if it were still running, breaks the
contract. Test a refresh during a block.

## 11. A scene without a layer default leaks the wrong mix

`SoundEngine.activeLayers()` falls back to `DEFAULT_LAYERS.fireplace` when the
scene key is missing. That is a safety net, not a feature: a new scene without
its own entry will silently play the fireplace mix. Add the scene to
`DEFAULT_LAYERS` and `updateLayerUI`'s mix names.

## 12. Import settings are only as complete as the validator

`importSessionData` accepts a subset of settings and ignores unknown fields.
If you add a setting, update both `downloadSessionLog` and
`importSessionData`; otherwise exports look complete but round-trip lossy. The
same applies to `normalizeLayers`, which rebuilds every scene/key from defaults.

## 13. Cosmetic randomness is not test state

Books, decorative stones, leaves and embers use `Math.random()` at build time.
Screenshots differ slightly between loads. Do not assert pixel equality or
object counts that include these details; assert structure and behaviour
instead.
