# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Complete repository documentation: contributing guide, code of conduct, security
  policy, changelog, issue templates, and pull request template.
- A 1200 × 630 social preview card and Open Graph / Twitter metadata for link previews.
- README refresh with a consistent header, badges, and documentation index.
- `robots.txt` and `sitemap.xml` for the GitHub Pages site.

## [1.1.0] - 2026-11-01

### Added

- Five-layer soundscape picker: Fire, Room, Waves, Wind, and Rain.
- A synthesized rain layer with filtered noise, a low body, and stereo droplets.
- Per-scene sound-layer mixes that persist across visits and are included in exported logs.
- A one-time preference migration so returning visitors get the new auto sound behaviour.
- Volume control for crackle, ambience, and master output.

### Changed

- Sound is now enabled by default. Browsers that block autoplay show **Tap to hear** and wake the audio on the first pointer or keyboard gesture.
- The mixer panel now shows layer chips alongside the volume sliders.
- Scene switches update the soundscape using that scene's saved mix instead of a fixed crossfade.
- Bumped the application and log version to 1.1.0.
