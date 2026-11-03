/* ============================================================================
   Hearth & Home 3D — Cozy Fireplace & Study Sanctuary
   Vanilla ES6 · Three.js r128 · Web Audio API
   ----------------------------------------------------------------------------
   Sections
     0.  Helpers & constants
     1.  Persistence
     2.  Procedural textures
     3.  Particle systems
     4.  3D worlds (fireplace / ocean / sky)
     5.  Renderer & scene switching
     6.  Procedural sound engine
     7.  Pomodoro timer
     8.  UI wiring
     9.  Boot
   ========================================================================== */
(function () {
  'use strict';

  /* ==========================================================================
     0. HELPERS & CONSTANTS
     ========================================================================== */
  const APP = { name: 'Hearth & Home 3D', version: '1.1.0' };
  const STORAGE_KEY = 'hearthHome3D.v1';
  const RING_CIRCUMFERENCE = 2 * Math.PI * 86;
  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TOUCH = window.matchMedia('(pointer: coarse)').matches;
  const LOW_POWER = TOUCH || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
  const DPR = Math.min(window.devicePixelRatio || 1, LOW_POWER ? 1.5 : 2);

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const pad2 = (n) => String(n).padStart(2, '0');
  const smoothstep = (edge0, edge1, x) => {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const nowISO = () => new Date().toISOString();
  const dayKey = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());

  function formatClock(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return (m < 100 ? pad2(m) : String(m)) + ':' + pad2(s);
  }

  function formatHours(seconds) {
    return (seconds / 3600).toFixed(1) + 'h';
  }

  function formatMinutes(seconds) {
    const m = Math.round(seconds / 60);
    if (m < 60) return m + 'm';
    const h = Math.floor(m / 60);
    return h + 'h ' + (m % 60) + 'm';
  }

  function relativeDate(date) {
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function debounce(fn, wait) {
    let t;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), wait);
    };
  }

  function safeNumber(value, fallback, min, max) {
    const n = parseFloat(value);
    if (!isFinite(n)) return fallback;
    return clamp(n, min, max);
  }

  /* ==========================================================================
     1. PERSISTENCE
     ========================================================================== */
  const DEFAULT_SETTINGS = {
    scene: 'fireplace',
    fireVolume: 0.7,
    ambienceVolume: 0.45,
    masterVolume: 0.8,
    focusMinutes: 25,
    breakMinutes: 5,
    autoStartBreak: true,
    minimal: false,
    soundOn: true,
    soundSchema: 2
  };

  const LAYER_KEYS = ['fire', 'room', 'ocean', 'wind', 'rain'];
  const DEFAULT_LAYERS = {
    fireplace: { fire: true, room: true, ocean: false, wind: false, rain: false },
    ocean: { fire: false, room: false, ocean: true, wind: true, rain: false },
    sky: { fire: false, room: false, ocean: false, wind: true, rain: false }
  };

  function cloneLayers(src) {
    const out = {};
    ['fireplace', 'ocean', 'sky'].forEach((scene) => {
      out[scene] = {};
      LAYER_KEYS.forEach((key) => { out[scene][key] = !!(src[scene] && src[scene][key]); });
    });
    return out;
  }

  function normalizeLayers(raw) {
    const out = cloneLayers(DEFAULT_LAYERS);
    if (!raw || typeof raw !== 'object') return out;
    ['fireplace', 'ocean', 'sky'].forEach((scene) => {
      if (raw[scene] && typeof raw[scene] === 'object') {
        LAYER_KEYS.forEach((key) => {
          if (typeof raw[scene][key] === 'boolean') out[scene][key] = raw[scene][key];
        });
      }
    });
    return out;
  }

  const settings = Object.assign({}, DEFAULT_SETTINGS, { layers: cloneLayers(DEFAULT_LAYERS) });
  const profile = {
    totalFocusSeconds: 0,
    sessionsCompleted: 0,
    history: [],
    createdAt: null,
    updatedAt: null
  };

  let savedTimerState = null;
  let storageAvailable = true;
  let lastSavedAt = null;

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        profile.createdAt = nowISO();
        return;
      }
      const data = JSON.parse(raw);
      if (data && data.settings) {
        const src = data.settings;
        if (['fireplace', 'ocean', 'sky'].indexOf(src.scene) >= 0) settings.scene = src.scene;
        settings.fireVolume = safeNumber(src.fireVolume, settings.fireVolume, 0, 1);
        settings.ambienceVolume = safeNumber(src.ambienceVolume, settings.ambienceVolume, 0, 1);
        settings.masterVolume = safeNumber(src.masterVolume, settings.masterVolume, 0, 1);
        settings.focusMinutes = safeNumber(src.focusMinutes, settings.focusMinutes, 1, 120);
        settings.breakMinutes = safeNumber(src.breakMinutes, settings.breakMinutes, 1, 45);
        settings.autoStartBreak = src.autoStartBreak !== false;
        settings.minimal = !!src.minimal;
        const soundPrefsUpgraded = !src.soundSchema || Number(src.soundSchema) < 2;
        settings.soundOn = soundPrefsUpgraded ? true : src.soundOn !== false;
        settings.soundSchema = 2;
        if (src.layers) settings.layers = normalizeLayers(src.layers);
      }
      if (data && data.profile) {
        const p = data.profile;
        profile.totalFocusSeconds = Math.max(0, Number(p.totalFocusSeconds) || 0);
        profile.sessionsCompleted = Math.max(0, Number(p.sessionsCompleted) || 0);
        profile.createdAt = p.createdAt || nowISO();
        profile.updatedAt = p.updatedAt || null;
        if (Array.isArray(p.history)) {
          profile.history = p.history.filter(isValidHistoryEntry).slice(-1200);
        }
      }
      if (data && data.savedAt) lastSavedAt = new Date(data.savedAt);
      if (data && data.timer) savedTimerState = data.timer;
    } catch (err) {
      storageAvailable = false;
      console.warn('[hearth] localStorage unavailable:', err);
    }
    if (!profile.createdAt) profile.createdAt = nowISO();
  }

  function isValidHistoryEntry(h) {
    return h && typeof h === 'object' &&
      (h.mode === 'focus' || h.mode === 'break') &&
      typeof h.id === 'string' &&
      isFinite(new Date(h.completedAt).getTime());
  }

  function persistNow() {
    profile.updatedAt = nowISO();
    lastSavedAt = new Date();
    if (!storageAvailable) return;
    try {
      const payload = {
        version: 1,
        app: APP.name,
        savedAt: Date.now(),
        settings: settings,
        profile: profile,
        timer: snapshotTimer()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      storageAvailable = false;
      console.warn('[hearth] could not save:', err);
    }
  }

  const persistSoon = debounce(persistNow, 350);

  function snapshotTimer() {
    if (typeof timer === 'undefined' || !timer) return null;
    return {
      mode: timer.mode,
      running: timer.running,
      remainingMs: timer.remainingMs,
      totalMs: timer.totalMs,
      endAt: timer.running ? timer.endAt : 0,
      phaseStartAt: timer.phaseStartAt
    };
  }

  /* ==========================================================================
     2. PROCEDURAL TEXTURES
     ========================================================================== */
  const textureCache = {};

  function makeCanvas(size, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    draw(ctx, size);
    return canvas;
  }

  function makeTexture(size, draw, repeatX, repeatY) {
    const canvas = makeCanvas(size, draw);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX || 1, repeatY || 1);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    return tex;
  }

  function stoneDraw(ctx, w) {
    const h = w;
    ctx.fillStyle = '#2b2521';
    ctx.fillRect(0, 0, w, h);
    const rows = 9;
    const rowH = h / rows;
    for (let r = 0; r < rows; r++) {
      let x = (r % 2) * -45 - 20;
      while (x < w) {
        const bw = rand(52, 106);
        const bh = rowH - rand(4, 7);
        const y = r * rowH + rand(2, 4);
        const shade = randInt(48, 84);
        ctx.fillStyle = 'rgb(' + (shade + 18) + ',' + (shade + 8) + ',' + shade + ')';
        roundedRect(ctx, x + 2, y, bw - 4, bh, 3);
        ctx.fill();
        // highlight
        ctx.fillStyle = 'rgba(255, 224, 186, ' + rand(0.03, 0.09) + ')';
        ctx.fillRect(x + 4, y + 1, bw - 8, 2);
        // shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.fillRect(x + 4, y + bh - 3, bw - 8, 3);
        // speckle
        for (let i = 0; i < 18; i++) {
          ctx.fillStyle = 'rgba(' + (Math.random() > 0.5 ? '255,225,190' : '20,14,10') + ',' + rand(0.025, 0.09) + ')';
          ctx.fillRect(x + rand(4, bw - 6), y + rand(2, bh - 3), rand(1, 4), rand(1, 3));
        }
        x += bw;
      }
    }
    // soot stain
    const grad = ctx.createRadialGradient(w * 0.5, h * 0.35, 10, w * 0.5, h * 0.4, w * 0.7);
    grad.addColorStop(0, 'rgba(15, 9, 6, 0.16)');
    grad.addColorStop(1, 'rgba(15, 9, 6, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  function woodDraw(ctx, w) {
    const h = w;
    ctx.fillStyle = '#3a2414';
    ctx.fillRect(0, 0, w, h);
    const planks = 7;
    const ph = h / planks;
    for (let i = 0; i < planks; i++) {
      const y = i * ph;
      const tone = randInt(38, 68);
      ctx.fillStyle = 'rgb(' + (tone + 18) + ',' + (tone - 4) + ',' + Math.max(10, tone - 22) + ')';
      ctx.fillRect(0, y + 1, w, ph - 2);
      // grain
      for (let g = 0; g < 22; g++) {
        ctx.strokeStyle = 'rgba(' + (Math.random() > 0.4 ? '255,215,165' : '20,10,4') + ',' + rand(0.02, 0.1) + ')';
        ctx.lineWidth = rand(0.5, 1.8);
        ctx.beginPath();
        const gy = y + rand(3, ph - 3);
        ctx.moveTo(0, gy);
        for (let x = 0; x <= w; x += 26) {
          ctx.lineTo(x, gy + Math.sin(x * 0.035 + i * 2 + g) * rand(0.6, 2.6));
        }
        ctx.stroke();
      }
      // seam
      ctx.fillStyle = 'rgba(8, 4, 2, 0.4)';
      ctx.fillRect(0, y, w, 1.5);
    }
    // knots
    for (let k = 0; k < 4; k++) {
      const kx = rand(20, w - 20);
      const ky = rand(10, h - 10);
      ctx.strokeStyle = 'rgba(15, 7, 3, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(kx, ky, rand(4, 10), rand(2, 5), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function rugDraw(ctx, w) {
    const h = w;
    ctx.fillStyle = '#5c2f24';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#b78352';
    ctx.lineWidth = 12;
    ctx.strokeRect(18, 18, w - 36, h - 36);
    ctx.strokeStyle = '#3a1b14';
    ctx.lineWidth = 5;
    ctx.strokeRect(38, 38, w - 76, h - 76);
    // diamonds
    ctx.save();
    ctx.translate(w / 2, h / 2);
    for (let ring = 0; ring < 4; ring++) {
      const s = 40 + ring * 42;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s, 0);
      ctx.lineTo(0, s);
      ctx.lineTo(-s, 0);
      ctx.closePath();
      ctx.strokeStyle = ring % 2 ? '#d9a467' : '#7e4531';
      ctx.lineWidth = ring % 2 ? 3 : 5;
      ctx.stroke();
    }
    ctx.restore();
    // border motif
    for (let i = 0; i < 24; i++) {
      const t = i / 24;
      ctx.fillStyle = i % 2 ? '#c9975d' : '#e0b27b';
      const x = 28 + t * (w - 56);
      ctx.fillRect(x, 28, 6, 6);
      ctx.fillRect(x, h - 34, 6, 6);
      const y = 28 + t * (h - 56);
      ctx.fillRect(28, y, 6, 6);
      ctx.fillRect(w - 34, y, 6, 6);
    }
    // wear
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = 'rgba(20, 10, 6, ' + rand(0.02, 0.1) + ')';
      ctx.fillRect(rand(0, w), rand(0, h), rand(1, 3), rand(1, 3));
    }
  }

  function wallpaperDraw(ctx, w) {
    const h = w;
    ctx.fillStyle = '#2c1d15';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(196, 142, 86, 0.09)';
    ctx.lineWidth = 2;
    for (let x = -h; x < w + h; x += 46) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + h, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + h, 0);
      ctx.stroke();
    }
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = 'rgba(255, 215, 170, ' + rand(0.01, 0.045) + ')';
      ctx.fillRect(rand(0, w), rand(0, h), rand(1, 2), rand(1, 2));
    }
  }

  function glowDraw(ctx, w) {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(255,255,255,0.92)');
    g.addColorStop(0.42, 'rgba(255,255,255,0.45)');
    g.addColorStop(0.72, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  }

  function flameDraw(ctx, w) {
    ctx.clearRect(0, 0, w, w);
    // soft teardrop glow
    const g = ctx.createRadialGradient(w * 0.5, w * 0.6, 0, w * 0.5, w * 0.6, w * 0.42);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.22, 'rgba(255,255,255,0.92)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.38)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.translate(w * 0.5, w * 0.5);
    ctx.scale(0.52, 1.18);
    ctx.translate(-w * 0.5, -w * 0.5);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(w * 0.5, w * 0.58, w * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // hot core
    const core = ctx.createRadialGradient(w * 0.5, w * 0.66, 0, w * 0.5, w * 0.66, w * 0.16);
    core.addColorStop(0, 'rgba(255,255,255,1)');
    core.addColorStop(0.6, 'rgba(255,255,255,0.65)');
    core.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(w * 0.5, w * 0.66, w * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }

  function sparkDraw(ctx, w) {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.16, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.38, 'rgba(255,255,255,0.4)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.07)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  }

  function cloudDraw(ctx, w) {
    ctx.clearRect(0, 0, w, w);
    const puffs = 16;
    for (let i = 0; i < puffs; i++) {
      const cx = w * rand(0.18, 0.82);
      const cy = w * rand(0.35, 0.65);
      const r = w * rand(0.12, 0.27);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(255,255,255,0.5)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.22)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // flatten base
    ctx.globalCompositeOperation = 'destination-out';
    const grad = ctx.createLinearGradient(0, w * 0.72, 0, w);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.95)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, w * 0.7, w, w * 0.3);
    ctx.globalCompositeOperation = 'source-over';
  }

  function cloudSeaDraw(ctx, w) {
    const h = w;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#fff3e2');
    g.addColorStop(0.55, '#f0e4d4');
    g.addColorStop(1, '#ddd9d3');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const cx = rand(0, w);
      const cy = rand(h * 0.05, h);
      const r = rand(28, 140);
      const puff = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      const warm = Math.random() > 0.3;
      puff.addColorStop(0, warm ? 'rgba(255,252,246,0.78)' : 'rgba(214,222,230,0.45)');
      puff.addColorStop(0.55, warm ? 'rgba(255,248,236,0.34)' : 'rgba(208,218,228,0.2)');
      puff.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = puff;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // soft shadow troughs
    for (let i = 0; i < 24; i++) {
      const cy = rand(h * 0.45, h);
      const grad = ctx.createLinearGradient(0, cy - 26, 0, cy + 26);
      grad.addColorStop(0, 'rgba(150,158,168,0)');
      grad.addColorStop(0.5, 'rgba(150,158,168,0.12)');
      grad.addColorStop(1, 'rgba(150,158,168,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, cy - 26, w, 52);
    }
  }

  function artDraw(ctx, w) {
    const h = w;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#3d4f6b');
    sky.addColorStop(0.5, '#b87a52');
    sky.addColorStop(1, '#e5b979');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    // sun
    ctx.fillStyle = 'rgba(255, 230, 172, 0.95)';
    ctx.beginPath();
    ctx.arc(w * 0.62, h * 0.38, w * 0.09, 0, Math.PI * 2);
    ctx.fill();
    // hills
    const layers = [
      { y: 0.62, col: '#57452f', amp: 0.09 },
      { y: 0.72, col: '#3e3226', amp: 0.07 },
      { y: 0.82, col: '#2a2118', amp: 0.05 }
    ];
    layers.forEach((l) => {
      ctx.fillStyle = l.col;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) {
        ctx.lineTo(x, h * l.y + Math.sin(x * 0.02 + l.y * 9) * h * l.amp);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    });
    // little cabin
    ctx.fillStyle = '#20160e';
    ctx.fillRect(w * 0.24, h * 0.7, w * 0.1, h * 0.08);
    ctx.beginPath();
    ctx.moveTo(w * 0.22, h * 0.7);
    ctx.lineTo(w * 0.29, h * 0.63);
    ctx.lineTo(w * 0.36, h * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffc46a';
    ctx.fillRect(w * 0.265, h * 0.725, w * 0.02, h * 0.025);
  }

  function nightWindowDraw(ctx, w) {
    const h = w;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#101b34');
    g.addColorStop(0.6, '#22334f');
    g.addColorStop(1, '#3a4356');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 130; i++) {
      const a = rand(0.25, 0.95);
      ctx.fillStyle = 'rgba(230, 240, 255, ' + a + ')';
      const s = rand(0.6, 2.1);
      ctx.fillRect(rand(0, w), rand(0, h * 0.8), s, s);
    }
    // moon
    const mg = ctx.createRadialGradient(w * 0.68, h * 0.28, 2, w * 0.68, h * 0.28, w * 0.18);
    mg.addColorStop(0, 'rgba(255, 247, 225, 1)');
    mg.addColorStop(0.25, 'rgba(255, 244, 215, 0.95)');
    mg.addColorStop(0.35, 'rgba(240, 228, 200, 0.3)');
    mg.addColorStop(1, 'rgba(240, 228, 200, 0)');
    ctx.fillStyle = mg;
    ctx.fillRect(0, 0, w, h);
    // moon disc
    ctx.fillStyle = '#f8f0d8';
    ctx.beginPath();
    ctx.arc(w * 0.68, h * 0.28, w * 0.075, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(190, 180, 155, 0.35)';
    ctx.beginPath();
    ctx.arc(w * 0.665, h * 0.265, w * 0.018, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(w * 0.698, h * 0.31, w * 0.012, 0, Math.PI * 2);
    ctx.fill();
    // treeline
    ctx.fillStyle = '#0b111c';
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 10) {
      ctx.lineTo(x, h * 0.82 + Math.sin(x * 0.03) * h * 0.03 + rand(0, h * 0.05));
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }

  function balloonDraw(ctx, w) {
    const h = w;
    const stripes = ['#f2d6a4', '#c96a3d', '#3f6f73', '#f2d6a4', '#c96a3d', '#3f6f73', '#e9c78c'];
    const sw = w / stripes.length;
    for (let i = 0; i < stripes.length; i++) {
      ctx.fillStyle = stripes[i];
      ctx.fillRect(i * sw, 0, sw + 1, h);
      // fabric shading
      const g = ctx.createLinearGradient(i * sw, 0, (i + 1) * sw, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.12)');
      g.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = g;
      ctx.fillRect(i * sw, 0, sw + 1, h);
    }
    // horizontal band
    ctx.fillStyle = 'rgba(40, 24, 14, 0.25)';
    ctx.fillRect(0, h * 0.55, w, h * 0.025);
  }

  function bumpDraw(ctx, w) {
    const h = w;
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, w, h);
    const rows = 9;
    const rowH = h / rows;
    for (let r = 0; r < rows; r++) {
      let x = (r % 2) * -45 - 20;
      while (x < w) {
        const bw = rand(52, 106);
        ctx.fillStyle = 'rgb(' + randInt(90, 170) + ',' + randInt(90, 170) + ',' + randInt(90, 170) + ')';
        roundedRect(ctx, x + 4, r * rowH + 4, bw - 8, rowH - 8, 3);
        ctx.fill();
        x += bw;
      }
    }
  }

  function roundedRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function getTextures() {
    if (textureCache.ready) return textureCache;
    textureCache.stone = makeTexture(512, stoneDraw, 1, 1);
    textureCache.stoneBump = makeTexture(512, bumpDraw, 1, 1);
    textureCache.stoneBump.encoding = THREE.LinearEncoding;
    textureCache.wall = makeTexture(512, stoneDraw, 4, 2.2);
    textureCache.wallBump = makeTexture(512, bumpDraw, 4, 2.2);
    textureCache.floor = makeTexture(512, woodDraw, 5, 3.5);
    textureCache.wood = makeTexture(256, woodDraw, 1, 1);
    textureCache.rug = makeTexture(512, rugDraw, 1, 1);
    textureCache.wallpaper = makeTexture(512, wallpaperDraw, 2, 2);
    textureCache.art = makeTexture(256, artDraw, 1, 1);
    textureCache.window = makeTexture(512, nightWindowDraw, 1, 1);
    textureCache.balloon = makeTexture(512, balloonDraw, 1, 1);
    textureCache.glow = makeTexture(128, glowDraw, 1, 1);
    textureCache.glow.encoding = THREE.LinearEncoding;
    textureCache.flame = makeTexture(128, flameDraw, 1, 1);
    textureCache.flame.encoding = THREE.LinearEncoding;
    textureCache.spark = makeTexture(128, sparkDraw, 1, 1);
    textureCache.spark.encoding = THREE.LinearEncoding;
    textureCache.cloud = makeTexture(256, cloudDraw, 1, 1);
    textureCache.cloud.encoding = THREE.LinearEncoding;
    textureCache.cloudSea = makeTexture(512, cloudSeaDraw, 3, 3);
    return textureCache;
  }

  /* ==========================================================================
     3. PARTICLE SYSTEMS
     ========================================================================== */
  const PARTICLE_VERTEX = [
    'attribute float aSize;',
    'attribute vec3 aColor;',
    'attribute float aAlpha;',
    'uniform float uScale;',
    'varying vec3 vColor;',
    'varying float vAlpha;',
    'void main() {',
    '  vColor = aColor;',
    '  vAlpha = aAlpha;',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  gl_PointSize = aSize * uScale / max(0.001, -mv.z);',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  const PARTICLE_FRAGMENT = [
    'uniform sampler2D uTex;',
    'varying vec3 vColor;',
    'varying float vAlpha;',
    'void main() {',
    '  vec4 t = texture2D(uTex, gl_PointCoord);',
    '  float a = t.a * vAlpha;',
    '  if (a < 0.004) discard;',
    '  gl_FragColor = vec4(vColor * t.rgb, a);',
    '}'
  ].join('\n');

  function createParticles(parent, tex, config) {
    const count = LOW_POWER ? Math.round(config.count * 0.68) : config.count;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const alphas = new Float32Array(count);
    const data = new Array(count);
    const stops = config.stops.map((s) => ({ t: s[0], c: new THREE.Color(s[1]) }));
    const tmp = new THREE.Color();

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTex: { value: tex },
        uScale: { value: 300 * DPR }
      },
      vertexShader: PARTICLE_VERTEX,
      fragmentShader: PARTICLE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: config.blending === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending
    });

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = config.renderOrder || 2;
    parent.add(points);

    function spawn(p, initial) {
      p.x = config.origin.x + rand(-config.spread.x, config.spread.x);
      p.y = config.origin.y + rand(-config.spread.y, config.spread.y);
      p.z = config.origin.z + rand(-config.spread.z, config.spread.z);
      p.vx = rand(-config.drift.x, config.drift.x);
      p.vy = rand(config.speed[0], config.speed[1]);
      p.vz = rand(-config.drift.z, config.drift.z);
      p.life = rand(config.life[0], config.life[1]);
      p.age = initial ? rand(0, p.life * 0.9) : 0;
      p.seed = rand(0, Math.PI * 2);
      p.size = rand(config.size[0], config.size[1]);
      p.spin = rand(0.6, 2.2) * (Math.random() > 0.5 ? 1 : -1);
    }

    for (let i = 0; i < count; i++) {
      const p = {};
      spawn(p, true);
      data[i] = p;
    }

    const colorAt = (k) => {
      let i = 0;
      while (i < stops.length - 2 && k > stops[i + 1].t) i++;
      const a = stops[i];
      const b = stops[i + 1] || stops[i];
      const span = Math.max(0.0001, b.t - a.t);
      const f = clamp((k - a.t) / span, 0, 1);
      tmp.copy(a.c).lerp(b.c, f);
      return tmp;
    };

    function update(t, dt) {
      for (let i = 0; i < count; i++) {
        const p = data[i];
        p.age += dt;
        if (p.age >= p.life) spawn(p, false);
        const k = clamp(p.age / p.life, 0, 1);

        if (config.gravity) p.vy -= config.gravity * dt;
        const swirl = config.swirl ? Math.sin(t * 2.2 + p.seed) * config.swirl : 0;
        const swirlZ = config.swirl ? Math.cos(t * 1.8 + p.seed * 1.3) * config.swirl * 0.55 : 0;

        p.x += (p.vx + swirl) * dt;
        p.y += p.vy * dt;
        p.z += (p.vz + swirlZ) * dt;

        const i3 = i * 3;
        positions[i3] = p.x;
        positions[i3 + 1] = p.y;
        positions[i3 + 2] = p.z;

        const c = colorAt(k);
        colors[i3] = c.r;
        colors[i3 + 1] = c.g;
        colors[i3 + 2] = c.b;

        let size = p.size;
        if (config.sizeMode === 'flame') size *= 0.55 + 0.75 * Math.sin(k * Math.PI);
        else if (config.sizeMode === 'grow') size *= 0.45 + 1.7 * k;
        else if (config.sizeMode === 'shrink') size *= 1 - 0.55 * k;
        sizes[i] = size;

        const fadeIn = smoothstep(0, config.fadeIn || 0.12, k);
        const fadeOut = 1 - smoothstep(config.fadeOut || 0.55, 1, k);
        let alpha = fadeIn * fadeOut * config.opacity;
        if (config.flicker) alpha *= 0.65 + 0.35 * Math.sin(t * config.flicker + p.seed * 7.0);
        alphas[i] = Math.max(0, alpha);
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aColor.needsUpdate = true;
      geometry.attributes.aSize.needsUpdate = true;
      geometry.attributes.aAlpha.needsUpdate = true;
    }

    return { points: points, update: update, material: material };
  }

  function createDust(parent, tex, count, bounds) {
    const n = LOW_POWER ? Math.round(count * 0.6) : count;
    const positions = new Float32Array(n * 3);
    const data = [];
    for (let i = 0; i < n; i++) {
      const p = {
        x: rand(-bounds.x, bounds.x),
        y: rand(0.2, bounds.y),
        z: rand(-bounds.z, bounds.z),
        vy: rand(0.015, 0.075),
        phase: rand(0, Math.PI * 2),
        amp: rand(0.15, 0.7)
      };
      data.push(p);
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      map: tex,
      size: 0.055,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: 0xffcf9a
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    parent.add(points);

    function update(t, dt) {
      for (let i = 0; i < n; i++) {
        const p = data[i];
        p.y += p.vy * dt;
        if (p.y > bounds.y + 0.4) {
          p.y = 0.15;
          p.x = rand(-bounds.x, bounds.x);
          p.z = rand(-bounds.z, bounds.z);
        }
        positions[i * 3] = p.x + Math.sin(t * 0.35 + p.phase) * p.amp;
        positions[i * 3 + 1] = p.y;
        positions[i * 3 + 2] = p.z + Math.cos(t * 0.28 + p.phase) * p.amp * 0.6;
      }
      geometry.attributes.position.needsUpdate = true;
    }
    return { points: points, update: update };
  }

  /* ==========================================================================
     4. 3D WORLDS
     ========================================================================== */
  const WORLDS = {};

  function makeMaterial(opts) {
    return new THREE.MeshStandardMaterial(opts);
  }

  function addBox(parent, w, h, d, mat, x, y, z, cast, receive) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = !!cast;
    mesh.receiveShadow = !!receive;
    parent.add(mesh);
    return mesh;
  }

  /* ---------------------------- FIREPLACE WORLD ---------------------------- */
  function buildFireplaceWorld() {
    const tex = getTextures();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x110a06);
    scene.fog = new THREE.FogExp2(0x160d08, 0.028);

    const wallMat = makeMaterial({ map: tex.wall, bumpMap: tex.wallBump, bumpScale: 0.09, roughness: 0.96, color: 0xd6c6b2 });
    const stoneTex = tex.stone.clone();
    stoneTex.needsUpdate = true;
    stoneTex.repeat.set(1.3, 1.3);
    const stoneBumpTex = tex.stoneBump.clone();
    stoneBumpTex.needsUpdate = true;
    stoneBumpTex.repeat.set(1.3, 1.3);
    stoneBumpTex.encoding = THREE.LinearEncoding;
    const stoneMat = makeMaterial({ map: stoneTex, bumpMap: stoneBumpTex, bumpScale: 0.1, roughness: 0.93, color: 0xc7b6a2 });
    const stoneDarkMat = makeMaterial({ map: stoneTex, bumpMap: stoneBumpTex, bumpScale: 0.12, roughness: 0.98, color: 0x94836f });
    const floorMat = makeMaterial({ map: tex.floor, roughness: 0.78, color: 0xcbb08f });
    const woodMat = makeMaterial({ map: tex.wood, roughness: 0.72, color: 0xa07b56 });
    const darkWoodMat = makeMaterial({ map: tex.wood, roughness: 0.8, color: 0x65452b });
    const sootMat = makeMaterial({ map: stoneTex, color: 0x3a2e25, roughness: 1, metalness: 0 });
    const ashMat = makeMaterial({ color: 0x2a241f, roughness: 1 });
    const ironMat = makeMaterial({ color: 0x211b17, roughness: 0.55, metalness: 0.7 });
    const fabricMat = makeMaterial({ color: 0x4e271b, roughness: 0.94 });
    const fabricDarkMat = makeMaterial({ color: 0x371810, roughness: 0.96 });
    const brassMat = makeMaterial({ color: 0xb48a4a, roughness: 0.35, metalness: 0.85 });

    /* ---- room shell ---- */
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(22, 18), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 0);
    floor.receiveShadow = true;
    scene.add(floor);

    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(22, 9), wallMat);
    backWall.position.set(0, 4.5, -6.6);
    backWall.receiveShadow = true;
    scene.add(backWall);

    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(18, 9), wallMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-11, 4.5, 0);
    leftWall.receiveShadow = true;
    scene.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(18, 9), wallMat);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(11, 4.5, 0);
    rightWall.receiveShadow = true;
    scene.add(rightWall);

    // ceiling
    const ceilingMat = makeMaterial({ color: 0x24150d, roughness: 0.95 });
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(22, 18), ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 7.0;
    scene.add(ceiling);

    // ceiling beams
    for (let i = 0; i < 5; i++) {
      addBox(scene, 22, 0.24, 0.3, darkWoodMat, 0, 6.86, -5.6 + i * 2.6, true, false);
    }
    // rug
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(5.7, 4.0), makeMaterial({ map: tex.rug, roughness: 1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0.2, 0.012, -1.45);
    rug.receiveShadow = true;
    scene.add(rug);

    /* ---- fireplace ---- */
    const fireplace = new THREE.Group();
    fireplace.position.set(0, 0, -5.0);
    scene.add(fireplace);

    // hearth slab
    addBox(fireplace, 5.6, 0.28, 2.2, stoneDarkMat, 0, 0.14, 0.55, false, true);
    addBox(fireplace, 5.2, 0.12, 2.0, stoneMat, 0, 0.3, 0.55, false, true);

    // pillars
    addBox(fireplace, 0.95, 2.95, 1.35, stoneMat, -1.75, 1.78, 0, true, true);
    addBox(fireplace, 0.95, 2.95, 1.35, stoneMat, 1.75, 1.78, 0, true, true);
    // lintel
    addBox(fireplace, 4.45, 0.66, 1.35, stoneMat, 0, 2.9, 0, true, true);
    // mantel
    addBox(fireplace, 5.15, 0.24, 1.62, woodMat, 0, 3.35, 0.14, true, true);
    addBox(fireplace, 4.85, 0.1, 1.52, darkWoodMat, 0, 3.2, 0.1, false, false);
    // corbels
    addBox(fireplace, 0.34, 0.42, 0.4, woodMat, -2.2, 3.08, 0.42, true, false);
    addBox(fireplace, 0.34, 0.42, 0.4, woodMat, 2.2, 3.08, 0.42, true, false);

    // chimney breast
    addBox(fireplace, 4.0, 3.5, 1.18, stoneMat, 0, 5.22, -0.12, true, true);
    addBox(fireplace, 4.35, 0.18, 1.32, stoneDarkMat, 0, 3.52, -0.1, false, true);
    // decorative protruding stones
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? 1 : -1;
      const piece = addBox(
        fireplace,
        rand(0.14, 0.3), rand(0.12, 0.26), rand(0.06, 0.14),
        i % 3 === 0 ? stoneDarkMat : stoneMat,
        side * rand(1.45, 2.05), rand(0.6, 2.6), 0.72,
        false, false
      );
      piece.rotation.z = rand(-0.06, 0.06);
    }

    // firebox interior
    const backPanel = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 2.32), sootMat);
    backPanel.position.set(0, 1.47, -0.57);
    fireplace.add(backPanel);
    const sideL = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.32), sootMat);
    sideL.rotation.y = Math.PI / 2;
    sideL.position.set(-1.34, 1.47, 0);
    fireplace.add(sideL);
    const sideR = sideL.clone();
    sideR.rotation.y = -Math.PI / 2;
    sideR.position.x = 1.34;
    fireplace.add(sideR);
    const fireTop = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.2), sootMat);
    fireTop.rotation.x = Math.PI / 2;
    fireTop.position.set(0, 2.62, 0);
    fireplace.add(fireTop);
    addBox(fireplace, 2.72, 0.08, 1.2, ashMat, 0, 0.34, 0.05, false, true);
    // sooty arch stones
    addBox(fireplace, 0.18, 2.5, 0.18, stoneDarkMat, -1.36, 1.55, 0.72, true, false);
    addBox(fireplace, 0.18, 2.5, 0.18, stoneDarkMat, 1.36, 1.55, 0.72, true, false);
    addBox(fireplace, 2.9, 0.18, 0.18, stoneDarkMat, 0, 2.72, 0.72, true, false);

    // glow plane behind logs
    const glowMat = new THREE.MeshBasicMaterial({
      map: tex.glow,
      color: 0xff5a10,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const glowPlane = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.3), glowMat);
    glowPlane.position.set(0, 1.0, -0.5);
    fireplace.add(glowPlane);

    const openingGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex.glow,
      color: 0xff7a2a,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));
    openingGlow.scale.set(4.2, 3.0, 1);
    openingGlow.position.set(0, 1.3, 0.95);
    fireplace.add(openingGlow);

    // andirons
    addBox(fireplace, 0.08, 0.5, 0.08, ironMat, -0.9, 0.6, 0.42, true, false);
    addBox(fireplace, 0.08, 0.5, 0.08, ironMat, 0.9, 0.6, 0.42, true, false);
    addBox(fireplace, 0.1, 0.08, 0.75, ironMat, -0.9, 0.86, 0.3, true, false);
    addBox(fireplace, 0.1, 0.08, 0.75, ironMat, 0.9, 0.86, 0.3, true, false);

    // logs
    const logMat = makeMaterial({ map: tex.wood, color: 0x5a3b22, roughness: 0.92, emissive: 0x1c0700, emissiveIntensity: 0.5 });
    const charMat = makeMaterial({ color: 0x1e120a, roughness: 1, emissive: 0x3d0f00, emissiveIntensity: 0.5 });
    const logSpecs = [
      { len: 2.05, r: 0.22, x: 0, y: 0.55, z: 0.08, ry: 0.12, rz: 0.04, mat: logMat },
      { len: 1.8, r: 0.19, x: 0.05, y: 0.55, z: 0.38, ry: -0.24, rz: -0.06, mat: logMat },
      { len: 1.72, r: 0.18, x: -0.04, y: 0.84, z: 0.24, ry: 0.32, rz: 0.15, mat: charMat },
      { len: 1.5, r: 0.15, x: 0.16, y: 1.02, z: 0.1, ry: -0.4, rz: -0.2, mat: charMat }
    ];
    logSpecs.forEach((s) => {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r * 0.92, s.len, 10), s.mat);
      log.rotation.z = Math.PI / 2 + s.rz;
      log.rotation.y = s.ry;
      log.position.set(s.x, s.y, s.z);
      log.castShadow = true;
      log.receiveShadow = true;
      fireplace.add(log);
      // glowing end
      const endGlow = new THREE.Mesh(
        new THREE.CircleGeometry(s.r * 0.7, 10),
        new THREE.MeshBasicMaterial({ color: 0xff5a12, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      endGlow.position.set(s.x + s.len / 2 - 0.01, s.y, s.z);
      endGlow.rotation.y = Math.PI / 2;
      fireplace.add(endGlow);
    });

    // ember rocks
    const emberMat = new THREE.MeshStandardMaterial({
      color: 0x3a1608, emissive: 0xff4d0a, emissiveIntensity: 1.3, roughness: 0.85
    });
    const emberGeom = new THREE.IcosahedronGeometry(0.09, 0);
    for (let i = 0; i < 22; i++) {
      const e = new THREE.Mesh(emberGeom, emberMat);
      e.position.set(rand(-1.0, 1.0), rand(0.36, 0.48), rand(-0.35, 0.5));
      e.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
      e.scale.setScalar(rand(0.5, 1.3));
      fireplace.add(e);
    }

    // fire particles
    const flames = createParticles(fireplace, tex.flame, {
      count: 320,
      origin: { x: 0, y: 0.62, z: 0.52 },
      spread: { x: 0.58, y: 0.08, z: 0.16 },
      drift: { x: 0.2, z: 0.08 },
      speed: [0.9, 1.7],
      life: [0.7, 1.5],
      size: [0.28, 0.62],
      sizeMode: 'flame',
      opacity: 0.9,
      swirl: 0.16,
      gravity: 0.1,
      fadeIn: 0.08,
      fadeOut: 0.48,
      stops: [
        [0, 0xffe9a8], [0.2, 0xffb84a], [0.45, 0xff7a1a],
        [0.75, 0xe23a0e], [1, 0x5a0e00]
      ]
    });
    const flameBody = createParticles(fireplace, tex.flame, {
      count: 110,
      origin: { x: 0, y: 0.58, z: 0.38 },
      spread: { x: 0.62, y: 0.1, z: 0.16 },
      drift: { x: 0.14, z: 0.06 },
      speed: [0.5, 1.0],
      life: [1.0, 1.9],
      size: [0.55, 1.05],
      sizeMode: 'flame',
      opacity: 0.36,
      swirl: 0.26,
      gravity: 0.05,
      fadeIn: 0.14,
      fadeOut: 0.45,
      stops: [[0, 0xffc766], [0.35, 0xff7a1a], [0.7, 0xd63a0c], [1, 0x4a0a00]]
    });
    const embers = createParticles(fireplace, tex.spark, {
      count: 72,
      origin: { x: 0, y: 0.66, z: 0.48 },
      spread: { x: 0.66, y: 0.14, z: 0.2 },
      drift: { x: 0.25, z: 0.18 },
      speed: [1.2, 2.5],
      life: [1.5, 3.4],
      size: [0.045, 0.11],
      sizeMode: 'shrink',
      opacity: 0.95,
      swirl: 0.4,
      gravity: -0.05,
      fadeIn: 0.04,
      fadeOut: 0.35,
      flicker: 14,
      stops: [[0, 0xfff3c0], [0.35, 0xffb347], [0.75, 0xff6a1a], [1, 0xc72900]]
    });
    const smoke = createParticles(fireplace, tex.glow, {
      count: 32,
      origin: { x: 0, y: 1.45, z: 0.3 },
      spread: { x: 0.45, y: 0.3, z: 0.16 },
      drift: { x: 0.07, z: 0.04 },
      speed: [0.28, 0.5],
      life: [2.6, 5.2],
      size: [0.45, 1.0],
      sizeMode: 'grow',
      opacity: 0.07,
      swirl: 0.14,
      gravity: 0,
      fadeIn: 0.2,
      fadeOut: 0.38,
      blending: 'normal',
      renderOrder: 1,
      stops: [[0, 0x5c4a3c], [0.5, 0x6b5c50], [1, 0x3c342d]]
    });
    const dust = createDust(scene, tex.glow, 110, { x: 8, y: 6.4, z: 8 });

    // candle(s) on mantel
    const candleMat = makeMaterial({ color: 0xe8d7b6, roughness: 0.8, emissive: 0x2a1200, emissiveIntensity: 0.2 });
    const candleFlameMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95 });
    const candleLights = [];
    [
      { x: -1.7, h: 0.55, z: 0.66 },
      { x: 1.85, h: 0.38, z: 0.66 }
    ].forEach((c) => {
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, c.h, 12), candleMat);
      candle.position.set(c.x, 3.47 + c.h / 2, c.z);
      candle.castShadow = true;
      fireplace.add(candle);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 8), candleFlameMat);
      flame.position.set(c.x, 3.47 + c.h + 0.09, c.z);
      fireplace.add(flame);
      const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex.glow, color: 0xffb347, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      glowSprite.scale.set(0.55, 0.55, 1);
      glowSprite.position.copy(flame.position);
      fireplace.add(glowSprite);
      candleLights.push({ flame: glowSprite, base: 0.5, seed: rand(0, 9) });
    });

    // mantel books + plant + frame
    const bookColors = [0x6f2f22, 0x334a3c, 0x5e5128, 0x393048, 0x7a5027];
    for (let i = 0; i < 4; i++) {
      const b = addBox(fireplace, 0.48 - i * 0.025, 0.075, 0.34, makeMaterial({ color: bookColors[i], roughness: 0.9 }),
        0.55, 3.47 + i * 0.078, 0.62, true, false);
      b.rotation.y = rand(-0.12, 0.12);
    }
    const art = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.7), new THREE.MeshBasicMaterial({ map: tex.art }));
    art.position.set(0, 4.25, 0.48);
    fireplace.add(art);
    addBox(fireplace, 1.15, 0.85, 0.06, darkWoodMat, 0, 4.25, 0.43, true, false);
    art.position.z = 0.47;

    // mantel clock
    const clockBody = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.1, 20), brassMat);
    clockBody.rotation.x = Math.PI / 2;
    clockBody.position.set(-0.85, 3.72, 0.6);
    clockBody.castShadow = true;
    fireplace.add(clockBody);
    const clockFace = new THREE.Mesh(new THREE.CircleGeometry(0.155, 20), new THREE.MeshBasicMaterial({ color: 0xefe0c4 }));
    clockFace.position.set(-0.85, 3.72, 0.655);
    fireplace.add(clockFace);
    const handMat = new THREE.MeshBasicMaterial({ color: 0x2a1a10 });
    const clockHand = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.1), handMat);
    clockHand.position.set(-0.85, 3.745, 0.66);
    clockHand.rotation.z = 0.4;
    fireplace.add(clockHand);
    const clockHand2 = new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.065), handMat);
    clockHand2.position.set(-0.865, 3.735, 0.661);
    clockHand2.rotation.z = 1.9;
    fireplace.add(clockHand2);

    // small plant on hearth
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.28, 10), makeMaterial({ color: 0x7a4b32, roughness: 0.9 }));
    pot.position.set(-2.35, 0.44, 0.7);
    pot.castShadow = true;
    fireplace.add(pot);
    const leafMat = makeMaterial({ color: 0x395536, roughness: 0.8 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + rand(-0.2, 0.2);
      const tilt = rand(0.35, 0.7);
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(rand(0.045, 0.07), rand(0.5, 0.75), 5), leafMat);
      leaf.scale.z = 0.35;
      leaf.position.set(-2.35 + Math.cos(a) * 0.07, 0.68 + rand(0, 0.08), 0.7 + Math.sin(a) * 0.07);
      leaf.rotation.z = -Math.cos(a) * tilt;
      leaf.rotation.x = Math.sin(a) * tilt;
      fireplace.add(leaf);
    }

    /* ---- bookshelf ---- */
    const shelf = new THREE.Group();
    shelf.position.set(-5.2, 0, -6.0);
    scene.add(shelf);
    addBox(shelf, 3.0, 4.7, 0.3, darkWoodMat, 0, 2.35, -0.22, true, true);
    addBox(shelf, 0.22, 4.7, 0.75, woodMat, -1.5, 2.35, 0, true, true);
    addBox(shelf, 0.22, 4.7, 0.75, woodMat, 1.5, 2.35, 0, true, true);
    addBox(shelf, 3.0, 0.2, 0.75, woodMat, 0, 4.62, 0, true, true);
    addBox(shelf, 3.0, 0.2, 0.75, woodMat, 0, 0.12, 0, true, true);
    const bookPalette = [0x5f241b, 0x233b34, 0x51431f, 0x33283e, 0x6a4320, 0x2c4054, 0x4f2b33, 0x3c472a, 0x6a5438];
    const bookMats = bookPalette.map((c) => makeMaterial({ color: c, roughness: 0.88 }));
    const shelfYs = [0.95, 1.82, 2.69, 3.56];
    shelfYs.forEach((sy) => {
      addBox(shelf, 2.8, 0.12, 0.7, woodMat, 0, sy, 0, true, true);
      let x = -1.3;
      while (x < 1.25) {
        const bw = rand(0.07, 0.16);
        const bh = rand(0.45, 0.75);
        const book = addBox(shelf, bw, bh, rand(0.3, 0.44), choice(bookMats), x, sy + 0.06 + bh / 2, 0.02, true, true);
        book.rotation.z = Math.random() < 0.08 ? rand(-0.22, 0.22) : 0;
        x += bw + rand(0.008, 0.03);
      }
    });

    /* ---- armchair ---- */
    const chair = new THREE.Group();
    chair.position.set(4.15, 0, -1.35);
    chair.rotation.y = -1.75;
    scene.add(chair);
    addBox(chair, 1.55, 0.42, 1.45, fabricDarkMat, 0, 0.47, 0, true, true);
    const cushion = addBox(chair, 1.48, 0.28, 1.36, fabricMat, 0, 0.76, 0.04, true, true);
    cushion.rotation.x = -0.02;
    const chairBack = addBox(chair, 1.55, 1.45, 0.34, fabricDarkMat, 0, 1.42, -0.62, true, false);
    chairBack.rotation.x = -0.1;
    const backRoll = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 1.54, 12), fabricDarkMat);
    backRoll.rotation.z = Math.PI / 2;
    backRoll.position.set(0, 2.12, -0.62);
    backRoll.castShadow = true;
    chair.add(backRoll);
    const backCushion = addBox(chair, 1.36, 1.1, 0.22, fabricMat, 0, 1.32, -0.42, true, false);
    backCushion.rotation.x = -0.12;
    // wings
    const wingL = addBox(chair, 0.16, 1.0, 0.48, fabricDarkMat, -0.76, 1.62, -0.4, true, false);
    wingL.rotation.y = 0.16;
    const wingR = addBox(chair, 0.16, 1.0, 0.48, fabricDarkMat, 0.76, 1.62, -0.4, true, false);
    wingR.rotation.y = -0.16;
    addBox(chair, 0.24, 0.72, 1.4, fabricDarkMat, -0.88, 1.0, 0, true, false);
    addBox(chair, 0.24, 0.72, 1.4, fabricDarkMat, 0.88, 1.0, 0, true, false);
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.4, 10), fabricMat);
    armL.rotation.x = Math.PI / 2;
    armL.position.set(-0.88, 1.38, 0);
    armL.castShadow = true;
    chair.add(armL);
    const armR = armL.clone();
    armR.position.x = 0.88;
    chair.add(armR);
    [[-0.66, -0.58], [0.66, -0.58], [-0.66, 0.58], [0.66, 0.58]].forEach((p) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.36, 8), woodMat);
      leg.position.set(p[0], 0.18, p[1]);
      leg.castShadow = true;
      chair.add(leg);
    });
    const pillow = addBox(chair, 0.55, 0.52, 0.16, makeMaterial({ color: 0xa8743f, roughness: 0.95 }), 0.32, 1.15, -0.16, true, false);
    pillow.rotation.z = 0.18;
    pillow.rotation.x = -0.18;
    // throw blanket
    const blanket = addBox(chair, 0.5, 0.06, 0.85, makeMaterial({ color: 0x8a5632, roughness: 1 }), -0.85, 1.47, 0.22, true, false);
    blanket.rotation.z = 0.06;

    /* ---- side table + lamp ---- */
    const table = new THREE.Group();
    table.position.set(5.65, 0, 0.15);
    scene.add(table);
    const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.09, 24), woodMat);
    tableTop.position.y = 0.68;
    tableTop.castShadow = true;
    tableTop.receiveShadow = true;
    table.add(tableTop);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.62, 10), darkWoodMat);
    stem.position.y = 0.36;
    stem.castShadow = true;
    table.add(stem);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.06, 16), darkWoodMat);
    base.position.y = 0.04;
    table.add(base);
    // mug
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.22, 14, 1, true), makeMaterial({ color: 0x9c8a73, roughness: 0.6, side: THREE.DoubleSide }));
    mug.position.set(0.3, 0.84, 0.05);
    mug.castShadow = true;
    table.add(mug);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 6, 12, Math.PI), makeMaterial({ color: 0x9c8a73, roughness: 0.6 }));
    handle.position.set(0.44, 0.84, 0.05);
    handle.rotation.z = -Math.PI / 2;
    table.add(handle);
    // lamp
    const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.12, 14), brassMat);
    lampBase.position.set(-0.24, 0.76, -0.02);
    lampBase.castShadow = true;
    table.add(lampBase);
    const lampStem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.55, 8), brassMat);
    lampStem.position.set(-0.24, 1.06, -0.02);
    table.add(lampStem);
    const shadeMat = makeMaterial({
      color: 0xf4d6a2, emissive: 0xffb45e, emissiveIntensity: 0.85, roughness: 0.9,
      transparent: true, opacity: 0.92, side: THREE.DoubleSide
    });
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.42, 0.42, 18, 1, true), shadeMat);
    shade.position.set(-0.24, 1.42, -0.02);
    table.add(shade);
    const lampLight = new THREE.PointLight(0xffb46b, 0.55, 7, 2);
    lampLight.position.set(5.65 - 0.24, 1.36, 0.15 - 0.02);
    scene.add(lampLight);

    /* ---- window on right wall ---- */
    const windowGroup = new THREE.Group();
    windowGroup.position.set(10.93, 3.15, -1.8);
    windowGroup.rotation.y = -Math.PI / 2;
    scene.add(windowGroup);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 2.5), new THREE.MeshBasicMaterial({ map: tex.window }));
    windowGroup.add(glass);
    addBox(windowGroup, 3.5, 0.16, 0.18, darkWoodMat, 0, 1.4, 0.06, true, false);
    addBox(windowGroup, 3.5, 0.16, 0.18, darkWoodMat, 0, -1.4, 0.06, true, false);
    addBox(windowGroup, 0.16, 2.95, 0.18, darkWoodMat, -1.65, 0, 0.06, true, false);
    addBox(windowGroup, 0.16, 2.95, 0.18, darkWoodMat, 1.65, 0, 0.06, true, false);
    addBox(windowGroup, 0.08, 2.72, 0.12, darkWoodMat, 0, 0, 0.06, false, false);
    addBox(windowGroup, 3.2, 0.08, 0.12, darkWoodMat, 0, 0.2, 0.06, false, false);
    addBox(windowGroup, 3.6, 0.1, 0.4, stoneDarkMat, 0, -1.52, 0.15, true, true);

    /* ---- wall art & details ---- */
    const wallArt = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.15), new THREE.MeshBasicMaterial({ map: tex.art }));
    wallArt.position.set(-2.55, 4.4, -6.55);
    scene.add(wallArt);
    addBox(scene, 1.9, 0.07, 0.08, darkWoodMat, -2.55, 5.0, -6.52, false, false);
    addBox(scene, 1.9, 0.07, 0.08, darkWoodMat, -2.55, 3.8, -6.52, false, false);
    addBox(scene, 0.07, 1.25, 0.08, darkWoodMat, -3.4, 4.4, -6.52, false, false);
    addBox(scene, 0.07, 1.25, 0.08, darkWoodMat, -1.7, 4.4, -6.52, false, false);

    // floor plant in corner
    const bigPot = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.3, 0.55, 12), makeMaterial({ color: 0x6b4a38, roughness: 0.95 }));
    bigPot.position.set(-7.9, 0.28, -4.7);
    bigPot.castShadow = true;
    scene.add(bigPot);
    const bigLeafMat = makeMaterial({ color: 0x33502f, roughness: 0.85 });
    const bigLeafLight = makeMaterial({ color: 0x476b3c, roughness: 0.85 });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + rand(-0.15, 0.15);
      const tilt = rand(0.3, 0.75);
      const h = rand(1.2, 2.0);
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(rand(0.06, 0.1), h, 5), i % 3 ? bigLeafMat : bigLeafLight);
      leaf.scale.z = 0.3;
      leaf.position.set(-7.9 + Math.cos(a) * 0.12, 0.55 + h / 2, -4.7 + Math.sin(a) * 0.12);
      leaf.rotation.z = -Math.cos(a) * tilt;
      leaf.rotation.x = Math.sin(a) * tilt;
      leaf.castShadow = true;
      scene.add(leaf);
    }

    /* ---- lighting ---- */
    scene.add(new THREE.HemisphereLight(0x5b6d8c, 0x2b170a, 0.5));
    scene.add(new THREE.AmbientLight(0xffc38a, 0.25));
    const fireLight = new THREE.PointLight(0xff8a3a, 1.8, 22, 2);
    fireLight.position.set(0, 1.35, -4.05);
    fireLight.castShadow = true;
    fireLight.shadow.mapSize.set(LOW_POWER ? 512 : 1024, LOW_POWER ? 512 : 1024);
    fireLight.shadow.camera.near = 0.25;
    fireLight.shadow.camera.far = 22;
    fireLight.shadow.bias = -0.0012;
    fireLight.shadow.radius = 3;
    scene.add(fireLight);

    const roomFill = new THREE.PointLight(0xffa860, 0.3, 15, 2);
    roomFill.position.set(0, 4.6, -1.2);
    scene.add(roomFill);

    const fireFill = new THREE.PointLight(0xff4d12, 0.55, 6, 2);
    fireFill.position.set(0, 0.95, -4.75);
    scene.add(fireFill);

    const moonLight = new THREE.DirectionalLight(0x8fb4ff, 0.32);
    moonLight.position.set(9, 6, 2);
    scene.add(moonLight);

    const emberLight = new THREE.PointLight(0xff6a1a, 0.22, 5, 2);
    emberLight.position.set(0, 0.7, -4.6);
    scene.add(emberLight);

    /* ---- update ---- */
    let flick = 0;
    function update(t, dt) {
      flames.update(t, dt);
      flameBody.update(t, dt);
      embers.update(t, dt);
      smoke.update(t, dt);
      dust.update(t, dt);

      // fire flicker
      flick += (Math.random() - 0.5) * dt * 3.2;
      flick *= 0.94;
      const f = 0.86 + 0.1 * Math.sin(t * 9.3) * Math.sin(t * 4.1) + 0.06 * Math.sin(t * 22.7 + 1.4) + flick * 0.35;
      fireLight.intensity = 1.8 * clamp(f, 0.55, 1.2);
      fireLight.position.x = Math.sin(t * 6.4) * 0.06;
      fireLight.position.y = 1.35 + Math.sin(t * 8.7 + 1.2) * 0.04;
      fireFill.intensity = 0.45 + Math.sin(t * 12.1) * 0.1 + flick * 0.25;
      emberLight.intensity = 0.18 + Math.sin(t * 17.3) * 0.05;
      glowMat.opacity = 0.26 + 0.08 * Math.sin(t * 8.1) + 0.04 * Math.sin(t * 19.7);
      openingGlow.material.opacity = 0.07 + 0.025 * Math.sin(t * 7.3) + 0.012 * Math.sin(t * 17.1);

      candleLights.forEach((c) => {
        const v = 0.34 + 0.16 * Math.sin(t * 11 + c.seed) * Math.sin(t * 5.3 + c.seed) + Math.sin(t * 19 + c.seed) * 0.04;
        c.flame.material.opacity = clamp(v + 0.28, 0.2, 0.85);
        c.flame.scale.setScalar(0.46 + Math.sin(t * 9 + c.seed) * 0.05);
      });
      lampLight.intensity = 0.52 + Math.sin(t * 2.1) * 0.02;
      emberMat.emissiveIntensity = 1.1 + Math.sin(t * 6.7) * 0.25;
    }

    return {
      name: 'fireplace',
      scene: scene,
      position: new THREE.Vector3(0.45, 2.95, 6.2),
      target: new THREE.Vector3(0, 2.0, -2.45),
      exposure: 1.08,
      limits: { minDistance: 4, maxDistance: 8.6, minPolar: 1.0, maxPolar: 1.62, minAzimuth: -0.95, maxAzimuth: 0.95 },
      update: update
    };
  }

  /* ------------------------------ OCEAN WORLD ------------------------------ */
  function buildOceanWorld() {
    const tex = getTextures();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a3550);
    const sunDir = new THREE.Vector3(-0.38, 0.2, -0.9).normalize();

    // lights
    const sunLight = new THREE.DirectionalLight(0xffc58a, 1.35);
    sunLight.position.copy(sunDir).multiplyScalar(100);
    scene.add(sunLight);
    scene.add(new THREE.HemisphereLight(0x8fb4d9, 0x163240, 0.75));
    scene.add(new THREE.AmbientLight(0xffd6b0, 0.12));

    // sky dome
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: { value: sunDir },
        uTop: { value: new THREE.Color(0x0d1d3d) },
        uMid: { value: new THREE.Color(0x7d6076) },
        uLow: { value: new THREE.Color(0xffb27a) }
      },
      vertexShader: [
        'varying vec3 vWorld;',
        'void main() {',
        '  vWorld = position;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uSunDir;',
        'uniform vec3 uTop;',
        'uniform vec3 uMid;',
        'uniform vec3 uLow;',
        'varying vec3 vWorld;',
        'void main() {',
        '  vec3 dir = normalize(vWorld);',
        '  float y = dir.y;',
        '  vec3 col = mix(uLow, uMid, smoothstep(-0.04, 0.28, y));',
        '  col = mix(col, uTop, smoothstep(0.18, 0.9, y));',
        '  float sun = pow(max(dot(dir, uSunDir), 0.0), 800.0);',
        '  float glow = pow(max(dot(dir, uSunDir), 0.0), 14.0);',
        '  col += vec3(1.0, 0.78, 0.5) * sun * 2.0;',
        '  col += vec3(1.0, 0.45, 0.2) * glow * 0.32;',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n'),
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 20), skyMat);
    sky.renderOrder = -10;
    scene.add(sky);

    // sun sprite
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex.glow, color: 0xffe0b0, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    }));
    sun.scale.set(34, 34, 1);
    sun.position.copy(sunDir).multiplyScalar(240);
    scene.add(sun);

    // water
    const waterUniforms = { uTime: { value: 0 } };
    const waterGeo = new THREE.PlaneGeometry(700, 700, 150, 150);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.ShaderMaterial({
      uniforms: waterUniforms,
      vertexShader: [
        'uniform float uTime;',
        'varying vec3 vWorld;',
        'varying vec3 vNormalW;',
        'varying float vHeight;',
        'float wave(vec2 p, float t) {',
        '  return sin(p.x * 0.32 + t * 0.8) * 0.26',
        '       + sin(p.y * 0.45 - t * 0.62) * 0.18',
        '       + sin((p.x + p.y) * 0.16 + t * 0.45) * 0.3',
        '       + sin((p.x * 0.85 - p.y * 0.55) + t * 1.5) * 0.07;',
        '}',
        'void main() {',
        '  vec3 p = position;',
        '  float h = wave(p.xz, uTime);',
        '  p.y += h;',
        '  vHeight = h;',
        '  float e = 0.55;',
        '  float hx = wave(p.xz + vec2(e, 0.0), uTime) - wave(p.xz - vec2(e, 0.0), uTime);',
        '  float hz = wave(p.xz + vec2(0.0, e), uTime) - wave(p.xz - vec2(0.0, e), uTime);',
        '  vNormalW = normalize(vec3(-hx / (2.0 * e), 1.0, -hz / (2.0 * e)));',
        '  vec4 world = modelMatrix * vec4(p, 1.0);',
        '  vWorld = world.xyz;',
        '  gl_Position = projectionMatrix * viewMatrix * world;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform float uTime;',
        'varying vec3 vWorld;',
        'varying vec3 vNormalW;',
        'varying float vHeight;',
        'void main() {',
        '  vec3 N = normalize(vNormalW);',
        '  vec3 V = normalize(cameraPosition - vWorld);',
        '  vec3 sunDir = normalize(vec3(-0.38, 0.2, -0.9));',
        '  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);',
        '  vec3 deep = vec3(0.016, 0.075, 0.13);',
        '  vec3 shallow = vec3(0.045, 0.23, 0.29);',
        '  vec3 col = mix(deep, shallow, clamp(vHeight * 0.9 + 0.5, 0.0, 1.0));',
        '  vec3 refl = mix(vec3(0.98, 0.6, 0.36), vec3(0.25, 0.42, 0.7), smoothstep(0.0, 1.0, N.y));',
        '  col = mix(col, refl, fres * 0.9);',
        '  vec3 R = reflect(-sunDir, N);',
        '  float spec = pow(max(dot(R, V), 0.0), 320.0);',
        '  col += vec3(1.0, 0.72, 0.42) * spec * 1.4;',
        '  float sparkle = pow(max(dot(R, V), 0.0), 900.0) * (0.5 + 0.5 * sin(vWorld.x * 3.0 + vWorld.z * 2.0 + uTime * 4.0));',
        '  col += vec3(1.0, 0.9, 0.7) * sparkle * 2.0;',
        '  float foam = smoothstep(0.68, 1.0, vHeight) * 0.1;',
        '  col += vec3(0.95, 0.9, 0.84) * foam;',
        '  float dist = length(vWorld.xz - cameraPosition.xz);',
        '  float haze = smoothstep(70.0, 300.0, dist);',
        '  col = mix(col, vec3(0.62, 0.47, 0.42), haze * 0.72);',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n')
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.y = 0;
    scene.add(water);

    // boat
    const boat = new THREE.Group();
    boat.position.set(2.6, 0, 2.4);
    boat.scale.setScalar(1.22);
    scene.add(boat);
    const hullMat = makeMaterial({ color: 0x6d3f25, roughness: 0.8 });
    const hullInner = makeMaterial({ color: 0x2c1c12, roughness: 1 });
    const trimMat = makeMaterial({ color: 0xb98a53, roughness: 0.7 });
    const hull = new THREE.Mesh(
      new THREE.SphereGeometry(1, 22, 12, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5),
      hullMat
    );
    hull.scale.set(1.05, 0.62, 2.25);
    hull.position.y = 0.24;
    boat.add(hull);
    const inner = new THREE.Mesh(
      new THREE.SphereGeometry(0.96, 20, 10, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.42),
      hullInner
    );
    inner.scale.set(1.0, 0.5, 2.1);
    inner.position.y = 0.3;
    boat.add(inner);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 40), trimMat);
    rim.rotation.x = Math.PI / 2;
    rim.scale.set(1.04, 2.24, 1);
    rim.position.y = 0.55;
    boat.add(rim);
    // seats
    for (let i = 0; i < 2; i++) {
      const seat = addBox(boat, 1.5, 0.08, 0.38, trimMat, 0, 0.5, -0.7 + i * 1.4, true, true);
      seat.rotation.y = 0;
    }

    // mast and sail
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 2.6, 8), trimMat);
    mast.position.set(0, 1.75, -0.15);
    boat.add(mast);
    const sailGeo = new THREE.BufferGeometry();
    sailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      0, 3.0, -0.15,
      -1.2, 1.25, -0.15,
      1.05, 1.25, -0.15
    ]), 3));
    sailGeo.computeVertexNormals();
    const sail = new THREE.Mesh(sailGeo, new THREE.MeshStandardMaterial({
      color: 0xf0ddba, roughness: 0.92, side: THREE.DoubleSide
    }));
    boat.add(sail);
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.3, 6), trimMat);
    boom.rotation.z = Math.PI / 2;
    boom.position.set(-0.07, 1.25, -0.15);
    boat.add(boom);
    const riggingMat = new THREE.LineBasicMaterial({ color: 0x3a2a1c, transparent: true, opacity: 0.7 });
    [
      [[0, 3.0, -0.15], [0, 0.55, -2.0]],
      [[0, 3.0, -0.15], [0, 0.55, 2.0]]
    ].forEach((pair) => {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pair.map((p) => new THREE.Vector3(p[0], p[1], p[2]))),
        riggingMat
      );
      boat.add(line);
    });

    // oars
    for (let i = 0; i < 2; i++) {
      const oar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 8), trimMat);
      oar.rotation.z = Math.PI / 2;
      oar.rotation.x = 0.2;
      oar.position.set(i === 0 ? -0.8 : 0.8, 0.74, 0.1);
      boat.add(oar);
      const blade = addBox(boat, 0.42, 0.04, 0.22, trimMat, i === 0 ? -1.85 : 1.85, 0.74, 0.31, false, false);
      blade.rotation.z = 0.1;
    }
    // lantern at prow
    const lanternPost = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.8, 8), ironMat());
    lanternPost.position.set(0, 0.9, 1.55);
    boat.add(lanternPost);
    const lantern = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.14, 0.3, 8),
      new THREE.MeshStandardMaterial({ color: 0xffc06a, emissive: 0xff8a2a, emissiveIntensity: 1.5, roughness: 0.5, transparent: true, opacity: 0.9 })
    );
    lantern.position.set(0, 1.3, 1.55);
    boat.add(lantern);
    const boatGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex.glow, color: 0xffb35e, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    boatGlow.scale.set(1.6, 1.6, 1);
    boatGlow.position.set(0, 1.3, 1.55);
    boat.add(boatGlow);
    const boatLight = new THREE.PointLight(0xffa04a, 0.8, 9, 2);
    boatLight.position.set(0, 1.35, 1.55);
    boat.add(boatLight);

    // distant islet + lighthouse
    const islet = new THREE.Group();
    islet.position.set(-34, 0, -62);
    scene.add(islet);
    const rockMat = makeMaterial({ color: 0x4b4038, roughness: 1, flatShading: true });
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(6, 0), rockMat);
    rock.scale.set(1.4, 0.75, 1.2);
    rock.position.y = -0.5;
    islet.add(rock);
    const grass = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.0, 0.5, 14), makeMaterial({ color: 0x40533a, roughness: 1 }));
    grass.position.y = 2.4;
    grass.scale.set(1.35, 1, 1.1);
    islet.add(grass);
    const towerMat = makeMaterial({ color: 0xe4ddce, roughness: 0.8 });
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.45, 9, 16), towerMat);
    tower.position.y = 7.2;
    islet.add(tower);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.3, 1.4, 16), makeMaterial({ color: 0xa4462f, roughness: 0.8 }));
    stripe.position.y = 8.2;
    islet.add(stripe);
    const lanternRoom = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.2, 12), new THREE.MeshStandardMaterial({
      color: 0xffe0a0, emissive: 0xffb347, emissiveIntensity: 2.2, roughness: 0.3
    }));
    lanternRoom.position.y = 12.1;
    islet.add(lanternRoom);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.15, 1.2, 12), makeMaterial({ color: 0x5c2c22, roughness: 0.8 }));
    cap.position.y = 13.3;
    islet.add(cap);
    const lighthouseGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex.glow, color: 0xffd79b, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    lighthouseGlow.scale.set(12, 12, 1);
    lighthouseGlow.position.y = 12.1;
    islet.add(lighthouseGlow);

    // clouds at horizon
    const clouds = [];
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex.cloud, color: 0xffd9ba, transparent: true,
        opacity: rand(0.35, 0.72), depthWrite: false
      });
      const s = new THREE.Sprite(mat);
      const sc = rand(26, 70);
      s.scale.set(sc, sc * rand(0.32, 0.5), 1);
      s.position.set(rand(-170, 170), rand(9, 34), rand(-200, -50));
      scene.add(s);
      clouds.push({ sprite: s, speed: rand(0.3, 1.1), baseY: s.position.y, phase: rand(0, 6) });
    }

    // birds
    const birds = createBirds(scene, 7, 0x2b2119);
    const birdsGroup = birds.group;

    const oceanHeight = (x, z, t) => (
      Math.sin(x * 0.32 + t * 0.8) * 0.26 +
      Math.sin(z * 0.45 - t * 0.62) * 0.18 +
      Math.sin((x + z) * 0.16 + t * 0.45) * 0.3 +
      Math.sin((x * 0.85 - z * 0.55) + t * 1.5) * 0.07
    );

    function update(t, dt) {
      waterUniforms.uTime.value = t;
      const by = oceanHeight(boat.position.x, boat.position.z, t);
      boat.position.y = by - 0.08;
      boat.rotation.z = Math.sin(t * 0.9) * 0.035;
      boat.rotation.x = Math.cos(t * 0.7) * 0.03;
      boat.rotation.y = Math.sin(t * 0.23) * 0.08;
      boatLight.intensity = 0.7 + Math.sin(t * 9.1) * 0.08 + Math.sin(t * 17.3) * 0.04;
      boatGlow.material.opacity = 0.45 + Math.sin(t * 8.3) * 0.08;
      lighthouseGlow.material.opacity = 0.45 + Math.sin(t * 1.9) * 0.12;
      lanternRoom.material.emissiveIntensity = 2.1 + Math.sin(t * 2.1) * 0.2;

      clouds.forEach((c) => {
        c.sprite.position.x += c.speed * dt;
        if (c.sprite.position.x > 180) c.sprite.position.x = -180;
        c.sprite.position.y = c.baseY + Math.sin(t * 0.25 + c.phase) * 0.8;
      });
      birds.update(t, dt);
      birdsGroup.position.x = Math.sin(t * 0.05) * 4;
    }

    return {
      name: 'ocean',
      scene: scene,
      position: new THREE.Vector3(0.5, 3.9, 17),
      target: new THREE.Vector3(0, 2.1, 0),
      exposure: 1.0,
      limits: { minDistance: 6, maxDistance: 42, minPolar: 1.2, maxPolar: 1.56, minAzimuth: -Infinity, maxAzimuth: Infinity },
      update: update,
      clampCameraY: 1.2
    };
  }

  function ironMat() {
    return new THREE.MeshStandardMaterial({ color: 0x211b17, roughness: 0.55, metalness: 0.7 });
  }

  /* ------------------------------- SKY WORLD ------------------------------- */
  function buildSkyWorld() {
    const tex = getTextures();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbcd7ee);
    scene.fog = new THREE.Fog(0xe8d3bd, 110, 420);
    const sunDir = new THREE.Vector3(-0.62, 0.14, -0.77).normalize();

    const sunLight = new THREE.DirectionalLight(0xffd9a6, 1.55);
    sunLight.position.copy(sunDir).multiplyScalar(120);
    scene.add(sunLight);
    scene.add(new THREE.HemisphereLight(0xbfd9f2, 0xd9c3a4, 0.5));
    scene.add(new THREE.AmbientLight(0xffe6c8, 0.1));

    // sky dome
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: { value: sunDir },
        uTop: { value: new THREE.Color(0x245a9a) },
        uMid: { value: new THREE.Color(0x9fc6e6) },
        uLow: { value: new THREE.Color(0xffcf9e) }
      },
      vertexShader: [
        'varying vec3 vWorld;',
        'void main() {',
        '  vWorld = position;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uSunDir;',
        'uniform vec3 uTop;',
        'uniform vec3 uMid;',
        'uniform vec3 uLow;',
        'varying vec3 vWorld;',
        'void main() {',
        '  vec3 dir = normalize(vWorld);',
        '  float y = dir.y;',
        '  vec3 col = mix(uLow, uMid, smoothstep(-0.03, 0.18, y));',
        '  col = mix(col, uTop, smoothstep(0.08, 0.62, y));',
        '  float sun = pow(max(dot(dir, uSunDir), 0.0), 900.0);',
        '  float glow = pow(max(dot(dir, uSunDir), 0.0), 20.0);',
        '  col += vec3(1.0, 0.92, 0.72) * sun * 2.0;',
        '  col += vec3(1.0, 0.75, 0.4) * glow * 0.28;',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n'),
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 20), skyMat);
    sky.renderOrder = -10;
    scene.add(sky);

    const sun = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex.glow, color: 0xfff6dc, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    }));
    sun.scale.set(45, 45, 1);
    sun.position.copy(sunDir).multiplyScalar(240);
    scene.add(sun);

    // cloud sea far below
    const cloudSea = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.MeshBasicMaterial({ map: tex.cloudSea, color: 0xfff0dc, fog: true })
    );
    cloudSea.rotation.x = -Math.PI / 2;
    cloudSea.position.y = -12;
    scene.add(cloudSea);

    /* ---- floating islands ---- */
    const islands = [];
    const islandSpecs = [
      { x: -10, y: 8, z: -14, s: 0.82, trees: 3 },
      { x: 12, y: 11, z: -22, s: 0.66, trees: 2 },
      { x: -20, y: 14, z: -32, s: 1.08, trees: 4 },
      { x: 3, y: 6.6, z: -9, s: 0.52, trees: 1, cabin: true },
      { x: 22, y: 7.2, z: -19, s: 0.56, trees: 2 },
      { x: -3, y: 12.5, z: -39, s: 0.9, trees: 3 }
    ];
    islandSpecs.forEach((spec) => {
      const island = makeIsland(spec, tex);
      island.group.position.set(spec.x, spec.y, spec.z);
      island.baseY = spec.y;
      scene.add(island.group);
      islands.push(island);
    });

    /* ---- hot air balloon ---- */
    const balloon = new THREE.Group();
    balloon.position.set(-4.5, 15, -3);
    scene.add(balloon);
    const envelopeMat = new THREE.MeshStandardMaterial({ map: tex.balloon, roughness: 0.85, metalness: 0.02 });
    const envelope = new THREE.Mesh(new THREE.SphereGeometry(2.3, 32, 20), envelopeMat);
    envelope.scale.set(1, 1.18, 1);
    envelope.position.y = 2.6;
    balloon.add(envelope);
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.7, 0.9, 24, 1, true), envelopeMat);
    skirt.position.y = 0.65;
    balloon.add(skirt);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.7, 20), makeMaterial({ color: 0x2a1a10, roughness: 1, side: THREE.DoubleSide }));
    bottom.rotation.x = Math.PI / 2;
    bottom.position.y = 0.22;
    balloon.add(bottom);
    const basket = new THREE.Group();
    basket.position.y = 0;
    balloon.add(basket);
    const basketMat = makeMaterial({ color: 0x8a5a2e, roughness: 0.9 });
    const basketBox = addBox(basket, 1.1, 0.8, 1.1, basketMat, 0, -1.75, 0, true, true);
    basketBox.geometry = new THREE.BoxGeometry(1.1, 0.8, 1.1);
    for (let i = 0; i < 4; i++) {
      const rope = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(Math.cos(i * Math.PI / 2) * 0.5, -1.35, Math.sin(i * Math.PI / 2) * 0.5),
          new THREE.Vector3(Math.cos(i * Math.PI / 2) * 1.0, 0.25, Math.sin(i * Math.PI / 2) * 1.0)
        ]),
        new THREE.LineBasicMaterial({ color: 0x3a2a1c, transparent: true, opacity: 0.8 })
      );
      balloon.add(rope);
    }
    const burner = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.16, 0.3, 8),
      new THREE.MeshStandardMaterial({ color: 0xffb35e, emissive: 0xff7a1a, emissiveIntensity: 2.2, roughness: 0.4 })
    );
    burner.position.y = -1.0;
    balloon.add(burner);
    const burnerGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex.glow, color: 0xffb35e, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    burnerGlow.scale.set(1.2, 1.2, 1);
    burnerGlow.position.y = -0.95;
    balloon.add(burnerGlow);

    /* ---- clouds ---- */
    const clouds = [];
    for (let i = 0; i < 26; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex.cloud, color: 0xffffff, transparent: true,
        opacity: rand(0.32, 0.8), depthWrite: false
      });
      const cloud = new THREE.Sprite(mat);
      const sc = rand(22, 64);
      cloud.scale.set(sc, sc * rand(0.32, 0.52), 1);
      cloud.position.set(rand(-170, 170), rand(4, 48), rand(-190, -20));
      scene.add(cloud);
      clouds.push({ sprite: cloud, speed: rand(0.4, 1.4), baseY: cloud.position.y, phase: rand(0, 6) });
    }
    // low wisps near camera path
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex.cloud, color: 0xf6fbff, transparent: true,
        opacity: rand(0.12, 0.28), depthWrite: false
      });
      const cloud = new THREE.Sprite(mat);
      const sc = rand(48, 90);
      cloud.scale.set(sc, sc * 0.3, 1);
      cloud.position.set(rand(-70, 70), rand(1, 5), rand(-40, 30));
      scene.add(cloud);
      clouds.push({ sprite: cloud, speed: rand(0.2, 0.6), baseY: cloud.position.y, phase: rand(0, 6) });
    }

    // low cloud sea — fills the void beneath the islands
    for (let i = 0; i < 22; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex.cloud, color: 0xf4fbff, transparent: true,
        opacity: rand(0.16, 0.42), depthWrite: false
      });
      const cloud = new THREE.Sprite(mat);
      const sc = rand(34, 76);
      cloud.scale.set(sc, sc * rand(0.3, 0.46), 1);
      cloud.position.set(rand(-80, 80), rand(-1, 5), rand(-70, -8));
      scene.add(cloud);
      clouds.push({ sprite: cloud, speed: rand(0.15, 0.5), baseY: cloud.position.y, phase: rand(0, 6) });
    }

    // birds
    const birds = createBirds(scene, 9, 0x3a3028);
    birds.group.position.y = 6;

    // fireflies / lantern motes
    const fireflies = createFireflies(scene, tex.glow, 64);

    function update(t, dt) {
      islands.forEach((island, i) => {
        island.group.position.y = island.baseY + Math.sin(t * 0.32 + i * 1.7) * 0.32;
        island.group.rotation.y = Math.sin(t * 0.08 + i) * 0.06;
        island.update(t, dt);
      });
      balloon.position.y = 15 + Math.sin(t * 0.35) * 0.9;
      balloon.position.x = -4.5 + Math.sin(t * 0.16) * 2.2;
      balloon.rotation.z = Math.sin(t * 0.28) * 0.035;
      balloon.rotation.y = Math.sin(t * 0.11) * 0.12;
      burner.material.emissiveIntensity = 1.9 + Math.sin(t * 13) * 0.5;
      burnerGlow.material.opacity = 0.35 + Math.sin(t * 10.5) * 0.12;
      clouds.forEach((c) => {
        c.sprite.position.x += c.speed * dt;
        if (c.sprite.position.x > 180) c.sprite.position.x = -180;
        c.sprite.position.y = c.baseY + Math.sin(t * 0.22 + c.phase) * 1.1;
      });
      birds.update(t, dt);
      fireflies.update(t, dt);
    }

    return {
      name: 'sky',
      scene: scene,
      position: new THREE.Vector3(0, 11.2, 32),
      target: new THREE.Vector3(0, 11.4, -6),
      exposure: 1.06,
      limits: { minDistance: 10, maxDistance: 58, minPolar: 1.05, maxPolar: 1.72, minAzimuth: -Infinity, maxAzimuth: Infinity },
      update: update
    };
  }

  function makeIsland(spec, tex) {
    const group = new THREE.Group();
    const s = spec.s;
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6a513a, roughness: 1, flatShading: true });
    const rockDark = new THREE.MeshStandardMaterial({ color: 0x443327, roughness: 1, flatShading: true });
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x5d8a48, roughness: 0.95, flatShading: true });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d3f2a, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x35633a, roughness: 0.95, flatShading: true });
    const leafLight = new THREE.MeshStandardMaterial({ color: 0x4e7a3f, roughness: 0.95, flatShading: true });

    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(3.1 * s, 0), rockMat);
    rock.scale.set(1.15, 1.35, 1.0);
    rock.position.y = -2.1 * s;
    rock.rotation.set(rand(0, 1), rand(0, 3), rand(0, 1));
    rock.castShadow = true;
    group.add(rock);

    const under = new THREE.Mesh(new THREE.ConeGeometry(2.1 * s, 4.2 * s, 7), rockDark);
    under.position.y = -4.4 * s;
    under.rotation.y = rand(0, 3);
    group.add(under);

    const top = new THREE.Mesh(new THREE.CylinderGeometry(3.25 * s, 3.05 * s, 0.4 * s, 10), grassMat);
    top.position.y = 0.1;
    top.castShadow = true;
    top.receiveShadow = true;
    group.add(top);

    // little rocks
    for (let i = 0; i < 4; i++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.2, 0.5) * s, 0), rockDark);
      r.position.set(rand(-2.4, 2.4) * s, 0.35 * s, rand(-2.1, 2.1) * s);
      r.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
      group.add(r);
    }

    // trees
    for (let i = 0; i < spec.trees; i++) {
      const tree = new THREE.Group();
      const h = rand(1.2, 2.0) * s;
      tree.position.set(rand(-2.0, 2.0) * s, 0.25, rand(-1.8, 1.8) * s);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * s, 0.16 * s, h, 6), trunkMat);
      trunk.position.y = h / 2;
      tree.add(trunk);
      const tiers = randInt(2, 3);
      for (let j = 0; j < tiers; j++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry((0.9 - j * 0.18) * s, (1.4 - j * 0.2) * s, 7), j % 2 ? leafLight : leafMat);
        cone.position.y = h + j * 0.55 * s;
        cone.castShadow = true;
        tree.add(cone);
      }
      tree.rotation.y = rand(0, 3);
      group.add(tree);
    }

    // tiny cabin with a warm window
    if (spec.cabin) {
      const cabin = new THREE.Group();
      cabin.position.set(1.05 * s, 0.2, -0.35 * s);
      cabin.rotation.y = -0.4;
      const cabinBase = makeMaterial({ color: 0x5a3c26, roughness: 0.95 });
      const cabinRoof = makeMaterial({ color: 0x3a2418, roughness: 0.9 });
      addBox(cabin, 0.9 * s, 0.62 * s, 0.8 * s, cabinBase, 0, 0.31 * s, 0, true, true);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.76 * s, 0.46 * s, 4), cabinRoof);
      roof.rotation.y = Math.PI / 4;
      roof.position.y = 0.85 * s;
      roof.castShadow = true;
      cabin.add(roof);
      const windowMat = new THREE.MeshBasicMaterial({ color: 0xffc06a });
      const windowPane = new THREE.Mesh(new THREE.PlaneGeometry(0.22 * s, 0.2 * s), windowMat);
      windowPane.position.set(0.08 * s, 0.4 * s, 0.405 * s);
      cabin.add(windowPane);
      const cabinGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex.glow, color: 0xffb45e, transparent: true, opacity: 0.6,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      cabinGlow.scale.set(1.3 * s, 1.3 * s, 1);
      cabinGlow.position.set(0.08 * s, 0.4 * s, 0.45 * s);
      cabin.add(cabinGlow);
      addBox(cabin, 0.14 * s, 0.3 * s, 0.14 * s, cabinRoof, -0.28 * s, 0.92 * s, -0.12 * s, true, false);
      group.add(cabin);
    }

    // waterfall
    let waterfall = null;
    if (spec.s > 0.9) {      const wfTex = makeTexture(128, (ctx, w) => {
        ctx.fillStyle = 'rgba(255,255,255,0)';
        ctx.fillRect(0, 0, w, w);
        for (let i = 0; i < 22; i++) {
          ctx.fillStyle = 'rgba(220,245,255,' + rand(0.15, 0.6) + ')';
          ctx.fillRect(rand(0, w), 0, rand(1, 3), w);
        }
      }, 1, 2);
      waterfall = new THREE.Mesh(
        new THREE.PlaneGeometry(1.1 * s, 7 * s),
        new THREE.MeshBasicMaterial({ map: wfTex, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide })
      );
      waterfall.position.set(2.3 * s, -3.2 * s, 0.8 * s);
      waterfall.rotation.y = -0.5;
      group.add(waterfall);
    }

    const baseY = group.position.y;
    function update(t, dt) {
      if (waterfall) {
        waterfall.material.map.offset.y -= dt * 0.9;
        waterfall.material.opacity = 0.42 + Math.sin(t * 3.1) * 0.08;
      }
    }
    return { group: group, baseY: baseY, update: update };
  }

  function createBirds(scene, count, color) {
    const group = new THREE.Group();
    scene.add(group);
    const birds = [];
    const material = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.55 });
    for (let i = 0; i < count; i++) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
      const line = new THREE.Line(geometry, material);
      group.add(line);
      birds.push({
        line: line,
        radius: rand(12, 34),
        height: rand(10, 26),
        speed: rand(0.035, 0.08) * (Math.random() > 0.4 ? 1 : -1),
        offset: rand(0, Math.PI * 2),
        flap: rand(0, 9),
        size: rand(0.5, 1.2)
      });
    }
    function update(t, dt) {
      birds.forEach((b) => {
        const a = t * b.speed + b.offset;
        const x = Math.cos(a) * b.radius;
        const z = Math.sin(a) * b.radius - 12;
        const y = b.height + Math.sin(t * 0.5 + b.offset) * 1.2;
        b.line.position.set(x, y, z);
        b.line.rotation.y = -a + Math.PI / 2;
        const flap = Math.sin(t * 6 + b.flap) * 0.28;
        const pos = b.line.geometry.attributes.position;
        pos.setXYZ(0, -0.7 * b.size, flap * b.size, 0);
        pos.setXYZ(1, 0, 0.16 * b.size, 0);
        pos.setXYZ(2, 0.7 * b.size, flap * b.size, 0);
        pos.needsUpdate = true;
      });
    }
    return { group: group, update: update };
  }

  function createFireflies(scene, tex, count) {
    const n = LOW_POWER ? Math.round(count * 0.6) : count;
    const positions = new Float32Array(n * 3);
    const data = [];
    for (let i = 0; i < n; i++) {
      const p = {
        baseX: rand(-22, 22),
        baseY: rand(5, 20),
        baseZ: rand(-30, 2),
        phase: rand(0, 6.28),
        speed: rand(0.2, 0.6)
      };
      data.push(p);
      positions[i * 3] = p.baseX;
      positions[i * 3 + 1] = p.baseY;
      positions[i * 3 + 2] = p.baseZ;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      map: tex, size: 0.34, sizeAttenuation: true, transparent: true,
      opacity: 0.62, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffce7a
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    scene.add(points);
    function update(t, dt) {
      for (let i = 0; i < n; i++) {
        const p = data[i];
        positions[i * 3] = p.baseX + Math.sin(t * p.speed + p.phase) * 3.2;
        positions[i * 3 + 1] = p.baseY + Math.sin(t * p.speed * 1.4 + p.phase) * 1.6;
        positions[i * 3 + 2] = p.baseZ + Math.cos(t * p.speed * 0.8 + p.phase) * 2.2;
      }
      geometry.attributes.position.needsUpdate = true;
      material.opacity = 0.65 + Math.sin(t * 1.7) * 0.12;
    }
    return { update: update };
  }

  /* ==========================================================================
     5. RENDERER & SCENE SWITCHING
     ========================================================================== */
  let renderer = null;
  let camera = null;
  let controls = null;
  let activeWorld = null;
  let activeSceneName = 'fireplace';
  let camTween = null;
  let switchTimeout = null;
  let clock = null;
  let threeReady = false;
  let miniPlayState = false;

  function installOrbitFallback() {
    if (THREE.OrbitControls) return;
    THREE.OrbitControls = function (cam, domElement) {
      this.camera = cam;
      this.domElement = domElement;
      this.target = new THREE.Vector3();
      this.enabled = true;
      this.enableDamping = false;
      this.dampingFactor = 0.06;
      this.enablePan = false;
      this.minDistance = 0.1;
      this.maxDistance = Infinity;
      this.minPolarAngle = 0;
      this.maxPolarAngle = Math.PI;
      this.minAzimuthAngle = -Infinity;
      this.maxAzimuthAngle = Infinity;
      this.rotateSpeed = 0.6;
      this.zoomSpeed = 0.9;
      this._sph = new THREE.Spherical();
      this._drag = false;
      this._px = 0;
      this._py = 0;
      this._dTheta = 0;
      this._dPhi = 0;
      var self = this;
      function onDown(e) {
        if (!self.enabled) return;
        self._drag = true;
        self._px = e.clientX;
        self._py = e.clientY;
        domElement.setPointerCapture && domElement.setPointerCapture(e.pointerId);
      }
      function onMove(e) {
        if (!self._drag || !self.enabled) return;
        var w = domElement.clientWidth || 1;
        var h = domElement.clientHeight || 1;
        self._dTheta += (e.clientX - self._px) / w * Math.PI * 2 * self.rotateSpeed;
        self._dPhi += (e.clientY - self._py) / h * Math.PI * self.rotateSpeed;
        self._px = e.clientX;
        self._py = e.clientY;
      }
      function onUp() { self._drag = false; }
      function onWheel(e) {
        if (!self.enabled) return;
        e.preventDefault();
        var off = self.camera.position.clone().sub(self.target);
        var dist = clamp(off.length() * (1 + e.deltaY * 0.0012 * self.zoomSpeed), self.minDistance, self.maxDistance);
        off.setLength(dist);
        self.camera.position.copy(self.target).add(off);
        self.update();
      }
      domElement.addEventListener('pointerdown', onDown);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      domElement.addEventListener('wheel', onWheel, { passive: false });
      this.update = function () {
        var off = self.camera.position.clone().sub(self.target);
        self._sph.setFromVector3(off);
        if (self._dTheta || self._dPhi) {
          self._sph.theta -= self._dTheta;
          self._sph.phi -= self._dPhi;
          self._dTheta = self.enableDamping ? self._dTheta * (1 - self.dampingFactor) : 0;
          self._dPhi = self.enableDamping ? self._dPhi * (1 - self.dampingFactor) : 0;
          if (Math.abs(self._dTheta) < 0.00001) self._dTheta = 0;
          if (Math.abs(self._dPhi) < 0.00001) self._dPhi = 0;
        }
        self._sph.phi = clamp(self._sph.phi, self.minPolarAngle, self.maxPolarAngle);
        self._sph.theta = clamp(self._sph.theta, self.minAzimuthAngle, self.maxAzimuthAngle);
        self._sph.radius = clamp(self._sph.radius, self.minDistance, self.maxDistance);
        self.camera.position.copy(self.target).add(off.setFromSpherical(self._sph));
        self.camera.lookAt(self.target);
      };
    };
  }

  function initThree() {
    if (typeof THREE === 'undefined') throw new Error('Three.js failed to load. Check your connection and reload.');
    installOrbitFallback();

    const canvas = $('#scene-canvas');
    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: !LOW_POWER,
      alpha: false,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(DPR);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 500);
    camera.position.set(0, 2.7, 5.5);

    controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.enablePan = false;
    controls.rotateSpeed = 0.55;
    controls.zoomSpeed = 0.7;
    controls.target.set(0, 1.7, -2.35);

    $('#loader-sub').textContent = 'stacking logs & weaving light';

    WORLDS.fireplace = buildFireplaceWorld();
    WORLDS.ocean = buildOceanWorld();
    WORLDS.sky = buildSkyWorld();

    threeReady = true;
    clock = new THREE.Clock();
    applyWorld(settings.scene || 'fireplace', true);
    activeSceneName = WORLDS[settings.scene] ? settings.scene : 'fireplace';

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(onResize, 220));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && clock) clock.getDelta();
    });

    animate();
  }

  function onResize() {
    if (!renderer || !camera) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(DPR);
    renderer.setSize(w, h);
  }

  function applyWorld(name, instant) {
    const world = WORLDS[name];
    if (!world) return;
    activeWorld = world;
    activeSceneName = name;
    renderer.toneMappingExposure = world.exposure || 1.1;

    const limits = world.limits;
    controls.minDistance = limits.minDistance;
    controls.maxDistance = limits.maxDistance;
    controls.minPolarAngle = limits.minPolar;
    controls.maxPolarAngle = limits.maxPolar;
    controls.minAzimuthAngle = limits.minAzimuth;
    controls.maxAzimuthAngle = limits.maxAzimuth;

    if (instant) {
      camera.position.copy(world.position);
      controls.target.copy(world.target);
      controls.update();
      camTween = null;
      controls.enabled = true;
    } else {
      const dir = world.position.clone().sub(world.target);
      camera.position.copy(world.target).add(dir.multiplyScalar(1.14));
      controls.target.copy(world.target);
      camera.lookAt(world.target);
      camTween = {
        from: camera.position.clone(),
        to: world.position.clone(),
        fromTarget: world.target.clone(),
        toTarget: world.target.clone(),
        t: 0,
        dur: 1.5
      };
      controls.enabled = false;
    }
  }

  function switchScene(name, opts) {
    opts = opts || {};
    if (!threeReady) {
      toast('3D is not ready yet', { icon: '⚠️' });
      return;
    }
    if (name === activeSceneName && !opts.force) return;

    settings.scene = name;
    persistSoon();
    updateSceneUI(name);
    updateLayerUI(name);
    sound.setScene(name);

    if (switchTimeout) clearTimeout(switchTimeout);
    const overlay = $('#scene-fade');
    overlay.classList.add('is-on');
    switchTimeout = setTimeout(() => {
      applyWorld(name, false);
      requestAnimationFrame(() => overlay.classList.remove('is-on'));
      switchTimeout = null;
    }, REDUCED_MOTION ? 60 : 420);

    const hints = {
      fireplace: 'Warmth, rendered in real time.',
      ocean: 'Salt air, slow swells, and a lantern on the water.',
      sky: 'A quiet balloon ride above the clouds.'
    };
    $('#scene-hint').textContent = hints[name] || '';
  }

  function updateSceneUI(name) {
    $$('.scene-btn').forEach((btn) => {
      const active = btn.dataset.scene === name;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function animate() {
    requestAnimationFrame(animate);
    if (!renderer || !activeWorld) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    if (controls) {
      controls.update();
      if (controls.enabled && activeWorld.clampCameraY && camera.position.y < activeWorld.clampCameraY) {
        camera.position.y = activeWorld.clampCameraY;
        controls.update();
      }
    }

    if (camTween) {
      camTween.t += dt / camTween.dur;
      const k = easeOutCubic(clamp(camTween.t, 0, 1));
      camera.position.lerpVectors(camTween.from, camTween.to, k);
      controls.target.lerpVectors(camTween.fromTarget, camTween.toTarget, k);
      camera.lookAt(controls.target);
      if (camTween.t >= 1) {
        camTween = null;
        controls.enabled = true;
        controls.update();
      }
    }

    activeWorld.update(t, dt);
    renderer.render(activeWorld.scene, camera);
  }

  /* ==========================================================================
     6. PROCEDURAL SOUND ENGINE
     ========================================================================== */
  function SoundEngine() {
    this.ctx = null;
    this.started = false;
    this.enabled = false;
    this.scene = settings.scene || 'fireplace';
    this.master = null;
    this.comp = null;
    this.fireBus = null;
    this.ambBus = null;
    this.layerGains = {};
    this.crackleTimer = null;
    this.oceanTimer = null;
    this.rainTimer = null;
    this.pinkBuffer = null;
    this.whiteBuffer = null;
    this.brownBuffer = null;
    this.fireVolume = settings.fireVolume;
    this.ambVolume = settings.ambienceVolume;
    this.masterVolume = settings.masterVolume;
  }

  SoundEngine.prototype.activeLayers = function () {
    return settings.layers[this.scene] || DEFAULT_LAYERS[this.scene] || DEFAULT_LAYERS.fireplace;
  };

  SoundEngine.prototype.makeNoise = function (kind, seconds) {
    const ctx = this.ctx;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      let brown = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        if (kind === 'pink') {
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
          b6 = white * 0.115926;
        } else if (kind === 'brown') {
          brown = (brown + 0.02 * white) / 1.02;
          data[i] = brown * 3.2;
        } else {
          data[i] = white * 0.6;
        }
      }
    }
    return buffer;
  };

  SoundEngine.prototype.makeCrackleBuffer = function () {
    const ctx = this.ctx;
    const length = Math.floor(ctx.sampleRate * 0.35);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const env = Math.pow(1 - i / length, 5);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    return buffer;
  };

  SoundEngine.prototype.start = function () {
    const self = this;
    if (this.started) return Promise.resolve(true);
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return Promise.reject(new Error('Web Audio is not supported in this browser.'));

    return new Promise((resolve, reject) => {
      try {
        self.scene = settings.scene || 'fireplace';
        self.ctx = new AudioCtx();
        const ctx = self.ctx;

        self.master = ctx.createGain();
        self.master.gain.value = 0;
        self.master.connect(ctx.destination);

        self.comp = ctx.createDynamicsCompressor();
        self.comp.threshold.value = -18;
        self.comp.knee.value = 22;
        self.comp.ratio.value = 4;
        self.comp.attack.value = 0.004;
        self.comp.release.value = 0.28;
        self.comp.connect(self.master);

        self.fireBus = ctx.createGain();
        self.fireBus.gain.value = 0;
        self.fireBus.connect(self.comp);

        self.ambBus = ctx.createGain();
        self.ambBus.gain.value = 0;
        self.ambBus.connect(self.comp);

        self.pinkBuffer = self.makeNoise('pink', 6);
        self.whiteBuffer = self.makeNoise('white', 3);
        self.brownBuffer = self.makeNoise('brown', 5);
        self.crackleBuffer = self.makeCrackleBuffer();

        // ---- fire bed ----
        const fireNoise = ctx.createBufferSource();
        fireNoise.buffer = self.pinkBuffer;
        fireNoise.loop = true;
        const fireFilter = ctx.createBiquadFilter();
        fireFilter.type = 'lowpass';
        fireFilter.frequency.value = 520;
        fireFilter.Q.value = 0.7;
        const fireGain = ctx.createGain();
        fireGain.gain.value = 0.32;
        fireNoise.connect(fireFilter).connect(fireGain).connect(self.fireBus);
        fireNoise.start();

        const fireBody = ctx.createBufferSource();
        fireBody.buffer = self.brownBuffer;
        fireBody.loop = true;
        const bodyFilter = ctx.createBiquadFilter();
        bodyFilter.type = 'lowpass';
        bodyFilter.frequency.value = 150;
        const bodyGain = ctx.createGain();
        bodyGain.gain.value = 0.28;
        fireBody.connect(bodyFilter).connect(bodyGain).connect(self.fireBus);
        fireBody.start();

        const rumble = ctx.createOscillator();
        rumble.type = 'sine';
        rumble.frequency.value = 44;
        const rumbleGain = ctx.createGain();
        rumbleGain.gain.value = 0.035;
        rumble.connect(rumbleGain).connect(self.fireBus);
        rumble.start();

        const rumble2 = ctx.createOscillator();
        rumble2.type = 'triangle';
        rumble2.frequency.value = 67;
        const rumble2Gain = ctx.createGain();
        rumble2Gain.gain.value = 0.012;
        rumble2.connect(rumble2Gain).connect(self.fireBus);
        rumble2.start();

        // slow breathing of the fire bed
        const fireLfo = ctx.createOscillator();
        fireLfo.frequency.value = 0.13;
        const fireLfoGain = ctx.createGain();
        fireLfoGain.gain.value = 0.06;
        fireLfo.connect(fireLfoGain).connect(fireGain.gain);
        fireLfo.start();

        // ---- ambience buses ----
        self.layerGains.room = ctx.createGain();
        self.layerGains.room.gain.value = 0;
        self.layerGains.room.connect(self.ambBus);

        self.layerGains.ocean = ctx.createGain();
        self.layerGains.ocean.gain.value = 0;
        self.layerGains.ocean.connect(self.ambBus);

        self.layerGains.wind = ctx.createGain();
        self.layerGains.wind.gain.value = 0;
        self.layerGains.wind.connect(self.ambBus);

        self.layerGains.rain = ctx.createGain();
        self.layerGains.rain.gain.value = 0;
        self.layerGains.rain.connect(self.ambBus);

        // room tone
        const roomSrc = ctx.createBufferSource();
        roomSrc.buffer = self.brownBuffer;
        roomSrc.loop = true;
        const roomFilter = ctx.createBiquadFilter();
        roomFilter.type = 'lowpass';
        roomFilter.frequency.value = 130;
        const roomGain = ctx.createGain();
        roomGain.gain.value = 0.32;
        roomSrc.connect(roomFilter).connect(roomGain).connect(self.layerGains.room);
        roomSrc.start();

        // ocean swell
        const oceanSrc = ctx.createBufferSource();
        oceanSrc.buffer = self.pinkBuffer;
        oceanSrc.loop = true;
        const oceanFilter = ctx.createBiquadFilter();
        oceanFilter.type = 'lowpass';
        oceanFilter.frequency.value = 780;
        oceanFilter.Q.value = 0.9;
        const oceanGain = ctx.createGain();
        oceanGain.gain.value = 0.26;
        oceanSrc.connect(oceanFilter).connect(oceanGain).connect(self.layerGains.ocean);
        oceanSrc.start();
        const swell = ctx.createOscillator();
        swell.type = 'sine';
        swell.frequency.value = 0.085;
        const swellGain = ctx.createGain();
        swellGain.gain.value = 0.16;
        swell.connect(swellGain).connect(oceanGain.gain);
        swell.start();

        const hissSrc = ctx.createBufferSource();
        hissSrc.buffer = self.whiteBuffer;
        hissSrc.loop = true;
        const hissFilter = ctx.createBiquadFilter();
        hissFilter.type = 'bandpass';
        hissFilter.frequency.value = 2400;
        hissFilter.Q.value = 0.5;
        const hissGain = ctx.createGain();
        hissGain.gain.value = 0.035;
        hissSrc.connect(hissFilter).connect(hissGain).connect(self.layerGains.ocean);
        hissSrc.start();

        // wind
        const windSrc = ctx.createBufferSource();
        windSrc.buffer = self.pinkBuffer;
        windSrc.loop = true;
        const windFilter = ctx.createBiquadFilter();
        windFilter.type = 'bandpass';
        windFilter.frequency.value = 540;
        windFilter.Q.value = 0.55;
        const windGain = ctx.createGain();
        windGain.gain.value = 0.3;
        windSrc.connect(windFilter).connect(windGain).connect(self.layerGains.wind);
        windSrc.start();
        const gust = ctx.createOscillator();
        gust.type = 'sine';
        gust.frequency.value = 0.11;
        const gustGain = ctx.createGain();
        gustGain.gain.value = 0.17;
        gust.connect(gustGain).connect(windGain.gain);
        gust.start();

        const whistleSrc = ctx.createBufferSource();
        whistleSrc.buffer = self.whiteBuffer;
        whistleSrc.loop = true;
        const whistleFilter = ctx.createBiquadFilter();
        whistleFilter.type = 'bandpass';
        whistleFilter.frequency.value = 1300;
        whistleFilter.Q.value = 3.2;
        const whistleGain = ctx.createGain();
        whistleGain.gain.value = 0.018;
        whistleSrc.connect(whistleFilter).connect(whistleGain).connect(self.layerGains.wind);
        whistleSrc.start();

        // rain — soft high hiss + a low body + sparse droplets
        const rainSrc = ctx.createBufferSource();
        rainSrc.buffer = self.whiteBuffer;
        rainSrc.loop = true;
        const rainHigh = ctx.createBiquadFilter();
        rainHigh.type = 'highpass';
        rainHigh.frequency.value = 900;
        const rainLow = ctx.createBiquadFilter();
        rainLow.type = 'lowpass';
        rainLow.frequency.value = 7800;
        const rainGain = ctx.createGain();
        rainGain.gain.value = 0.18;
        rainSrc.connect(rainHigh).connect(rainLow).connect(rainGain).connect(self.layerGains.rain);
        rainSrc.start();

        const rainBody = ctx.createBufferSource();
        rainBody.buffer = self.pinkBuffer;
        rainBody.loop = true;
        const rainBodyFilter = ctx.createBiquadFilter();
        rainBodyFilter.type = 'lowpass';
        rainBodyFilter.frequency.value = 1100;
        const rainBodyGain = ctx.createGain();
        rainBodyGain.gain.value = 0.1;
        rainBody.connect(rainBodyFilter).connect(rainBodyGain).connect(self.layerGains.rain);
        rainBody.start();

        const rainLfo = ctx.createOscillator();
        rainLfo.type = 'sine';
        rainLfo.frequency.value = 0.06;
        const rainLfoGain = ctx.createGain();
        rainLfoGain.gain.value = 0.04;
        rainLfo.connect(rainLfoGain).connect(rainGain.gain);
        rainLfo.start();

        self.started = true;
        self.enabled = true;
        self.setScene(self.scene, true);
        self.applyVolumes(true);
        self.master.gain.setTargetAtTime(self.masterVolume, ctx.currentTime, 0.6);
        self.syncSchedulers();
        if (ctx.state === 'suspended' || ctx.state === 'interrupted') ctx.resume().catch(() => {});
        resolve(true);
      } catch (err) {
        try { if (self.ctx && self.ctx.close) self.ctx.close(); } catch (e) {}
        self.ctx = null;
        self.started = false;
        reject(err);
      }
    });
  };

  SoundEngine.prototype.applyLayers = function (ramp) {
    if (!this.ctx) return;
    const layers = this.activeLayers();
    const now = this.ctx.currentTime;
    const time = typeof ramp === 'number' ? ramp : 0.9;
    ['room', 'ocean', 'wind', 'rain'].forEach((key) => {
      this.layerGains[key].gain.setTargetAtTime(layers[key] ? 1 : 0, now, time);
    });
    this.fireBus.gain.setTargetAtTime(layers.fire ? this.fireVolume : 0, now, time);
  };

  SoundEngine.prototype.setScene = function (name, instant) {
    this.scene = name;
    if (!this.ctx) return;
    this.applyLayers(instant ? 0.05 : 0.9);
    this.syncSchedulers();
  };

  SoundEngine.prototype.setLayer = function (layer, on) {
    const layers = settings.layers[this.scene];
    if (!layers || !(layer in layers)) return;
    layers[layer] = !!on;
    this.applyLayers(0.22);
    this.syncSchedulers();
  };

  SoundEngine.prototype.applyVolumes = function (instant) {
    this.fireVolume = clamp(settings.fireVolume, 0, 1);
    this.ambVolume = clamp(settings.ambienceVolume, 0, 1);
    this.masterVolume = clamp(settings.masterVolume, 0, 1);
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const ramp = instant ? 0.03 : 0.12;
    this.master.gain.setTargetAtTime(this.enabled ? this.masterVolume : 0, now, ramp);
    this.ambBus.gain.setTargetAtTime(this.ambVolume, now, ramp);
    this.applyLayers(ramp);
  };

  SoundEngine.prototype.setEnabled = function (on) {
    this.enabled = !!on;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.enabled ? this.masterVolume : 0, now, 0.15);
    if (this.enabled && (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted')) {
      this.ctx.resume().catch(() => {});
    }
  };

  SoundEngine.prototype.syncSchedulers = function () {
    const layers = this.activeLayers();
    if (layers.fire) this.scheduleCrackles();
    else {
      clearTimeout(this.crackleTimer);
      this.crackleTimer = null;
    }
    if (layers.ocean) this.scheduleOcean();
    else {
      clearTimeout(this.oceanTimer);
      this.oceanTimer = null;
    }
    if (layers.rain) this.scheduleRain();
    else {
      clearTimeout(this.rainTimer);
      this.rainTimer = null;
    }
  };

  SoundEngine.prototype.scheduleCrackles = function () {
    const self = this;
    clearTimeout(this.crackleTimer);
    if (!this.started) return;
    let next = 180;
    function loop() {
      self.crackleTimer = setTimeout(() => {
        if (!self.started) return;
        if (self.activeLayers().fire) {
          self.playCrackle();
          next = rand(70, 620);
        } else {
          next = 800;
        }
        loop();
      }, next);
    }
    loop();
  };

  SoundEngine.prototype.playCrackle = function () {
    if (!this.ctx || this.ctx.state !== 'running' || !this.activeLayers().fire) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.crackleBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = rand(950, 3400);
    filter.Q.value = rand(0.4, 1.6);
    const gain = ctx.createGain();
    const duration = rand(0.035, 0.16);
    const peak = rand(0.12, 0.55);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    src.connect(filter).connect(gain);
    let tail = gain;
    if (ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = rand(-0.7, 0.7);
      gain.connect(panner);
      tail = panner;
    }
    tail.connect(this.fireBus);
    src.start(now, rand(0, 0.2), duration + 0.02);

    // occasional deeper wood pop
    if (Math.random() < 0.08) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(rand(120, 210), now);
      osc.frequency.exponentialRampToValueAtTime(rand(45, 80), now + 0.08);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, now);
      og.gain.linearRampToValueAtTime(rand(0.04, 0.14), now + 0.004);
      og.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
      osc.connect(og).connect(this.fireBus);
      osc.start(now);
      osc.stop(now + 0.16);
    }
  };

  SoundEngine.prototype.scheduleOcean = function () {
    const self = this;
    clearTimeout(this.oceanTimer);
    if (!this.started) return;
    function loop() {
      self.oceanTimer = setTimeout(() => {
        if (!self.started) return;
        if (self.activeLayers().ocean) self.playWave();
        loop();
      }, rand(6200, 12500));
    }
    loop();
  };

  SoundEngine.prototype.playWave = function () {
    if (!this.ctx || this.ctx.state !== 'running' || !this.activeLayers().ocean) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.pinkBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(240, now + 3.4);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(rand(0.16, 0.3), now + 1.1);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 4.2);
    src.connect(filter).connect(gain).connect(this.layerGains.ocean);
    src.start(now, rand(0, 3), 4.4);
  };

  SoundEngine.prototype.scheduleRain = function () {
    const self = this;
    clearTimeout(this.rainTimer);
    if (!this.started) return;
    function loop() {
      self.rainTimer = setTimeout(() => {
        if (!self.started) return;
        if (self.activeLayers().rain) self.playRainDrop();
        loop();
      }, rand(55, 280));
    }
    loop();
  };

  SoundEngine.prototype.playRainDrop = function () {
    if (!this.ctx || this.ctx.state !== 'running' || !this.activeLayers().rain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.crackleBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = rand(1600, 5200);
    const gain = ctx.createGain();
    const duration = rand(0.015, 0.055);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(rand(0.015, 0.07), now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    src.connect(filter).connect(gain);
    let tail = gain;
    if (ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = rand(-0.85, 0.85);
      gain.connect(panner);
      tail = panner;
    }
    tail.connect(this.layerGains.rain);
    src.start(now, rand(0, 0.25), duration + 0.01);
  };

  SoundEngine.prototype.chime = function (focusDone) {
    if (!this.ctx || !this.started || !this.enabled) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const notes = focusDone ? [523.25, 659.25, 783.99, 1046.5] : [392.0, 493.88, 587.33];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      const start = now + i * 0.16;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.09, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 1.8);
      osc.connect(g).connect(this.comp);
      osc.start(start);
      osc.stop(start + 1.9);
      // shimmer
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = freq * 2;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.0001, start);
      g2.gain.exponentialRampToValueAtTime(0.02, start + 0.04);
      g2.gain.exponentialRampToValueAtTime(0.0001, start + 1.1);
      osc2.connect(g2).connect(this.comp);
      osc2.start(start);
      osc2.stop(start + 1.2);
    });
  };

  const sound = new SoundEngine();

  /* ==========================================================================
     7. POMODORO TIMER
     ========================================================================== */
  const timer = {
    mode: 'focus',
    running: false,
    remainingMs: 25 * 60000,
    totalMs: 25 * 60000,
    endAt: 0,
    phaseStartAt: null,
    completing: false
  };

  let timerInterval = null;
  let autoStartTimeout = null;

  function focusMs() { return clamp(settings.focusMinutes, 1, 120) * 60000; }
  function breakMs() { return clamp(settings.breakMinutes, 1, 45) * 60000; }

  function initTimer() {
    const duration = timer.mode === 'focus' ? focusMs() : breakMs();
    timer.totalMs = duration;
    timer.remainingMs = duration;

    if (savedTimerState && typeof savedTimerState === 'object') {
      const mode = savedTimerState.mode === 'break' ? 'break' : 'focus';
      const total = safeNumber(savedTimerState.totalMs, mode === 'focus' ? focusMs() : breakMs(), 1000, 8 * 3600000);
      timer.mode = mode;
      timer.totalMs = total;
      timer.remainingMs = clamp(Number(savedTimerState.remainingMs) || total, 0, total);
      timer.phaseStartAt = savedTimerState.phaseStartAt || null;
      if (savedTimerState.running && savedTimerState.endAt) {
        const remaining = savedTimerState.endAt - Date.now();
        if (remaining > 0 && remaining <= total + 2000) {
          timer.running = true;
          timer.endAt = savedTimerState.endAt;
          timer.remainingMs = remaining;
          startTicker();
          setTimeout(() => toast('The hearth kept your place', { icon: '⏳' }), 900);
        } else {
          timer.remainingMs = total;
          timer.running = false;
        }
      }
    }
    renderTimer();
  }

  function startTicker() {
    stopTicker();
    timerInterval = setInterval(tickTimer, 250);
  }

  function stopTicker() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function tickTimer() {
    if (!timer.running) return;
    const remaining = timer.endAt - Date.now();
    if (remaining <= 0) {
      timer.remainingMs = 0;
      timer.running = false;
      stopTicker();
      renderTimer();
      completePhase('complete');
      return;
    }
    timer.remainingMs = remaining;
    renderTimer();
  }

  function startTimer() {
    if (timer.running) {
      pauseTimer();
      return;
    }
    if (autoStartTimeout) {
      clearTimeout(autoStartTimeout);
      autoStartTimeout = null;
    }
    if (timer.remainingMs <= 0) {
      timer.totalMs = timer.mode === 'focus' ? focusMs() : breakMs();
      timer.remainingMs = timer.totalMs;
    }
    timer.running = true;
    timer.endAt = Date.now() + timer.remainingMs;
    if (!timer.phaseStartAt) timer.phaseStartAt = Date.now();
    startTicker();
    renderTimer();
    persistSoon();
  }

  function pauseTimer() {
    if (!timer.running) return;
    timer.remainingMs = Math.max(0, timer.endAt - Date.now());
    timer.running = false;
    stopTicker();
    renderTimer();
    persistSoon();
  }

  function resetTimer() {
    if (autoStartTimeout) {
      clearTimeout(autoStartTimeout);
      autoStartTimeout = null;
    }
    stopTicker();
    timer.running = false;
    timer.completing = false;
    timer.phaseStartAt = null;
    timer.totalMs = timer.mode === 'focus' ? focusMs() : breakMs();
    timer.remainingMs = timer.totalMs;
    renderTimer();
    persistSoon();
    toast('Timer returned to the start', { icon: '↺' });
  }

  function skipPhase() {
    if (autoStartTimeout) {
      clearTimeout(autoStartTimeout);
      autoStartTimeout = null;
    }
    stopTicker();
    timer.running = false;
    timer.remainingMs = 0;
    completePhase('skip');
  }

  function completePhase(reason) {
    if (timer.completing) return;
    timer.completing = true;
    stopTicker();
    timer.running = false;
    const finishedMode = timer.mode;
    const finishedTotal = timer.totalMs;

    if (finishedMode === 'focus' && reason === 'complete') {
      const now = new Date();
      const entry = {
        id: 'focus_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        mode: 'focus',
        startedAt: new Date(timer.phaseStartAt || (Date.now() - finishedTotal)).toISOString(),
        completedAt: now.toISOString(),
        durationSeconds: Math.round(finishedTotal / 1000),
        scene: settings.scene
      };
      profile.history.push(entry);
      if (profile.history.length > 1200) profile.history = profile.history.slice(-1200);
      profile.sessionsCompleted += 1;
      profile.totalFocusSeconds += entry.durationSeconds;
      sound.chime(true);
      updateStats();
      toast('Focus session complete 🌿', { icon: '🔥', tone: 'good' });
      flashTitle('Session complete');
    } else if (finishedMode === 'break' && reason === 'complete') {
      sound.chime(false);
      toast('Break complete — the page is warm again', { icon: '☕' });
    } else if (reason === 'skip') {
      toast('Skipped to the next phase', { icon: '⏭' });
    }

    timer.mode = finishedMode === 'focus' ? 'break' : 'focus';
    timer.totalMs = timer.mode === 'focus' ? focusMs() : breakMs();
    timer.remainingMs = timer.totalMs;
    timer.phaseStartAt = null;
    timer.completing = false;
    renderTimer();
    updateStats();
    persistNow();

    if (finishedMode === 'focus' && reason === 'complete' && settings.autoStartBreak) {
      autoStartTimeout = setTimeout(() => {
        autoStartTimeout = null;
        if (!timer.running && timer.mode === 'break') startTimer();
      }, 1600);
    }
  }

  function flashTitle(text) {
    const original = APP.name + ' · Cozy Fireplace & Study Sanctuary';
    document.title = text + ' — ' + APP.name;
    setTimeout(() => {
      if (!timer.running) document.title = original;
    }, 4200);
  }

  function renderTimer() {
    const timeText = formatClock(timer.remainingMs);
    const fraction = clamp(timer.remainingMs / Math.max(1, timer.totalMs), 0, 1);
    const isFocus = timer.mode === 'focus';

    $('#timer-time').textContent = timeText;
    $('#timer-mode').textContent = isFocus ? 'Focus' : 'Break';
    $('#ring-progress').style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - fraction));
    $('.timer-panel').classList.toggle('is-break', !isFocus);

    const note = $('#timer-note');
    if (timer.running) note.textContent = isFocus ? 'deep work in progress' : 'stretch, sip tea, breathe';
    else if (timer.remainingMs < timer.totalMs - 500) note.textContent = 'paused — return when ready';
    else note.textContent = isFocus ? 'settle in & begin' : 'a small, well-earned pause';

    const startBtn = $('#timer-start');
    const label = $('#start-label');
    startBtn.classList.toggle('is-running', timer.running);
    if (timer.running) {
      label.textContent = 'Pause';
      startBtn.querySelector('svg').innerHTML = '<rect x="7" y="5" width="3.4" height="14" rx="1" fill="currentColor"/><rect x="13.6" y="5" width="3.4" height="14" rx="1" fill="currentColor"/>';
    } else {
      label.textContent = timer.remainingMs < timer.totalMs ? 'Resume' : (isFocus ? 'Begin focus' : 'Begin break');
      startBtn.querySelector('svg').innerHTML = '<path d="M8 5.5v13l11-6.5-11-6.5z" fill="currentColor"/>';
    }

    $('#mini-timer').innerHTML = timeText + ' <span>' + (isFocus ? 'focus' : 'break') + '</span>';
    $('#mini-play').textContent = timer.running ? '❚❚' : '▶';
    miniPlayState = timer.running;

    if (timer.running) {
      document.title = (isFocus ? '🔥 ' : '☕ ') + timeText + ' · ' + APP.name;
    } else if (!document.title.match(/—/)) {
      document.title = APP.name + ' · Cozy Fireplace & Study Sanctuary';
    }
  }

  function updateStats() {
    const focusSessions = profile.history.filter((h) => h.mode === 'focus');
    const totalSeconds = focusSessions.reduce((sum, h) => sum + (Number(h.durationSeconds) || 0), 0);
    profile.totalFocusSeconds = totalSeconds;
    profile.sessionsCompleted = focusSessions.length;

    const today = dayKey(new Date());
    const todaySeconds = focusSessions.reduce((sum, h) => {
      const d = new Date(h.completedAt);
      return dayKey(d) === today ? sum + (Number(h.durationSeconds) || 0) : sum;
    }, 0);

    const days = new Set(focusSessions.map((h) => dayKey(new Date(h.completedAt))));
    let streak = 0;
    const cursor = new Date();
    if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    while (days.has(dayKey(cursor)) && streak < 3650) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }

    $('#stat-today').textContent = todaySeconds > 0 ? formatMinutes(todaySeconds) : '0m';
    $('#stat-total').textContent = formatHours(profile.totalFocusSeconds);
    $('#stat-streak').textContent = String(streak);
    $('#session-count').textContent = String(profile.sessionsCompleted);
    $('#session-pill').title = profile.sessionsCompleted + ' completed focus sessions';
  }

  function applyDurationSettings() {
    if (!timer.running) {
      if (timer.mode === 'focus') {
        timer.totalMs = focusMs();
        timer.remainingMs = timer.totalMs;
      } else {
        timer.totalMs = breakMs();
        timer.remainingMs = timer.totalMs;
      }
      timer.phaseStartAt = null;
      renderTimer();
    }
    persistNow();
  }

  /* ==========================================================================
     8. UI WIRING
     ========================================================================== */
  const QUOTES = [
    { text: 'A quiet room, a steady fire, and one task worth finishing.', source: 'the hearthkeeper' },
    { text: 'The fire does not hurry, and yet everything gets warm.', source: 'cabin proverb' },
    { text: 'Small hours, stacked carefully, make a warm life.', source: 'the hearthkeeper' },
    { text: 'Sit close. The work will meet you here.', source: 'a note by the mantle' },
    { text: 'Attention is a kind of firewood. Spend it in pieces that burn well.', source: 'study notes' },
    { text: 'Let the storm be outside. You have a chair and a page.', source: 'winter letters' },
    { text: 'One log at a time. One page at a time.', source: 'the hearthkeeper' },
    { text: 'The best ideas arrive when the room is warm and the phone is elsewhere.', source: 'margin scribble' }
  ];

  let quoteIndex = 0;
  let quoteTimer = null;

  function rotateQuote() {
    quoteIndex = (quoteIndex + 1) % QUOTES.length;
    const card = $('#quote-card');
    const text = $('#quote-text');
    const source = $('#quote-source');
    text.style.opacity = '0';
    source.style.opacity = '0';
    setTimeout(() => {
      text.textContent = QUOTES[quoteIndex].text;
      source.textContent = '— ' + QUOTES[quoteIndex].source;
      text.style.opacity = '1';
      source.style.opacity = '1';
    }, 420);
    card.classList.add('is-changing');
    setTimeout(() => card.classList.remove('is-changing'), 900);
  }

  function toast(message, opts) {
    opts = opts || {};
    const stack = $('#toast-stack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = 'toast' + (opts.tone === 'error' ? ' is-error' : '');
    const icon = document.createElement('span');
    icon.className = 't-icon';
    icon.textContent = opts.icon || '✦';
    const body = document.createElement('div');
    body.textContent = message;
    el.appendChild(icon);
    el.appendChild(body);
    stack.appendChild(el);
    setTimeout(() => {
      el.classList.add('is-out');
      setTimeout(() => el.remove(), 340);
    }, opts.duration || 4400);
    while (stack.children.length > 3) stack.removeChild(stack.firstChild);
  }

  function setRangeFill(input) {
    const min = parseFloat(input.min) || 0;
    const max = parseFloat(input.max) || 100;
    const val = parseFloat(input.value) || 0;
    input.style.setProperty('--val', ((val - min) / (max - min) * 100) + '%');
  }

  function updateSoundUI() {
    const enabled = sound.enabled;
    const started = sound.started;
    const running = !!(started && sound.ctx && sound.ctx.state === 'running');
    const pending = !!(enabled && started && !running);
    const mutedPref = settings.soundOn === false;
    const label = !enabled ? ((started || mutedPref) ? 'Sound Off' : 'Enable Sound') : (pending ? 'Tap to hear' : 'Sound On');
    const icon = !enabled ? ((started || mutedPref) ? '🔇' : '🔈') : (pending ? '🔈' : '🔊');

    const toggle = $('#sound-toggle');
    toggle.classList.toggle('is-on', enabled && running);
    toggle.classList.toggle('is-pending', pending);
    toggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    toggle.title = pending ? 'Tap anywhere to start the soundscape' : (enabled ? 'Mute ambient sound' : 'Enable ambient sound');
    $('.sound-icon', toggle).textContent = icon;
    $('.sound-label', toggle).textContent = label;

    const power = $('#audio-power');
    power.textContent = running ? 'on' : (pending ? 'tap' : (started ? 'muted' : 'off'));
    power.classList.toggle('is-on', enabled && running);
    power.classList.toggle('is-pending', pending);
    power.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    power.title = pending ? 'Tap anywhere to start the soundscape' : 'Toggle sound';

    const mini = $('#mini-sound');
    mini.textContent = icon;
    mini.classList.toggle('is-on', enabled && running);
    mini.classList.toggle('is-pending', pending);
  }

  function updateLayerUI(scene) {
    const current = scene || settings.scene;
    const layers = settings.layers[current] || DEFAULT_LAYERS[current] || DEFAULT_LAYERS.fireplace;
    $$('.layer-chip').forEach((btn) => {
      const on = !!layers[btn.dataset.layer];
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const defaults = DEFAULT_LAYERS[current] || DEFAULT_LAYERS.fireplace;
    const custom = LAYER_KEYS.some((key) => !!layers[key] !== !!defaults[key]);
    const activeCount = LAYER_KEYS.filter((key) => layers[key]).length;
    const names = { fireplace: 'Fireplace mix', ocean: 'Ocean mix', sky: 'Sky mix' };
    $('#layer-mix').textContent = activeCount === 0 ? 'Silent mix' : (custom ? 'Custom mix' : names[current]);
    const fireRow = $('#fire-volume').closest('.slider-row');
    const ambRow = $('#ambience-volume').closest('.slider-row');
    fireRow.classList.toggle('is-muted', !layers.fire);
    const anyAmbience = ['room', 'ocean', 'wind', 'rain'].some((key) => layers[key]);
    ambRow.classList.toggle('is-muted', !anyAmbience);
  }

  async function enableSound(opts) {
    opts = opts || {};
    try {
      if (!sound.started) {
        await sound.start();
        if (sound.ctx) sound.ctx.onstatechange = updateSoundUI;
      }
      sound.setEnabled(true);
      settings.soundOn = true;
      if (sound.ctx && (sound.ctx.state === 'suspended' || sound.ctx.state === 'interrupted')) {
        sound.ctx.onstatechange = updateSoundUI;
        sound.ctx.resume().catch(() => {});
      }
      updateSoundUI();
      updateLayerUI();
      persistNow();
      if (opts.toast) toast('The hearth is crackling', { icon: '🔥' });
      return true;
    } catch (err) {
      updateSoundUI();
      if (!opts.silent) toast('Could not start audio: ' + err.message, { icon: '⚠️', tone: 'error' });
      return false;
    }
  }

  async function toggleSound() {
    if (!sound.started) {
      await enableSound({ toast: true });
      return;
    }
    if (sound.enabled && sound.ctx && (sound.ctx.state === 'suspended' || sound.ctx.state === 'interrupted')) {
      sound.ctx.onstatechange = updateSoundUI;
      sound.ctx.resume().catch(() => {});
      updateSoundUI();
      setTimeout(() => {
        if (sound.ctx && sound.ctx.state === 'running') toast('Sound is live', { icon: '🔊' });
      }, 180);
      return;
    }
    sound.setEnabled(!sound.enabled);
    settings.soundOn = sound.enabled;
    updateSoundUI();
    persistNow();
    toast(sound.enabled ? 'Sound on' : 'Sound muted', { icon: sound.enabled ? '🔊' : '🔇' });
  }

  async function toggleLayer(layer) {
    const layers = settings.layers[settings.scene];
    if (!layers || !(layer in layers)) return;
    const next = !layers[layer];
    if (sound.started) sound.setLayer(layer, next);
    else layers[layer] = next;
    updateLayerUI();
    persistNow();
    if (next && (!sound.started || !sound.enabled || (sound.ctx && sound.ctx.state === 'suspended'))) {
      await enableSound({ silent: true });
      updateLayerUI();
    }
  }

  let autoSoundStarted = false;
  async function autoStartSound() {
    if (autoSoundStarted) return;
    autoSoundStarted = true;
    if (settings.soundOn === false) {
      updateSoundUI();
      return;
    }
    const ok = await enableSound({ silent: true });
    if (!ok) {
      autoSoundStarted = false;
      return;
    }
    updateSoundUI();
    setTimeout(() => {
      if (settings.soundOn && sound.ctx && (sound.ctx.state === 'suspended' || sound.ctx.state === 'interrupted')) {
        toast('Sound is ready — tap anywhere to hear it', { icon: '🔈', duration: 5200 });
      }
    }, 2200);
  }

  function wakeSound(event) {
    if (settings.soundOn === false) return;
    const target = event && event.target;
    if (target && target.closest && target.closest('#sound-toggle, #audio-power, #mini-sound')) return;
    if (event && event.type === 'keydown' && (event.key === 'm' || event.key === 'M')) return;
    if (!sound.started) {
      autoStartSound();
      return;
    }
    if (!sound.enabled) return;
    if (sound.ctx && (sound.ctx.state === 'suspended' || sound.ctx.state === 'interrupted')) {
      sound.ctx.resume().then(updateSoundUI).catch(() => {});
    }
  }

  function updateVolumeUI() {
    $('#fire-volume').value = Math.round(settings.fireVolume * 100);
    $('#ambience-volume').value = Math.round(settings.ambienceVolume * 100);
    $('#master-volume').value = Math.round(settings.masterVolume * 100);
    $('#fire-volume-out').textContent = Math.round(settings.fireVolume * 100) + '%';
    $('#ambience-volume-out').textContent = Math.round(settings.ambienceVolume * 100) + '%';
    $('#master-volume-out').textContent = Math.round(settings.masterVolume * 100) + '%';
    $$('.range').forEach(setRangeFill);
  }

  function toggleMinimal(force) {
    const on = typeof force === 'boolean' ? force : !document.body.classList.contains('minimal');
    document.body.classList.toggle('minimal', on);
    $('#minimal-hud').hidden = !on;
    settings.minimal = on;
    persistSoon();
    if (on) toast('Distraction-free mode — press H to return', { icon: '🌙', duration: 3000 });
  }

  function updateLastSaved() {
    if (!lastSavedAt) return;
    $('#last-saved').textContent = 'Local log saved ' + relativeDate(lastSavedAt) + ' · export to carry it anywhere.';
  }

  function downloadSessionLog() {
    updateStats();
    const payload = {
      app: APP.name,
      version: APP.version,
      exportedAt: nowISO(),
      profile: {
        totalFocusSeconds: profile.totalFocusSeconds,
        sessionsCompleted: profile.sessionsCompleted,
        history: profile.history
      },
      settings: {
        scene: settings.scene,
        fireVolume: settings.fireVolume,
        ambienceVolume: settings.ambienceVolume,
        masterVolume: settings.masterVolume,
        focusMinutes: settings.focusMinutes,
        breakMinutes: settings.breakMinutes,
        autoStartBreak: settings.autoStartBreak,
        layers: settings.layers
      },
      note: 'Generated by Hearth & Home 3D — a cozy fireplace & study sanctuary.'
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fireplace_sanctuary_log.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast('Study session exported', { icon: '💾' });
    persistNow();
  }

  function handleSessionFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        importSessionData(data);
      } catch (err) {
        toast('That file is not a valid sanctuary log', { icon: '⚠️', tone: 'error' });
      }
    };
    reader.onerror = () => toast('Could not read that file', { icon: '⚠️', tone: 'error' });
    reader.readAsText(file);
  }

  function importSessionData(data) {
    if (!data || typeof data !== 'object') throw new Error('invalid');
    const incomingProfile = data.profile || data;
    const incomingHistory = Array.isArray(incomingProfile.history) ? incomingProfile.history : [];
    const validHistory = incomingHistory.filter(isValidHistoryEntry);

    let added = 0;
    const existing = new Set(profile.history.map((h) => h.id));
    validHistory.forEach((h) => {
      if (!existing.has(h.id)) {
        profile.history.push(h);
        existing.add(h.id);
        added++;
      }
    });
    profile.history.sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));
    if (profile.history.length > 1200) profile.history = profile.history.slice(-1200);

    if (data.settings && typeof data.settings === 'object') {
      const s = data.settings;
      if (['fireplace', 'ocean', 'sky'].indexOf(s.scene) >= 0) settings.scene = s.scene;
      if (isFinite(s.fireVolume)) settings.fireVolume = clamp(s.fireVolume, 0, 1);
      if (isFinite(s.ambienceVolume)) settings.ambienceVolume = clamp(s.ambienceVolume, 0, 1);
      if (isFinite(s.masterVolume)) settings.masterVolume = clamp(s.masterVolume, 0, 1);
      if (isFinite(s.focusMinutes)) settings.focusMinutes = clamp(s.focusMinutes, 1, 120);
      if (isFinite(s.breakMinutes)) settings.breakMinutes = clamp(s.breakMinutes, 1, 45);
      if (typeof s.autoStartBreak === 'boolean') settings.autoStartBreak = s.autoStartBreak;
      if (s.layers) settings.layers = normalizeLayers(s.layers);
    }

    updateStats();
    syncSettingsToUI();
    updateVolumeUI();
    updateLayerUI();
    if (sound.started) {
      sound.applyVolumes();
      sound.setScene(settings.scene);
    }
    if (threeReady && settings.scene !== activeSceneName) switchScene(settings.scene, { force: true });
    persistNow();
    updateLastSaved();
    toast(added > 0 ? 'Imported ' + added + ' focus session' + (added === 1 ? '' : 's') + ' 🔥' : 'Log imported — no new sessions found', { icon: '📂' });
  }

  function syncSettingsToUI() {
    $('#focus-minutes').value = settings.focusMinutes;
    $('#break-minutes').value = settings.breakMinutes;
    updateSceneUI(settings.scene);
    updateLayerUI(settings.scene);
  }

  function bindUI() {
    // scenes
    $$('.scene-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchScene(btn.dataset.scene));
    });

    // sound
    $('#sound-toggle').addEventListener('click', toggleSound);
    $('#audio-power').addEventListener('click', toggleSound);
    $$('.layer-chip').forEach((btn) => {
      btn.addEventListener('click', () => toggleLayer(btn.dataset.layer));
    });

    // minimal / focus mode
    $('#ui-toggle').addEventListener('click', () => toggleMinimal());
    $('#mini-exit').addEventListener('click', () => toggleMinimal(false));
    $('#mini-timer').addEventListener('click', () => toggleMinimal(false));
    $('#mini-play').addEventListener('click', startTimer);
    $('#mini-sound').addEventListener('click', toggleSound);

    // timer
    $('#timer-start').addEventListener('click', startTimer);
    $('#timer-reset').addEventListener('click', resetTimer);
    $('#timer-skip').addEventListener('click', skipPhase);

    $('#focus-minutes').addEventListener('change', (e) => {
      settings.focusMinutes = clamp(safeNumber(e.target.value, 25, 1, 120), 1, 120);
      e.target.value = settings.focusMinutes;
      applyDurationSettings();
      toast('Focus block set to ' + settings.focusMinutes + ' minutes', { icon: '⏱️' });
    });
    $('#break-minutes').addEventListener('change', (e) => {
      settings.breakMinutes = clamp(safeNumber(e.target.value, 5, 1, 45), 1, 45);
      e.target.value = settings.breakMinutes;
      applyDurationSettings();
      toast('Break set to ' + settings.breakMinutes + ' minutes', { icon: '☕' });
    });

    // volume sliders
    const bindVolume = (id, key, outId) => {
      const input = $('#' + id);
      input.addEventListener('input', () => {
        settings[key] = parseFloat(input.value) / 100;
        $('#' + outId).textContent = input.value + '%';
        setRangeFill(input);
        sound.applyVolumes();
        persistSoon();
      });
    };
    bindVolume('fire-volume', 'fireVolume', 'fire-volume-out');
    bindVolume('ambience-volume', 'ambienceVolume', 'ambience-volume-out');
    bindVolume('master-volume', 'masterVolume', 'master-volume-out');

    // persistence
    $('#save-session').addEventListener('click', downloadSessionLog);
    $('#load-session').addEventListener('click', () => $('#session-file').click());
    $('#session-file').addEventListener('change', (e) => {
      handleSessionFile(e.target.files && e.target.files[0]);
      e.target.value = '';
    });

    // keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
      if (typing) return;
      if ((e.key === ' ' || e.code === 'Space') && (tag === 'button' || tag === 'a' || tag === 'summary')) return;
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        startTimer();
      } else if (e.key === 'h' || e.key === 'H') {
        toggleMinimal();
      } else if (e.key === 'm' || e.key === 'M') {
        toggleSound();
      } else if (e.key === 'Escape') {
        if (document.body.classList.contains('minimal')) toggleMinimal(false);
      } else if (e.key === '1') {
        switchScene('fireplace');
      } else if (e.key === '2') {
        switchScene('ocean');
      } else if (e.key === '3') {
        switchScene('sky');
      } else if (e.key === 'r' || e.key === 'R') {
        resetTimer();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) tickTimer();
    });

    // Some browsers open the AudioContext suspended until a real gesture.
    document.addEventListener('pointerdown', wakeSound, { passive: true });
    document.addEventListener('keydown', wakeSound, { passive: true });
    document.addEventListener('touchstart', wakeSound, { passive: true });

    window.addEventListener('beforeunload', () => {
      if (timer.running) persistNow();
    });

    // initial volumes / UI
    updateVolumeUI();
    updateSoundUI();
    $('#mini-timer').title = 'Click to show the interface';
    updateLastSaved();

    if (settings.minimal) {
      document.body.classList.add('minimal');
      $('#minimal-hud').hidden = false;
    }

    // timer tick on animation? interval is used. Keep a slow save while running.
    setInterval(() => {
      if (timer.running) persistNow();
      updateLastSaved();
    }, 12000);
  }

  function initQuotes() {
    $('#quote-text').style.transition = 'opacity 0.4s ease';
    $('#quote-source').style.transition = 'opacity 0.4s ease';
    quoteTimer = setInterval(rotateQuote, 24000);
  }

  /* ==========================================================================
     9. BOOT
     ========================================================================== */
  function hideLoader() {
    const loader = $('#loader');
    if (!loader) return;
    loader.classList.add('is-done');
    setTimeout(() => { loader.style.display = 'none'; }, 900);
  }

  function boot() {
    loadLocal();
    bindUI();
    initTimer();
    updateStats();
    syncSettingsToUI();
    updateSoundUI();
    updateLayerUI(settings.scene);
    initQuotes();
    updateSceneUI(settings.scene || 'fireplace');

    try {
      initThree();
      setTimeout(hideLoader, REDUCED_MOTION ? 250 : 700);
    } catch (err) {
      console.error('[hearth] 3D init failed:', err);
      $('#loader-sub').textContent = 'The fire could not be lit — ' + err.message;
      setTimeout(hideLoader, 2600);
      toast('3D scene unavailable: ' + err.message, { icon: '⚠️', tone: 'error', duration: 7000 });
    }

    // Sound is enabled by default. If the browser requires a gesture, the
    // context stays suspended and wakes on the first pointer/key event.
    setTimeout(autoStartSound, 650);

    // If the timer was running from a previous visit, make sure the ticker is alive.
    if (timer.running) startTicker();
    renderTimer();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* Small public API for tinkering from the console. */
  window.HearthHome3D = {
    version: APP.version,
    settings: settings,
    profile: profile,
    timer: timer,
    sound: sound,
    switchScene: switchScene,
    toggleMinimal: toggleMinimal,
    toggleLayer: toggleLayer,
    enableSound: enableSound,
    updateSoundUI: updateSoundUI,
    get scene() { return activeSceneName; },
    get world() { return activeWorld; },
    get worlds() { return WORLDS; },
    get camera() { return camera; },
    get controls() { return controls; }
  };
})();
