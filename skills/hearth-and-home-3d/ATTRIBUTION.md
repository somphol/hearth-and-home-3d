# Attribution

## Origin

**Hearth & Home 3D: Cozy Fireplace & Study Sanctuary** was designed and built on
2026-11-01 in an OpenCode 2.2.5 session by **DeepSeek V4.1 Flash**
(`opencode-go/deepseek-v4.1-flash`), with project concept and direction by
**Somphol Boonjing**. The released application is v1.1.0.

The original brief asked for a Stone hearth, procedural flame/ember particles, a
flickering point light, three selectable scenes, synthesized fire audio, a
volume mixer, a 25/5 Pomodoro timer, `localStorage`, and JSON session
export/import. A later request added automatic sound, selectable layers and
volume control, which became the five-layer mixer in v1.1.0.

## What is new here

The skill packages the finished app and the build knowledge as a reusable
reference:

- `assets/template/` is a byte-identical copy of the released `index.html`,
  `style.css` and `script.js`. It is not a modified or "cleaned" version.
- `SKILL.md`, `references/method.md`, `references/lessons.md` and
  `references/verification.md` are new documentation distilled from the build
  session: coordinate budget, audio graph, timer persistence contract, bugs and
  verification steps.
- The app itself is original: all geometry is built with Three.js primitives,
  all textures are generated with Canvas 2D, and all audio is synthesized with
  the Web Audio API. No stock models, texture files, recorded audio, or
  third-party UI templates are included.

## Third-party work

| Component | Version | Licence | Use |
| --- | --- | --- | --- |
| Three.js | r128 | MIT | 3D renderer, scene graph, shaders |
| OrbitControls | three@0.128.0 examples | MIT | Camera orbit/zoom |
| Fraunces | Google Fonts | SIL Open Font License 1.1 | Display serif |
| Inter | Google Fonts | SIL Open Font License 1.1 | UI sans |

Three.js and OrbitControls are loaded from public CDNs at runtime; font files
are not bundled. See the repository's `THIRD_PARTY_NOTICES.md` for URLs and
copyright lines.

## Licence status

The application and this skill are released under the repository's **MIT
licence**. The MIT text is in the repository root `LICENSE`. No licence is
asserted over the third-party components listed above; their own licences apply.

There are no secrets, credentials, personal contact details or private data in
this skill. Template files are public source from the same repository.
