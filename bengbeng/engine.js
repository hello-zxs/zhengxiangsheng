/* 蹦蹦 / BENG BENG — one stage, five toys: fireworks, firecrackers, bombs, snow, peach blossom.

   The same file drives the section on zhengxiangsheng.com and the stand-alone
   app in /bengbeng/.  No dependencies.  Sound is synthesised in the browser and
   stays off until someone asks for it.

   Gestures (mouse, pen or any number of fingers):
     fireworks    tap = three shells          hold = one grand shell
     firecracker  tap = 大地红, a full-length braid on a pole, lit at the bottom
                  drag = lay a braid along the path   hold = a double-banger (二踢脚)
     bomb         tap = drop                  hold = a bigger bomb
                  flick = throw; bombs bounce, roll and set each other off
     snow         tap = a flurry of one crystal type (it changes every tap)
                  hold = grow one large crystal   drag = scatter flakes
     peach        touch the branch = its petals fall   hold = a breeze
                  drag = stir the air                                           */
(() => {
  "use strict";

  const stage = document.querySelector("[data-bengbeng-stage]");
  const canvas = document.querySelector("[data-bengbeng-canvas]");
  const statusEl = document.querySelector("[data-bengbeng-status]");
  if (!stage || !canvas || !statusEl) return;
  const modeButtons = Array.from(document.querySelectorAll("[data-mode]"));
  const launchBtn = document.querySelector("[data-launch]");
  const clearBtn = document.querySelector("[data-clear]");
  const soundBtn = document.querySelector("[data-sound]");
  const motionBtn = document.querySelector("[data-motion]");
  const badgeEl = document.querySelector("[data-bengbeng-badge]");
  const fullScreen = stage.getAttribute("data-bengbeng-stage") === "full";

  const ctx = canvas.getContext("2d");
  let reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const TAU = Math.PI * 2;
  const FIREWORK_SETS = [
    ["#ff3b30", "#ffd60a", "#ffffff"],
    ["#0a84ff", "#64d2ff", "#ffffff"],
    ["#30d158", "#ffd60a", "#ffffff"],
    ["#bf5af2", "#ff2d55", "#ffffff"],
    ["#ff9f0a", "#ffd60a", "#ffffff"],
    ["#ffffff", "#ffd60a", "#ff9f0a"]
  ];
  const FIREWORK_TYPES = [
    "peony", "peony", "peony", "chrysanthemum", "chrysanthemum",
    "willow", "willow", "heart", "clover", "crossette", "palm"
  ];
  const LABELS = {
    fireworks: "烟花 · Fireworks",
    firecracker: "爆竹 · Firecracker",
    bomb: "炸弹 · Bomb",
    snow: "雪 · Snow",
    peach: "桃花 · Peach blossom"
  };
  const HINTS = {
    fireworks: "click for a shell, hold for a grand one.",
    firecracker: "tap to hang a long string, drag to lay one, hold for a double-banger.",
    bomb: "tap to drop, hold for a big one, flick to throw. They set each other off.",
    snow: "tap for a flurry, hold to grow a crystal, drag to scatter.",
    peach: "touch the branch and its petals fall; hold for a breeze, drag to stir the air."
  };
  const SNOW_TYPES = [
    { id: "stellar", cn: "星形枝晶", en: "stellar dendrite" },
    { id: "fern", cn: "蕨状枝晶", en: "fernlike dendrite" },
    { id: "plate", cn: "六角板", en: "hexagonal plate" },
    { id: "sector", cn: "扇形板", en: "sectored plate" },
    { id: "needle", cn: "针状星", en: "needle star" },
    { id: "twelve", cn: "十二枝晶", en: "twelve-branched star" },
    { id: "capped", cn: "冠状星", en: "capped star" },
    { id: "triangle", cn: "三角晶", en: "triangular crystal" }
  ];
  // shreds of the wrapper: red outside, with a little of the pale inner paper
  const PAPER_COLORS = ["#c81e1e", "#e03a2f", "#b51f1a", "#d9322b", "#a81712", "#cf2a22", "#e0574b", "#ead9c0"];
  const CRACK_SPARKS = ["#fff3c4", "#ffd60a", "#ffb340", "#ffffff"];
  const TUBE_H = 18;                  // one cracker, px
  const TUBE_W = 6.5;
  const BIG_H = 26;                   // the big ones
  const BIG_W = 9.5;
  const ROW = 8.5;                    // spacing of the pairs along the braid
  const MAX_PARTICLES = 3600;
  const MAX_SMOKE = 420;
  const MAX_PAPER = 1100;
  const MAX_FLAKES = 300;
  const MAX_BOMBS = 14;
  const COL = 4;                      // width of one snow-pile column, px
  const FLOOR = 2;

  let W = 1;
  let H = 1;
  let dpr = 1;
  let running = false;
  let visible = true;
  let last = 0;
  let clock = 0;
  let mode = "fireworks";
  let snowIndex = 0;
  let ambient = 0;
  let whiteout = 0;
  let shakeAmp = 0;
  let shakeLeft = 0;
  let shakeTotal = 1;
  let pile = new Float32Array(1);
  let pileMax = 0;
  let pileTop = 0;

  const particles = [];
  const smoke = [];
  const flashes = [];
  const shocks = [];
  const fireballs = [];
  const rockets = [];
  const strings = [];
  const strays = [];
  const cracks = [];
  const kickers = [];
  const bombs = [];
  const papers = [];
  const flakes = [];
  const texts = [];
  const touches = new Map();

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const safe = (r) => (Number.isFinite(r) && r > 0.1 ? r : 0.1);

  /* ---------------------------------------------------------------- stage */
  function resize() {
    const rect = stage.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (w === W && h === H && canvas.width) return;
    W = w;
    H = h;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cols = Math.ceil(W / COL) + 1;
    if (cols !== pile.length) {
      const next = new Float32Array(cols);
      for (let i = 0; i < cols; i++) next[i] = pile[Math.min(pile.length - 1, Math.round((i / cols) * pile.length))] || 0;
      pile = next;
    }
    pileMax = Math.min(H * 0.3, 170);
    if (tree.image && (tree.w !== W || tree.h !== H)) {      // the branch is painted to fit the stage
      if (mode === "peach") buildTree();
      else tree.image = null;
    }
    if (!running) draw(0);
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function setMode(next) {
    if (!LABELS[next]) return;
    releaseAll();
    mode = next;
    modeButtons.forEach((b) => {
      const on = b.dataset.mode === next;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    stage.setAttribute("data-toy", next);
    if (next === "peach") paintTreeAgain();
    if (reduced) {                                 // no motion: the branch is simply there, a still picture
      tree.show = next === "peach" ? 1 : 0;
      draw(0);
      return;
    }
    setStatus(LABELS[next] + " — " + HINTS[next]);
    if (next === "snow" || next === "peach") startLoop();
  }

  function shake(amp, time) {
    if (amp * time > shakeAmp * shakeLeft) {
      shakeAmp = amp;
      shakeLeft = shakeTotal = time;
    }
  }

  /* ---------------------------------------------------------------- sound */
  const audio = { ctx: null, on: false, noise: null, master: null, lastPop: 0 };

  function primeAudio() {
    if (!audio.on) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audio.ctx) {
      audio.ctx = new AC();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = 0.55;
      // a limiter, so that a whole string going off does not clip ...
      let sink = audio.ctx.destination;
      if (audio.ctx.createDynamicsCompressor) {
        const limit = audio.ctx.createDynamicsCompressor();
        limit.threshold.value = -14;
        limit.knee.value = 10;
        limit.ratio.value = 8;
        limit.attack.value = 0.002;
        limit.release.value = 0.12;
        limit.connect(sink);
        sink = limit;
      }
      audio.master.connect(sink);
      // ... and one slap of echo, as off the wall across the street
      const delay = audio.ctx.createDelay(0.5);
      delay.delayTime.value = 0.14;
      const damp = audio.ctx.createBiquadFilter();
      damp.type = "lowpass";
      damp.frequency.value = 1500;
      const wet = audio.ctx.createGain();
      wet.gain.value = 0.26;
      audio.master.connect(delay);
      delay.connect(damp);
      damp.connect(wet);
      wet.connect(sink);
      wet.connect(delay);
      const len = audio.ctx.sampleRate;
      const buf = audio.ctx.createBuffer(1, len, len);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      audio.noise = buf;
    }
    if (audio.ctx.state === "suspended") audio.ctx.resume();
  }

  function noiseBurst(t, dur, gain, type, freq, q) {
    const src = audio.ctx.createBufferSource();
    src.buffer = audio.noise;
    src.loop = true;
    const filt = audio.ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = freq;
    filt.Q.value = q || 0.7;
    const g = audio.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(filt).connect(g).connect(audio.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  function tone(t, dur, gain, f0, f1, type) {
    const osc = audio.ctx.createOscillator();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = audio.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    osc.connect(g).connect(audio.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function sfx(kind, level) {
    if (!audio.on || !audio.ctx || audio.ctx.state !== "running") return;
    const t = audio.ctx.currentTime;
    const v = level === undefined ? 1 : level;
    if (kind === "crack") {
      if (t - audio.lastPop < 0.016) return;       // a long string would otherwise saturate
      audio.lastPop = t;
      noiseBurst(t, rnd(0.03, 0.05), 0.9 * v, "highpass", rnd(1400, 3200));   // the snap
      noiseBurst(t, 0.09, 0.4 * v, "bandpass", rnd(500, 900), 0.8);           // the paper tube
      tone(t, 0.045, 0.35 * v, rnd(190, 260), 70);
    } else if (kind === "bang") {
      noiseBurst(t, 0.05, 0.9 * v, "highpass", 1200);
      noiseBurst(t, 0.3, 0.8 * v, "lowpass", 2200);
      tone(t, 0.26, 0.6 * v, 150, 40);
    } else if (kind === "boom") {
      noiseBurst(t, 0.9 * v, 0.9, "lowpass", 420);
      noiseBurst(t, 0.18, 0.5, "highpass", 1400);
      tone(t, 0.7 * v, 0.9, 95, 28);
    } else if (kind === "pluck") {
      const f = pick([293.66, 329.63, 392.0, 440.0, 493.88, 587.33]);
      tone(t, 1.4, 0.2 * v, f, f * 0.997, "triangle");
      tone(t, 0.5, 0.07 * v, f * 2, f * 1.995);
      noiseBurst(t, 0.02, 0.05 * v, "bandpass", f * 4, 2);
    } else if (kind === "thud") {
      tone(t, 0.09, 0.22 * v, 110, 55);
    } else if (kind === "tink") {
      const scale = [1046.5, 1174.7, 1318.5, 1568.0, 1760.0, 2093.0];
      const f = pick(scale);
      tone(t, 0.6, 0.11 * v, f, f * 0.995);
      tone(t, 0.35, 0.05 * v, f * 2.01, f * 2, "triangle");
    }
  }

  function setSound(on) {
    audio.on = on;
    try { window.localStorage.setItem("bengbeng-sound", on ? "1" : "0"); } catch (e) { /* private mode */ }
    if (on) primeAudio();
    if (soundBtn) {
      soundBtn.setAttribute("aria-pressed", String(on));
      const label = soundBtn.querySelector("[data-sound-label]");
      if (label) label.textContent = on ? "on" : "off";
    }
    if (badgeEl) badgeEl.textContent = on ? "LIVE · SOUND ON" : "LIVE · NO SOUND";
  }

  /* ----------------------------------------------- sparks, smoke, flashes */
  function addParticle(p) {
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push(p);
  }

  function addSmoke(p) {
    if (smoke.length >= MAX_SMOKE) smoke.shift();
    smoke.push(p);
  }

  function flash(x, y, scale, color) {
    flashes.push({ x, y, t: 0, life: 0.36, scale, color });
    shocks.push({ x, y, t: 0, life: 0.72, max: 82 * scale, color });
  }

  // velocities of sparks are in px per 1/60 s, as in the original fireworks
  function makeParticle(x, y, vx, vy, life, color, size, gravity, drag, kind) {
    return {
      x, y, vx, vy,
      life, maxLife: life,
      color, size,
      gravity, drag,
      kind: kind || "spark",
      flicker: Math.random() < 0.14,
      asBefore,
      split: false,
      didSplit: false
    };
  }

  function makeSmoke(x, y, vx, vy, life, size) {
    return { x, y, vx, vy, life, maxLife: life, size, drag: 0.992, rise: rnd(2, 8), a: 0.3 };
  }

  // one soft grey puff, drawn once and stamped for every puff of smoke
  let puff = null;
  function puffImage() {
    if (puff) return puff;
    puff = document.createElement("canvas");
    puff.width = puff.height = 64;
    const c = puff.getContext("2d");
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(190,186,176,0.22)");
    g.addColorStop(1, "rgba(190,186,176,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    return puff;
  }

  function sayAt(x, y, str, size, color) {
    texts.push({ x: clamp(x, 30, W - 30), y: clamp(y, 30, H - 20), str, size, color, t: 0, life: 0.95 });
  }

  /* ------------------------------------------------------------ fireworks */
  // This toy is the original one, unchanged: the same shells, the same motion, no sound.
  let asBefore = false;

  function heartPoint(t) {
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    return [x / 18, y / 18];
  }

  function cloverPoint(t) {
    const r = 0.42 + 0.58 * Math.abs(Math.cos(2 * t));
    return [Math.cos(t) * r, Math.sin(t) * r];
  }

  function launchShell(x, y, scale) {
    if (reduced) return;
    const targetX = clamp(x, 26, W - 26);
    const targetY = clamp(y, 34, H - 44);
    rockets.push({
      x0: clamp(targetX + rnd(-22, 22), 14, W - 14),
      y0: H + 6,
      x1: targetX,
      y1: targetY,
      t: 0,
      fly: rnd(0.32, 0.44),
      type: pick(FIREWORK_TYPES),
      scale: scale || 1,
      trailClock: 0
    });
    startLoop();
  }

  function burst(x, y, scale, type) {
    if (reduced) return;
    scale = scale || 1;
    type = type || pick(FIREWORK_TYPES);
    if (type === "double") {
      burst(x, y, scale * 0.72, "ring");
      burst(x, y, scale * 1.12, "ring");
      return;
    }

    asBefore = true;
    const colors = pick(FIREWORK_SETS);
    const shapeColors = type === "heart"
      ? ["#ff2d55", "#ff7aa8", "#ffd60a", "#ffffff"]
      : type === "clover"
      ? ["#30d158", "#00e5a0", "#c7f464", "#ffd700", "#ffffff"]
      : colors;
    let n = 300;
    let speed = 5.4;
    let life = 3.4;
    let gravity = 2.4;
    let drag = 0.992;
    let size = 1.7;

    if (type === "chrysanthemum") { n = 330; speed = 5.8; life = 3.6; gravity = 2.0; size = 1.6; }
    if (type === "willow") { n = 240; speed = 4.8; life = 4.2; gravity = 1.0; drag = 0.995; size = 1.4; }
    if (type === "ring") { n = 260; speed = 5.0; life = 3.2; gravity = 1.5; size = 1.6; }
    if (type === "crossette") { n = 150; speed = 5.4; life = 3.2; gravity = 2.8; size = 1.7; }
    if (type === "palm") { n = 100; speed = 5.2; life = 3.8; gravity = 1.2; size = 2.6; }
    if (type === "heart") { n = 250; life = 4.2; gravity = 0.8; drag = 0.996; size = 1.9; }
    if (type === "clover") { n = 270; life = 4.2; gravity = 0.7; drag = 0.996; size = 1.9; }

    for (let i = 0; i < n; i++) {
      let vx;
      let vy;
      if (type === "heart") {
        const [hx, hy] = heartPoint((i / n) * Math.PI * 2 + rnd(-0.012, 0.012));
        vx = hx * 4.1 * scale;
        vy = hy * 4.1 * scale;
      } else if (type === "clover") {
        const [cx, cy] = cloverPoint((i / n) * Math.PI * 2 + rnd(-0.012, 0.012));
        vx = cx * 4.1 * scale;
        vy = cy * 4.1 * scale;
      } else if (type === "ring") {
        const a = (i / n) * Math.PI * 2;
        vx = Math.cos(a) * speed * scale;
        vy = Math.sin(a) * speed * scale * 0.64;
      } else {
        const a = (i / n) * Math.PI * 2 + rnd(-0.018, 0.018);
        const s = speed * scale * Math.sqrt(rnd(0.1, 1));
        vx = Math.cos(a) * s;
        vy = Math.sin(a) * s;
      }
      const r = Math.random();
      const color = r < 0.72 ? shapeColors[0] : r < 0.94 ? shapeColors[1] : "#ffffff";
      const p = makeParticle(x, y, vx, vy, life * rnd(0.82, 1.12), color,
        size * rnd(0.62, 1.28), gravity * rnd(0.85, 1.15), drag, "spark");
      p.split = type === "crossette" && i % 2 === 0;
      addParticle(p);
    }

    flash(x, y, 1.55 * scale, shapeColors[0]);
    shocks.push({ x, y, t: 0, life: 0.65, max: 96 * scale, color: shapeColors[0] });

    for (let i = 0; i < 24; i++) {
      const a = rnd(0, Math.PI * 2);
      const s = rnd(0.5, 2.2);
      addParticle(makeParticle(x, y, Math.cos(a) * s, Math.sin(a) * s,
        rnd(0.3, 0.8), pick(["#ffffff", "#ffd60a", shapeColors[1]]),
        rnd(0.6, 1.2), 28, 0.98, "spark"));
    }
    asBefore = false;
  }

  function launchGrand(x, y) {
    if (reduced) return;
    rockets.push({
      x0: clamp(x + rnd(-18, 18), 18, W - 18),
      y0: H + 8,
      x1: clamp(x, 42, W - 42),
      y1: clamp(y, 46, H - 58),
      t: 0,
      fly: 0.62,
      type: "grand",
      scale: 1,
      grand: true,
      trailClock: 0
    });
    startLoop();
  }

  function grandBurst(x, y) {
    if (reduced) return;
    asBefore = true;
    const gold = ["#ffd700", "#ffe9a8", "#fffbe6", "#ffffff"];
    const jewel = ["#4169e1", "#8b1e3f", "#1f7a5a", "#bf9b30", "#ffd700"];

    flash(x, y, 3.0, "#ffd700");
    fireballs.push({ x, y, t: 0, life: 2.2, scale: 1.35 });
    shocks.push({ x, y, t: 0, life: 1.1, max: 280, color: "#ffd700" });
    shocks.push({ x, y, t: 0.08, life: 0.95, max: 215, color: "#ffffff" });

    for (let i = 0; i < 420; i++) {
      const a = (i / 420) * Math.PI * 2 + rnd(-0.01, 0.01);
      const s = 6.2 * Math.sqrt(rnd(0.12, 1));
      addParticle(makeParticle(x, y, Math.cos(a) * s, Math.sin(a) * s,
        rnd(3.6, 4.4), pick(gold), rnd(1.8, 2.8), 1.2, 0.994, "spark"));
    }

    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2 + rnd(-0.02, 0.02);
      const s = 3.2 * Math.sqrt(rnd(0.1, 1));
      addParticle(makeParticle(x, y, Math.cos(a) * s, Math.sin(a) * s,
        rnd(3.8, 4.6), pick(["#ffd700", "#e6b84a", "#ffe9a8"]),
        rnd(1.2, 2.0), 0.7, 0.996, "spark"));
    }

    for (let i = 0; i < 240; i++) {
      const a = (i / 240) * Math.PI * 2 + rnd(-0.02, 0.02);
      const s = 4.0 * Math.sqrt(rnd(0.15, 1));
      addParticle(makeParticle(x, y, Math.cos(a) * s, Math.sin(a) * s,
        rnd(3.2, 3.8), pick(jewel), rnd(1.3, 2.2), 1.5, 0.994, "spark"));
    }

    for (let i = 0; i < 180; i++) {
      const a = (i / 180) * Math.PI * 2;
      addParticle(makeParticle(x, y,
        Math.cos(a) * 5.8, Math.sin(a) * 5.8 * 0.66,
        rnd(3.2, 3.8), pick(["#fffbe6", "#ffd700", "#ffffff"]),
        rnd(1.4, 2.2), 1.0, 0.995, "spark"));
    }

    for (let i = 0; i < 140; i++) {
      const a = rnd(0, Math.PI * 2);
      const s = rnd(1.2, 5.2);
      addParticle(makeParticle(x, y, Math.cos(a) * s, Math.sin(a) * s,
        rnd(1.4, 2.4), pick(["#ffffff", "#ffe9a8", "#ffd700"]),
        rnd(0.6, 1.2), 2.0, 0.99, "spark"));
    }
    asBefore = false;
  }

  function splitParticle(p) {
    asBefore = !!p.asBefore;
    for (let i = 0; i < 4; i++) {
      const a = rnd(0, Math.PI * 2);
      const s = rnd(0.5, 2.6);
      addParticle(makeParticle(p.x, p.y, Math.cos(a) * s, Math.sin(a) * s,
        rnd(0.3, 0.7), i === 0 ? "#ffffff" : p.color,
        rnd(0.7, 1.5), 28, 0.97, "spark"));
    }
    asBefore = false;
  }

  function fireworksAt(x, y) {
    x = clamp(x, 18, W - 18);
    y = clamp(y, 18, H - 18);
    launchShell(x, y, 1.1);
    window.setTimeout(() => {
      launchShell(x + rnd(-120, 120), y + rnd(-58, 52), rnd(0.55, 0.75));
    }, rnd(160, 260));
    window.setTimeout(() => {
      launchShell(x + rnd(-150, 150), y + rnd(-70, 62), rnd(0.42, 0.58));
    }, rnd(320, 410));
  }

  function drawCharge(g) {
    if (g.mode !== "fireworks" || g.moved || g.fired) return;
    const p = Math.min(1, g.t / 0.72);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(g.sx, g.sy, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(g.sx, g.sy, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
    ctx.stroke();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = "#ffd700";
    ctx.font = '9px "Inter", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("HOLD", g.sx, g.sy + 42);
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------- paper, the red litter */
  function addPaper(x, y, vx, vy) {
    if (papers.length >= MAX_PAPER) papers.shift();
    papers.push({
      x, y, vx, vy,
      rot: rnd(0, TAU), vr: rnd(-10, 10),
      w: rnd(3, 6.5), h: rnd(2, 4),
      color: pick(PAPER_COLORS),
      phase: rnd(0, TAU), age: 0,
      settled: false, rest: 0, keep: rnd(16, 28), lift: rnd(0, 6)
    });
  }

  function paperShower(x, y, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU);
      const s = rnd(0.25, 1) * speed;
      addPaper(x, y, Math.cos(a) * s, Math.sin(a) * s - speed * 0.35);
    }
  }

  /* ---------------------------------------------------------- firecrackers */
  // One cracker going off: a ragged white-hot flash a few hundredths of a second long,
  // a spray of short sparks, a puff of smoke that hangs about, and shreds of the wrapper.
  // power 1 is an ordinary cracker, about 2 one of the big ones, 3 and up a double-banger.
  function crack(x, y, power) {
    const p = power || 1;
    const big = p > 1.5;
    const spikes = [];
    for (let i = 0; i < 9; i++) spikes.push(rnd(0.7, 1.5));
    cracks.push({ x, y, t: 0, life: 0.07 + 0.035 * p, r: 12 * p * rnd(0.85, 1.2), spikes, turn: rnd(0, TAU) });
    const sparks = Math.round(8 * p * (big ? 1.4 : 1));
    for (let i = 0; i < sparks; i++) {
      const a = rnd(0, TAU);
      const v = rnd(1.5, 6.5) * Math.sqrt(p);
      addParticle(makeParticle(x, y, Math.cos(a) * v, Math.sin(a) * v,
        rnd(0.1, 0.2 + 0.1 * p), pick(CRACK_SPARKS), rnd(0.6, 0.9 + 0.3 * p), 40, 0.94, "spark"));
    }
    const puffs = Math.round(1.6 * p + 0.4);
    for (let i = 0; i < puffs; i++) {
      const s = makeSmoke(x + rnd(-7, 7) * p, y + rnd(-7, 7) * p, rnd(-0.5, 0.5) * p, rnd(-0.5, 0.1) * p,
        rnd(2.4, 4.2), rnd(13, 24) * (big ? 1.6 : 1));
      s.a = 0.85;                                 // thicker than the smoke of a shell
      s.rise = rnd(1, 3.5);
      addSmoke(s);
    }
    paperShower(x, y, Math.round(7 * Math.pow(p, 1.3)), 230 + 70 * p);
    if (big) {
      shake(2 * p, 0.09 * p);
      whiteout = Math.max(whiteout, 0.02 * p);
    } else {
      shake(1.2, 0.07);
    }
    sfx(big ? "bang" : "crack", big ? p / 2.2 : rnd(0.55, 1));
  }

  function addString(s) {
    if (strings.length >= 4) {                    // too many at once: the oldest goes off in one volley
      const old = strings[0];
      old.items.forEach((it) => { if (!it.popped) it.popAt = Math.min(it.popAt, old.t + rnd(0, 0.5)); });
    }
    s.t = 0;
    s.lastPop = 0;
    s.sparks = 0;
    s.total = s.items.length;
    strings.push(s);
    startLoop();
  }

  // Where each cracker of a hanging braid is right now.  The braid bends more towards its free end.
  function poseString(s) {
    for (const it of s.items) {
      const phi = s.theta * (0.3 + 0.7 * it.s / s.L);
      const a = phi + it.lean;
      const half = (it.big ? BIG_H : TUBE_H) / 2 + 1.5;
      it.fx = s.ax + Math.sin(phi) * it.s;
      it.fy = s.ay + Math.cos(phi) * it.s;
      it.x = it.fx + Math.sin(a) * half;
      it.y = it.fy + Math.cos(a) * half;
      it.rot = -a;
    }
  }

  // tap: 大地红.  A braid as long as the stage allows, hung from a bamboo pole and lit at the
  // bottom.  It burns upward, a big one every so often, to the bundle of big ones at the top.
  function hangString(x, y) {
    const ax = clamp(x, 40, W - 40);
    const floor = groundY(ax) - 30;
    const ay = clamp(y, 20, Math.max(20, floor - Math.min(300, H * 0.55)));
    const L = clamp(floor - ay, 90, 640);
    const rows = Math.max(5, Math.floor((L - 34) / ROW));
    const step = rnd(0.085, 0.105);
    const items = [];
    let at = 0.45;
    for (let r = 0; r < rows; r++) {              // row 0 is the lowest, and the first to go
      const s = L - 6 - r * ROW;
      const bigSide = r % 9 === 5 ? (Math.random() < 0.5 ? -1 : 1) : 0;
      for (const side of [-1, 1]) {
        items.push({ s, side, lean: side * rnd(0.52, 0.8), big: side === bigSide, popped: false, popAt: at + rnd(0, 0.9) * step });
      }
      at += step;
    }
    at += 0.12;
    const head = 7;                               // 炮头: saved for last
    for (let j = 0; j < head; j++) {
      items.push({ s: rnd(12, 24), side: j % 2 ? 1 : -1, lean: (j - (head - 1) / 2) * 0.3, big: true, popped: false, popAt: at });
      at += rnd(0.07, 0.11);
    }
    const s = { hang: true, ax, ay, L, theta: rnd(-0.03, 0.03), omega: 0, items };
    poseString(s);
    addString(s);
    setStatus(LABELS.firecracker + " — 大地红，" + items.length + " 响. A string of " + items.length + ".");
  }

  // drag: the same braid rolled out along the path, lit where the drag began
  function layString(path) {
    const items = [];
    const step = rnd(0.08, 0.095);
    let carry = 0;
    let row = 0;
    for (let i = 1; i < path.length && row < 150; i++) {
      const [x0, y0] = path[i - 1];
      const [x1, y1] = path[i];
      const seg = Math.hypot(x1 - x0, y1 - y0);
      if (seg < 0.01) continue;
      const a = Math.atan2(y1 - y0, x1 - x0);
      let d = ROW - carry;
      while (d <= seg && row < 150) {
        const fx = x0 + Math.cos(a) * d;
        const fy = y0 + Math.sin(a) * d;
        const bigSide = row % 9 === 5 ? (Math.random() < 0.5 ? -1 : 1) : 0;
        for (const side of [-1, 1]) {
          const big = side === bigSide;
          const dir = a + side * rnd(0.85, 1.15);          // herringbone, pointing along the run
          const half = (big ? BIG_H : TUBE_H) / 2 + 1.5;
          items.push({
            fx, fy, side, big,
            x: fx + Math.cos(dir) * half,
            y: fy + Math.sin(dir) * half,
            rot: dir - Math.PI / 2,
            popped: false,
            popAt: 0.45 + (row + rnd(0, 0.9)) * step
          });
        }
        row++;
        d += ROW;
      }
      carry = seg - (d - ROW);
    }
    if (row < 3) return false;
    addString({ hang: false, items });
    setStatus(LABELS.firecracker + " — " + items.length + " 响 laid out; lit at the start.");
    return true;
  }

  // Now and then a cracker is blown off the braid before its own fuse has burnt down,
  // and goes off a moment later in the air or on the ground.
  function throwStray(it) {
    if (strays.length >= 40) return false;
    strays.push({
      x: it.x, y: it.y,
      vx: (Math.random() < 0.75 ? it.side : -it.side) * rnd(80, 420),
      vy: rnd(-480, -60),
      rot: it.rot, vr: rnd(-24, 24),
      fuse: rnd(0.12, 0.8)
    });
    return true;
  }

  function updateStray(st, dt) {
    st.fuse -= dt;
    if (st.fuse <= 0) {
      crack(st.x, st.y, 1);
      return false;
    }
    st.vy += 1100 * dt;
    st.x += st.vx * dt;
    st.y += st.vy * dt;
    st.rot += st.vr * dt;
    if (st.x < 4) { st.x = 4; st.vx = Math.abs(st.vx) * 0.5; }
    if (st.x > W - 4) { st.x = W - 4; st.vx = -Math.abs(st.vx) * 0.5; }
    const g = groundY(st.x) - 4;
    if (st.y > g) {
      st.y = g;
      st.vy = -Math.abs(st.vy) * 0.35;
      st.vx *= 0.6;
      st.vr *= 0.5;
    }
    return true;
  }

  function updateString(s, dt) {
    s.t += dt;
    if (s.hang) {                                 // the braid swings and jerks as it is kicked about
      s.omega += (-34 * s.theta - 2.4 * s.omega) * dt;
      s.theta = clamp(s.theta + s.omega * dt, -0.3, 0.3);
      poseString(s);
    }
    let left = 0;
    let front = null;
    for (const it of s.items) {
      if (it.popped) continue;
      if (s.t < it.popAt) {
        left++;
        if (!front || it.popAt < front.popAt) front = it;
        continue;
      }
      it.popped = true;
      s.lastPop = s.t;
      if (s.hang) s.omega -= it.side * rnd(0.25, 0.75) * (it.big ? 2.2 : 1);
      if (it.big || Math.random() > 0.11 || !throwStray(it)) crack(it.x, it.y, it.big ? 2.2 : 1);
    }
    s.reach = 0;
    if (front) {                                  // the fuse, spitting just ahead of the bangs
      s.sparks += dt * 90;
      while (s.sparks >= 1) {
        s.sparks -= 1;
        addParticle(makeParticle(front.fx + rnd(-2, 2), front.fy + rnd(-2, 2), rnd(-1.6, 1.6), rnd(-1.2, 2.2),
          rnd(0.12, 0.32), pick(CRACK_SPARKS), rnd(0.5, 1), 30, 0.95, "spark"));
      }
      if (s.hang) for (const it of s.items) if (!it.popped && it.s > s.reach) s.reach = it.s;
    }
    return left > 0 || s.t < s.lastPop + 0.3;
  }

  function drawCracker(x, y, rot, alpha, hot, big) {
    const w = big ? BIG_W : TUBE_W;
    const h = big ? BIG_H : TUBE_H;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#a8926a";                  // its own fuse, up to the braid
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(0, -h / 2 - 3);
    ctx.stroke();
    ctx.fillStyle = big ? "#a81712" : "#c2201a";  // the red roll
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.3)";      // lit along one side, dark along the other
    ctx.fillRect(-w / 2 + 1, -h / 2 + 1.5, w * 0.2, h - 3);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(w / 2 - w * 0.26, -h / 2, w * 0.26, h);
    ctx.fillStyle = "#d8c8a4";                    // the clay plugs at the two ends
    ctx.fillRect(-w / 2, -h / 2, w, 1.6);
    ctx.fillRect(-w / 2, h / 2 - 1.6, w, 1.6);
    if (big) {
      ctx.fillStyle = "#e8c76a";                  // a gold band marks a big one
      ctx.fillRect(-w / 2, -2, w, 4);
    }
    if (hot) {
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "#ffd60a";
      ctx.beginPath();
      ctx.arc(0, -h / 2 - 3, 1.4 + Math.random() * 1.8, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.restore();
  }

  function drawString(s) {
    const items = s.items;
    ctx.globalCompositeOperation = "source-over";
    ctx.lineCap = "round";
    if (s.hang) {
      ctx.globalAlpha = 0.95;                     // the bamboo pole
      ctx.strokeStyle = "#9a8a48";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(s.ax - 52, s.ay - 4);
      ctx.lineTo(s.ax + 52, s.ay - 4);
      ctx.stroke();
      ctx.strokeStyle = "#5f5426";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const dx of [-30, 6, 38]) {
        ctx.moveTo(s.ax + dx, s.ay - 6.5);
        ctx.lineTo(s.ax + dx, s.ay - 1.5);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 0.85;                       // the braided fuse, as far as it has not burnt
    ctx.strokeStyle = "#b9a374";
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (s.hang) {
      ctx.moveTo(s.ax, s.ay - 4);
      for (let d = 0; d < s.reach + 12; d += 12) {
        const at = Math.min(d, s.reach);
        const phi = s.theta * (0.3 + 0.7 * at / s.L);
        ctx.lineTo(s.ax + Math.sin(phi) * at, s.ay + Math.cos(phi) * at);
      }
    } else {
      let started = false;
      for (const it of items) {
        if (it.popped) continue;
        if (started) ctx.lineTo(it.fx, it.fy);
        else ctx.moveTo(it.fx, it.fy);
        started = true;
      }
    }
    ctx.stroke();
    ctx.lineCap = "butt";
    for (const it of items) {
      if (!it.popped) drawCracker(it.x, it.y, it.rot, 1, it.popAt - s.t < 0.1, it.big);
    }
    ctx.globalAlpha = 1;
  }

  // hold: 二踢脚, one bang to launch it and a second one in the air
  function addKicker(x, y) {
    if (kickers.length > 5) return;
    kickers.push({ x: clamp(x, 20, W - 20), y: clamp(y, 60, H - 20), vx: rnd(-25, 25), vy: 0, t: 0, phase: 0, rot: 0 });
    setStatus(LABELS.firecracker + " — 二踢脚, a double-banger.");
    startLoop();
  }

  function updateKicker(k, dt) {
    k.t += dt;
    if (k.phase === 0) {
      if (k.t >= 0.45) {
        k.phase = 1;
        crack(k.x, k.y + 14, 2.2);
        const rise = clamp(k.y - 46, 60, 320);
        k.vy = -Math.sqrt(2 * 900 * rise);
      }
      return true;
    }
    k.vy += 900 * dt;
    k.x += k.vx * dt;
    k.y += k.vy * dt;
    k.rot += k.vx * 0.004;
    addParticle(makeParticle(k.x + rnd(-2, 2), k.y + 12, rnd(-0.4, 0.4), rnd(0.5, 2),
      rnd(0.2, 0.45), pick(CRACK_SPARKS), rnd(0.7, 1.4), 20, 0.97, "spark"));
    if (k.vy >= -40) {
      crack(k.x, k.y, 3.4);
      blast(k.x, k.y, 90, 0.5, null);
      return false;
    }
    return true;
  }

  function drawKicker(k) {
    ctx.save();
    ctx.translate(k.x, k.y);
    ctx.rotate(k.rot);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#b51f1a";
    ctx.fillRect(-5, -14, 10, 28);
    ctx.fillStyle = "#e8c76a";
    ctx.fillRect(-5, -14, 10, 3);
    ctx.fillRect(-5, -1.5, 10, 3);
    ctx.fillRect(-5, 11, 10, 3);
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fillRect(-2.5, -11, 1.6, 22);
    if (k.phase === 0) {
      ctx.strokeStyle = "#6b4a24";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, 14);
      ctx.lineTo(4, 22 - k.t * 14);
      ctx.stroke();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "#ffd60a";
      ctx.beginPath();
      ctx.arc(4, 22 - k.t * 14, 1.5 + Math.random() * 2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ---------------------------------------------------------------- bombs */
  function newBomb(x, y, held) {
    if (bombs.length >= MAX_BOMBS) {
      const first = bombs.find((b) => !b.held);
      if (first) first.fuse = Math.min(first.fuse, 0.04);
    }
    const b = { x, y, vx: 0, vy: 0, r: 12.5, big: false, rot: rnd(-0.4, 0.4), fuse: 1.55, total: 1.55, held, t: 0, grounded: false };
    bombs.push(b);
    startLoop();
    return b;
  }

  function makeBig(b) {
    b.big = true;
    b.r = 19;
    b.fuse = b.total = 2.1;
  }

  function updateBomb(b, dt) {
    b.t += dt;
    if (Math.random() < dt * 34) {
      const tip = fuseTip(b);
      addParticle(makeParticle(tip[0], tip[1], rnd(-0.9, 0.9), rnd(-1.4, 0.3),
        rnd(0.12, 0.3), pick(["#ffd60a", "#ffffff", "#ff9f0a"]), rnd(0.5, 1.1), 30, 0.96, "spark"));
    }
    if (b.held) return true;
    b.fuse -= dt;
    b.vy += 1500 * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.6; }
    if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * 0.6; }
    if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.5; }
    const snow = pileAt(b.x);
    const gy = groundY(b.x) - b.r + Math.min(snow, b.r * 0.5);
    if (b.y > gy) {
      b.y = gy;
      if (b.vy > 90) {
        const hit = b.vy;
        b.vy = -b.vy * (snow > 3 ? 0.22 : 0.46);
        sfx("thud", clamp(hit / 900, 0.2, 1));
        if (snow > 3) snowPuff(b.x, groundY(b.x), Math.min(10, hit / 90), 1.6);
      } else {
        b.vy = 0;
      }
      b.vx *= Math.pow(snow > 3 ? 0.02 : 0.25, dt);
    }
    b.rot += (b.vx / b.r) * dt;
    if (b.fuse <= 0) {
      explode(b);
      return false;
    }
    return true;
  }

  function fuseTip(b) {
    const left = clamp(b.fuse / b.total, 0, 1);
    const lx = b.r * (0.3 + 0.75 * left);
    const ly = -b.r * (1 + 0.85 * left);
    const c = Math.cos(b.rot);
    const s = Math.sin(b.rot);
    return [b.x + lx * c - ly * s, b.y + lx * s + ly * c];
  }

  function drawBomb(b) {
    const r = b.r;
    const urgent = !b.held && b.fuse < 0.5;
    const throb = urgent ? 1 + 0.07 * Math.sin(b.t * 46) : 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.scale(throb, throb);
    ctx.rotate(b.rot);
    ctx.fillStyle = "#07080a";
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#b3261e";
    ctx.fillRect(-r, -r * 0.16, r * 2, r * 0.32);
    ctx.fillStyle = "#3a3d44";
    ctx.fillRect(r * 0.05, -r * 1.12, r * 0.5, r * 0.26);
    const left = clamp(b.fuse / b.total, 0, 1);
    ctx.strokeStyle = "#d9b26a";
    ctx.lineWidth = b.big ? 2.6 : 2;
    ctx.beginPath();
    ctx.moveTo(r * 0.3, -r);
    ctx.quadraticCurveTo(r * (0.3 + 0.6 * left), -r * (1 + 0.3 * left), r * (0.3 + 0.75 * left), -r * (1 + 0.85 * left));
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.beginPath();
    ctx.arc(b.x - r * 0.32, b.y - r * 0.38, r * 0.25, 0, TAU);
    ctx.fill();
    if (urgent && Math.sin(b.t * 46) > 0) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = "#ff3b30";
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    const tip = fuseTip(b);
    const spark = 1.4 + Math.random() * 2;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "#ffd60a";
    ctx.beginPath();
    ctx.arc(tip[0], tip[1], spark, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(tip[0], tip[1], spark * 0.45, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }

  function explode(b) {
    const size = clamp(Math.min(W, H) / 480, 0.7, 1.3);
    const R = (b.big ? 205 : 125) * size;
    const k = b.big ? 1.6 : 1;
    flash(b.x, b.y, 3.2 * k, "#ffd60a");
    for (let i = 0; i < (b.big ? 5 : 3); i++) {
      fireballs.push({ x: b.x + rnd(-14, 14) * k, y: b.y + rnd(-12, 12) * k, t: 0, life: rnd(0.55, 0.95) * k, scale: rnd(0.72, 1.25) * k });
    }
    shocks.push({ x: b.x, y: b.y, t: 0, life: 1.05, max: R * 2, color: "#ff9f0a", wide: true });
    shocks.push({ x: b.x, y: b.y, t: 0.06, life: 0.9, max: R * 1.45, color: "#ffffff" });
    shocks.push({ x: b.x, y: b.y, t: 0.14, life: 0.72, max: R, color: "#ff2d55" });
    for (let i = 0; i < 150 * k; i++) {
      const a = rnd(0, TAU);
      const s = rnd(1.5, 13) * Math.sqrt(k);
      addParticle(makeParticle(b.x, b.y, Math.cos(a) * s, Math.sin(a) * s,
        rnd(0.4, 1.15), pick(["#ffd60a", "#ff9f0a", "#ff2d55", "#ffffff"]),
        rnd(0.9, 3.0), 34, 0.975, "spark"));
    }
    for (let i = 0; i < 40 * k; i++) {
      const a = rnd(0, TAU);
      const s = rnd(1.5, 7.5);
      addParticle(makeParticle(b.x, b.y, Math.cos(a) * s, Math.sin(a) * s,
        rnd(0.6, 1.3), pick(["#2b2b2b", "#3a2a1f", "#1a1a1a", "#5a3a20"]),
        rnd(1.2, 3.4), 48, 0.99, "debris"));
    }
    for (let i = 0; i < 26 * k; i++) {        // slow embers that outlive the flash
      const a = rnd(0, TAU);
      const s = rnd(0.6, 4.5);
      addParticle(makeParticle(b.x, b.y, Math.cos(a) * s, Math.sin(a) * s - 1.5,
        rnd(1.4, 2.6), pick(["#ff9f0a", "#ff5a1f", "#ffd60a"]), rnd(0.9, 1.6), 9, 0.985, "spark"));
    }
    for (let i = 0; i < 46 * k; i++) {
      addSmoke(makeSmoke(b.x + rnd(-22, 22) * k, b.y + rnd(-12, 18), rnd(-24, 24), rnd(-28, -2), rnd(1.4, 2.8), rnd(16, 34) * k));
    }
    if (b.big) {                               // a column and a cap: the mushroom
      for (let i = 0; i < 34; i++) {
        addSmoke(makeSmoke(b.x + rnd(-10, 10), b.y - i * 3, rnd(-0.15, 0.15), rnd(-2.2, -0.9), rnd(2.2, 3.4), rnd(18, 30)));
      }
      for (let i = 0; i < 30; i++) {
        const a = rnd(Math.PI, TAU);
        addSmoke(makeSmoke(b.x + Math.cos(a) * 26, b.y - 96 + Math.sin(a) * 12, Math.cos(a) * 0.9, rnd(-0.9, -0.3), rnd(2.4, 3.6), rnd(26, 44)));
      }
    }
    sayAt(b.x, b.y - R * 0.5, b.big ? "轰隆" : "轰", b.big ? 46 : 34, "#ffe9a8");
    whiteout = Math.max(whiteout, b.big ? 0.46 : 0.24);
    shake(b.big ? 17 : 9, b.big ? 0.6 : 0.42);
    sfx("boom", b.big ? 1.3 : 1);
    blast(b.x, b.y, R, k, b);
  }

  // Everything loose within reach of an explosion is pushed, lit or thrown.
  function blast(x, y, R, power, source) {
    const reach = R * 1.5;
    for (const o of bombs) {
      if (o === source || o.held) continue;
      const dx = o.x - x;
      const dy = o.y - y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > reach) continue;
      const f = (1 - d / reach) * power;
      o.vx += (dx / d) * f * 900;
      o.vy += (dy / d) * f * 900 - 220 * f;
      o.fuse = Math.min(o.fuse, 0.07 + d / 1400);
    }
    for (const k of kickers) {
      if (k.phase === 0 && Math.hypot(k.x - x, k.y - y) < reach) k.t = Math.max(k.t, 0.4);
    }
    for (const s of strings) {
      for (const it of s.items) {
        if (it.popped) continue;
        const d = Math.hypot(it.x - x, it.y - y);
        if (d < R) it.popAt = Math.min(it.popAt, s.t + d / 1000);
      }
    }
    for (const st of strays) {
      const dx = st.x - x;
      const dy = st.y - y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > reach) continue;
      const f = (1 - d / reach) * power;
      st.vx += (dx / d) * f * 800;
      st.vy += (dy / d) * f * 800 - 200 * f;
      st.fuse = Math.min(st.fuse, 0.05 + d / 1400);
    }
    for (const p of papers) {
      const dx = p.x - x;
      const dy = p.y - y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > reach) continue;
      const f = (1 - d / reach) * power;
      p.settled = false;
      p.rest = 0;
      p.vx += (dx / d) * f * 720;
      p.vy += (dy / d) * f * 720 - 200 * f;
      p.vr = rnd(-12, 12);
    }
    for (const p of petals) {
      const dx = p.x - x;
      const dy = p.y - y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > reach * 1.1) continue;
      const f = (1 - d / (reach * 1.1)) * power;
      p.settled = false;
      p.rest = 0;
      p.vx += (dx / d) * f * 600;
      p.vy += (dy / d) * f * 600 - 160 * f;
    }
    for (const fl of flakes) {
      const dx = fl.x - x;
      const dy = fl.y - y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > reach * 1.1) continue;
      const f = (1 - d / (reach * 1.1)) * power;
      fl.vx += (dx / d) * f * 560;
      fl.vy += (dy / d) * f * 560;
      fl.vr += rnd(-6, 6) * f;
    }
    const lift = groundY(x) - y;                 // how far above the ground the centre is
    if (pileTop > 1 && lift < R * 0.7) {
      const removed = crater(x, R * 0.8, R * 0.5 * (1 - Math.max(0, lift) / (R * 0.7)));
      if (removed > 1) snowPuff(x, groundY(x), clamp(removed / 14, 6, 70), 3.2 * Math.sqrt(power));
    }
  }

  /* ----------------------------------------------------------------- snow */
  function pileAt(x) {
    return pile[clamp((x / COL) | 0, 0, pile.length - 1)];
  }

  function groundY(x) {
    return H - FLOOR - pileAt(x);
  }

  function deposit(x, amount) {
    const c = x / COL;
    for (let k = -3; k <= 3; k++) {
      const i = Math.round(c + k);
      if (i < 0 || i >= pile.length) continue;
      pile[i] = Math.min(pileMax, pile[i] + amount * Math.exp(-(k * k) / 3));
    }
  }

  function crater(x, radius, depth) {
    let removed = 0;
    const from = Math.max(0, Math.floor((x - radius) / COL));
    const to = Math.min(pile.length - 1, Math.ceil((x + radius) / COL));
    for (let i = from; i <= to; i++) {
      const u = (i * COL - x) / radius;
      const cut = depth * (1 - u * u);
      if (cut <= 0) continue;
      const h = Math.max(0, pile[i] - cut);
      removed += pile[i] - h;
      pile[i] = h;
    }
    return removed;
  }

  function settlePile() {
    const limit = COL * 0.5;                     // steeper slopes slump: drifts, not peaks
    let top = 0;
    for (let i = 1; i < pile.length; i++) {
      const d = pile[i] - pile[i - 1];
      if (d > limit) { const m = (d - limit) * 0.5; pile[i] -= m; pile[i - 1] += m; }
      else if (d < -limit) { const m = (-d - limit) * 0.5; pile[i] += m; pile[i - 1] -= m; }
      if (pile[i] > top) top = pile[i];
    }
    pileTop = top;
  }

  // loose snow thrown up from the pile; it falls back and settles again
  function snowPuff(x, y, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = rnd(Math.PI * 1.08, Math.PI * 1.92);
      const s = rnd(0.3, 1) * speed * 60;
      addFlake(x + rnd(-10, 10), y - 2, Math.cos(a) * s * 2.2, Math.sin(a) * s * 2.6, rnd(2, 4.5), null);
    }
  }

  function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // One crystal, drawn once into its own canvas.  Each type describes a single
  // arm (pointing up, unit length); the arm is then repeated by symmetry.
  const sprites = {};
  function makeSprite(type, seed) {
    const S = 256;
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d");
    const R = S * 0.46;
    const rand = mulberry(seed);
    const jit = (v, a) => v * (1 + (rand() * 2 - 1) * a);
    const segs = [];
    const polys = [];
    let turn = 0;
    const rot = (x, y) => [x * Math.cos(turn) - y * Math.sin(turn), x * Math.sin(turn) + y * Math.cos(turn)];
    const line = (x1, y1, x2, y2, w) => { segs.push([...rot(x1, y1), ...rot(x2, y2), w]); };
    const poly = (pts, alpha, w) => { polys.push({ pts: pts.map((p) => rot(p[0], p[1])), alpha, w }); };
    const branch = (t, len, w) => {
      for (const sgn of [-1, 1]) line(0, -t, sgn * 0.866 * len, -t - 0.5 * len, w);
    };
    const hexAt = (cy, rad, alpha, w) => {
      const pts = [];
      for (let k = 0; k < 6; k++) pts.push([Math.sin(k * TAU / 6 + TAU / 12) * rad, -cy - Math.cos(k * TAU / 6 + TAU / 12) * rad]);
      poly(pts, alpha, w);
    };
    let arms = 6;

    if (type === "stellar") {
      line(0, 0, 0, -1, 0.07);
      branch(jit(0.36, 0.1), jit(0.34, 0.12), 0.05);
      branch(jit(0.58, 0.08), jit(0.27, 0.12), 0.045);
      branch(jit(0.78, 0.05), jit(0.16, 0.15), 0.04);
    } else if (type === "fern") {
      line(0, 0, 0, -1, 0.05);
      for (let i = 0; i < 7; i++) {
        const t = 0.17 + i * 0.118;
        const len = (0.38 * (1 - t) + 0.07) * jit(1, 0.12);
        branch(t, len, 0.032);
        branch(t + 0.058, len * 0.5, 0.022);
      }
    } else if (type === "plate") {
      const p = jit(0.66, 0.05);
      poly([[0, 0], [-0.5 * p, -0.866 * p], [0.5 * p, -0.866 * p]], 0.3, 0);
      line(-0.5 * p, -0.866 * p, 0.5 * p, -0.866 * p, 0.045);
      line(-0.25 * p, -0.433 * p, 0.25 * p, -0.433 * p, 0.028);
      line(0, 0, 0.5 * p, -0.866 * p, 0.022);
      line(0.5 * p, -0.866 * p, 0.5 * (p + 0.22), -0.866 * (p + 0.22), 0.04);
      line(0, -0.866 * p, 0, -0.866 * p - 0.1, 0.03);
    } else if (type === "sector") {
      const wide = jit(0.2, 0.15);
      const mid = jit(0.58, 0.08);
      poly([[0, -0.08], [wide, -mid], [0, -0.98], [-wide, -mid]], 0.3, 0.04);
      line(0, 0, 0, -0.98, 0.035);
      line(-wide * 0.6, -mid + 0.14, 0, -mid - 0.06, 0.02);
      line(wide * 0.6, -mid + 0.14, 0, -mid - 0.06, 0.02);
    } else if (type === "needle") {
      line(0, 0, 0, -1, 0.04);
      branch(jit(0.8, 0.04), 0.14, 0.03);
      branch(jit(0.5, 0.06), 0.08, 0.025);
      hexAt(0, 0.1, 0.5, 0.03);
    } else if (type === "twelve") {
      line(0, 0, 0, -1, 0.055);
      branch(jit(0.55, 0.06), 0.26, 0.04);
      branch(jit(0.78, 0.04), 0.14, 0.035);
      turn = TAU / 12;
      line(0, 0, 0, -0.62, 0.045);
      branch(0.4, 0.16, 0.035);
      turn = 0;
    } else if (type === "capped") {
      line(0, 0, 0, -0.62, 0.06);
      branch(jit(0.36, 0.08), 0.2, 0.04);
      hexAt(0.78, jit(0.2, 0.1), 0.34, 0.035);
    } else {                                     // triangle: three long arms, three short
      arms = 3;
      line(0, 0, 0, -1, 0.07);
      branch(jit(0.4, 0.08), 0.42, 0.05);
      branch(jit(0.68, 0.06), 0.24, 0.045);
      turn = TAU / 6;
      line(0, 0, 0, -0.44, 0.05);
      branch(0.28, 0.14, 0.035);
      turn = 0;
    }

    g.translate(S / 2, S / 2);
    g.lineCap = "round";
    g.lineJoin = "round";
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 0; k < arms; k++) {
        g.save();
        g.rotate((k * TAU) / arms);
        for (const p of polys) {
          g.beginPath();
          p.pts.forEach((pt, i) => (i ? g.lineTo(pt[0] * R, pt[1] * R) : g.moveTo(pt[0] * R, pt[1] * R)));
          g.closePath();
          if (pass === 0) {
            g.fillStyle = "rgba(196,230,255," + p.alpha + ")";
            g.fill();
          } else if (p.w) {
            g.strokeStyle = "rgba(255,255,255,0.95)";
            g.lineWidth = Math.max(1.4, p.w * R);
            g.stroke();
          }
        }
        for (const s of segs) {
          g.beginPath();
          g.moveTo(s[0] * R, s[1] * R);
          g.lineTo(s[2] * R, s[3] * R);
          if (pass === 0) {
            g.strokeStyle = "rgba(140,205,255,0.3)";
            g.lineWidth = s[4] * R * 2.4 + 3;
          } else {
            g.strokeStyle = "rgba(255,255,255,0.97)";
            g.lineWidth = Math.max(1.4, s[4] * R);
          }
          g.stroke();
        }
        g.restore();
      }
    }
    return c;
  }

  function spriteFor(type) {
    if (!sprites[type]) sprites[type] = [makeSprite(type, 11 + type.length * 97), makeSprite(type, 5021 + type.length * 13)];
    return pick(sprites[type]);
  }

  function addFlake(x, y, vx, vy, size, type) {
    if (flakes.length >= MAX_FLAKES) flakes.shift();
    flakes.push({
      x, y, vx, vy, size,
      rot: rnd(0, TAU), vr: rnd(-1.3, 1.3),
      phase: rnd(0, TAU), sway: rnd(14, 38),
      fall: rnd(36, 62) + size * 0.55,
      sprite: type ? spriteFor(type) : null,
      alpha: type ? 1 : rnd(0.55, 0.95),
      age: 0
    });
  }

  function snowBurst(x, y) {
    const type = SNOW_TYPES[snowIndex % SNOW_TYPES.length];
    snowIndex++;
    const n = 13 + ((Math.random() * 5) | 0);
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU);
      const s = rnd(60, 250);
      addFlake(x, y, Math.cos(a) * s, Math.sin(a) * s - 60, rnd(16, 36), type.id);
    }
    for (let i = 0; i < 22; i++) {
      const a = rnd(0, TAU);
      const s = rnd(0.6, 3.4);
      addParticle(makeParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, rnd(0.3, 0.8),
        pick(["#ffffff", "#cfe9ff", "#9fd8ff"]), rnd(0.6, 1.3), 6, 0.96, "spark"));
    }
    shocks.push({ x, y, t: 0, life: 0.7, max: 90, color: "#bfe6ff" });
    sfx("tink");
    setStatus(LABELS.snow + " — " + type.cn + ", " + type.en + ".");
    startLoop();
  }

  function releaseCrystal(g) {
    const grown = clamp((g.t - 0.18) / 1.5, 0.12, 1);
    const size = 30 + 100 * grown;
    addFlake(g.x, g.y, rnd(-10, 10), 6, size, g.snowType.id);
    const f = flakes[flakes.length - 1];
    f.vr = rnd(-0.5, 0.5);
    f.fall = 30 + size * 0.2;
    f.rot = g.spin;
    snowIndex++;
    sfx("tink", 1.2);
    setStatus(LABELS.snow + " — one " + g.snowType.en + ", " + Math.round(size) + " px across.");
  }

  /* -------------------------------------------------------- peach blossom */
  // 桃花.  A branch reaches in from the left, laid down the way an ink painter would do it:
  // a dark limb with the dry brush skipping, flowers dabbed on in colour with no outline.
  // The page puts a sheet of old paper behind the canvas while this toy is chosen.
  // Touch the branch and it lets its petals go.
  const INK = "26,21,18";
  const PETAL_TINTS = [                            // base, body and tip of one dab of colour
    ["255,238,240", "248,192,203", "228,128,152"],
    ["255,230,234", "245,170,188", "216,100,132"],
    ["253,220,228", "239,150,173", "200,78,114"]
  ];
  const MAX_PETALS = 460;
  const tree = {
    image: null, w: 0, h: 0, ax: 0, ay: 0, S: 1,
    blossoms: [], buds: [],
    t: 99, show: 0, sway: 0, swayV: 0, angle: 0, next: 2
  };
  const petals = [];
  let petalSprites = null;
  let stamenSprite = null;
  let budSprite = null;
  let gust = 0;

  function petalPath(c, w, h) {                    // tip up, base at the bottom centre
    c.beginPath();
    c.moveTo(w / 2, h * 0.98);
    c.bezierCurveTo(w * 0.02, h * 0.74, w * 0.05, h * 0.1, w / 2, h * 0.03);
    c.bezierCurveTo(w * 0.95, h * 0.1, w * 0.98, h * 0.74, w / 2, h * 0.98);
    c.closePath();
  }

  function makePeachSprites() {
    petalSprites = PETAL_TINTS.map(([base, body, tip], i) => {
      const cv = document.createElement("canvas");
      cv.width = 56;
      cv.height = 68;
      const c = cv.getContext("2d");
      const rand = mulberry(31 + i);
      petalPath(c, 56, 68);
      const g = c.createRadialGradient(28, 64, 2, 28, 34, 58);
      g.addColorStop(0, "rgba(" + base + ",0.74)");
      g.addColorStop(0.42, "rgba(" + body + ",0.82)");
      g.addColorStop(0.82, "rgba(" + tip + ",0.88)");
      g.addColorStop(1, "rgba(" + tip + ",0.92)");
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = "rgba(" + tip + ",0.42)";     // colour gathers at the wet edge of a dab
      c.lineWidth = 2.4;
      c.stroke();
      c.save();
      c.clip();
      c.globalCompositeOperation = "destination-out";   // and the wash is never quite even
      for (let k = 0; k < 5; k++) {
        const x = 10 + rand() * 36;
        const y = 12 + rand() * 46;
        const r = 7 + rand() * 11;
        const w = c.createRadialGradient(x, y, 0, x, y, r);
        w.addColorStop(0, "rgba(0,0,0," + (0.1 + rand() * 0.16) + ")");
        w.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = w;
        c.fillRect(x - r, y - r, r * 2, r * 2);
      }
      c.restore();
      return cv;
    });

    stamenSprite = document.createElement("canvas");
    stamenSprite.width = stamenSprite.height = 64;
    let c = stamenSprite.getContext("2d");
    let rand = mulberry(77);
    c.translate(32, 32);
    c.lineCap = "round";
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + (rand() - 0.5) * 0.4;
      const len = 9 + rand() * 9;
      c.strokeStyle = "rgba(150,40,62,0.72)";
      c.lineWidth = 1.1;
      c.beginPath();
      c.moveTo(Math.cos(a) * 2, Math.sin(a) * 2);
      c.lineTo(Math.cos(a) * len, Math.sin(a) * len);
      c.stroke();
      c.fillStyle = i % 3 ? "rgba(120,26,42,0.92)" : "rgba(206,150,52,0.95)";
      c.beginPath();
      c.arc(Math.cos(a) * len, Math.sin(a) * len, 1.8, 0, TAU);
      c.fill();
    }
    c.fillStyle = "rgba(150,36,60,0.85)";
    c.beginPath();
    c.arc(0, 0, 3.4, 0, TAU);
    c.fill();

    budSprite = document.createElement("canvas");  // a bud, tip up, with its dark calyx
    budSprite.width = 40;
    budSprite.height = 56;
    c = budSprite.getContext("2d");
    c.beginPath();
    c.moveTo(20, 50);
    c.bezierCurveTo(3, 40, 8, 12, 20, 4);
    c.bezierCurveTo(32, 12, 37, 40, 20, 50);
    c.closePath();
    const g = c.createLinearGradient(0, 50, 0, 4);
    g.addColorStop(0, "rgba(244,170,188,0.84)");
    g.addColorStop(1, "rgba(208,86,122,0.92)");
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = "rgba(190,70,108,0.4)";
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = "rgba(86,42,34,0.82)";
    c.beginPath();
    c.ellipse(20, 49.5, 7, 4.5, 0, 0, TAU);
    c.fill();
    c.beginPath();
    c.moveTo(14, 49);
    c.quadraticCurveTo(12.5, 42, 16, 39);
    c.quadraticCurveTo(18, 45, 20, 47);
    c.quadraticCurveTo(22, 45, 24, 39);
    c.quadraticCurveTo(27.5, 42, 26, 49);
    c.closePath();
    c.fill();
  }

  // A Catmull–Rom curve through the points, sampled about every `step` px.
  function smoothLine(pts, step) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
      for (let j = 0; j < n; j++) {
        const t = j / n;
        const t2 = t * t;
        const t3 = t2 * t;
        const at = (k) => 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t3);
        out.push([at(0), at(1)]);
      }
    }
    out.push(pts[pts.length - 1].slice());
    return out;
  }

  // One stroke of a loaded brush along `line`, w0 wide where it is set down and w1 where it lifts.
  function inkStroke(c, line, w0, w1, rand, tone) {
    const n = line.length;
    const nx = [];
    const ny = [];
    const half = [];
    for (let i = 0; i < n; i++) {
      const a = line[Math.max(0, i - 1)];
      const b = line[Math.min(n - 1, i + 1)];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      nx.push(-(b[1] - a[1]) / len);               // for a stroke going right this points down
      ny.push((b[0] - a[0]) / len);
      let w = w0 + (w1 - w0) * Math.pow(i / (n - 1), 0.85);
      w *= 1 + 0.15 * Math.sin(i * 0.31 + w0) + 0.12 * (rand() - 0.5);   // the hand presses and lifts
      half.push(Math.max(0.5, w / 2));
    }
    const jitterA = half.map((h) => (rand() - 0.5) * Math.min(1.5, h * 0.3));
    const jitterB = half.map((h) => (rand() - 0.5) * Math.min(1.5, h * 0.3));
    const shape = (grow) => {
      c.beginPath();
      for (let i = 0; i < n; i++) {
        const d = half[i] * grow + jitterA[i];
        if (i) c.lineTo(line[i][0] + nx[i] * d, line[i][1] + ny[i] * d);
        else c.moveTo(line[i][0] + nx[i] * d, line[i][1] + ny[i] * d);
      }
      for (let i = n - 1; i >= 0; i--) {
        const d = half[i] * grow + jitterB[i];
        c.lineTo(line[i][0] - nx[i] * d, line[i][1] - ny[i] * d);
      }
      c.closePath();
    };
    const side = (lat) => {                        // a line along the stroke: -1 its upper edge, +1 its lower
      c.beginPath();
      for (let i = 0; i < n; i++) {
        const d = half[i] * lat;
        if (i) c.lineTo(line[i][0] + nx[i] * d, line[i][1] + ny[i] * d);
        else c.moveTo(line[i][0] + nx[i] * d, line[i][1] + ny[i] * d);
      }
    };
    for (const [grow, alpha] of [[2.3, 0.018], [2.0, 0.022], [1.75, 0.03], [1.5, 0.042], [1.3, 0.06], [1.15, 0.08]]) {   // water running out from the stroke
      shape(grow);
      c.fillStyle = "rgba(" + INK + "," + alpha * tone + ")";
      c.fill();
    }
    shape(1);
    c.fillStyle = "rgba(" + INK + "," + 0.86 * tone + ")";
    c.fill();
    c.save();
    shape(1);
    c.clip();
    side(0.75);                                    // the ink pools along the underside
    c.strokeStyle = "rgba(6,5,4," + 0.5 * tone + ")";
    c.lineWidth = Math.max(1, w0 * 0.42);
    c.stroke();
    c.globalCompositeOperation = "destination-out";
    side(-0.8);                                    // and thins along the top, where the light falls
    c.strokeStyle = "rgba(0,0,0,0.2)";
    c.lineWidth = Math.max(1, w0 * 0.36);
    c.stroke();
    const streaks = Math.round(2 + w0 * 0.45);     // 飞白: the dry brush skips and the paper shows
    for (let s = 0; s < streaks; s++) {
      const lat = -0.85 + rand() * 1.3;
      let on = rand() < 0.4;
      c.lineWidth = 0.6 + rand() * 1.2;
      c.strokeStyle = "rgba(0,0,0," + (0.3 + rand() * 0.5) + ")";
      c.beginPath();
      for (let i = 0; i < n; i++) {
        if (rand() < 0.07) on = !on;
        const d = half[i] * lat;
        const x = line[i][0] + nx[i] * d;
        const y = line[i][1] + ny[i] * d;
        if (on && i) c.lineTo(x, y);
        else c.moveTo(x, y);
      }
      c.stroke();
    }
    c.restore();
    return { nx, ny, half };
  }

  // The skeleton of the branch, in units of its reach S, measured from where it enters at the left.
  const LIMBS = [
    { w: [0.047, 0.007], from: 0.24, pts: [[-0.06, 0.09], [0.06, 0.05], [0.15, 0.062], [0.24, 0.02], [0.33, 0.012], [0.43, -0.045], [0.52, -0.05], [0.61, -0.115], [0.7, -0.13], [0.78, -0.2], [0.86, -0.215], [0.93, -0.275]] },
    { w: [0.022, 0.005], from: 0.18, pts: [[0.24, 0.02], [0.3, 0.085], [0.385, 0.105], [0.45, 0.17], [0.535, 0.185], [0.595, 0.245], [0.66, 0.25]] },
    { w: [0.018, 0.004], from: 0.2, pts: [[0.43, -0.045], [0.445, -0.13], [0.5, -0.185], [0.51, -0.26], [0.555, -0.315]] },
    { w: [0.016, 0.004], from: 0.2, pts: [[0.61, -0.115], [0.69, -0.06], [0.77, -0.065], [0.84, -0.01], [0.915, -0.005]] },
    { w: [0.014, 0.004], from: 0.25, pts: [[0.06, 0.05], [0.085, -0.04], [0.14, -0.09], [0.15, -0.165]] },
    { w: [0.009, 0.003], from: 0.3, pts: [[0.385, 0.105], [0.41, 0.045], [0.455, 0.02]] },
    { w: [0.009, 0.003], from: 0.3, pts: [[0.535, 0.185], [0.56, 0.13], [0.6, 0.115]] },
    { w: [0.009, 0.003], from: 0.3, pts: [[0.5, -0.185], [0.56, -0.2], [0.6, -0.245]] },
    { w: [0.009, 0.003], from: 0.3, pts: [[0.7, -0.13], [0.715, -0.21], [0.75, -0.25]] },
    { w: [0.009, 0.003], from: 0.3, pts: [[0.33, 0.012], [0.345, -0.06], [0.385, -0.09]] },
    { w: [0.008, 0.003], from: 0.3, pts: [[0.77, -0.065], [0.8, -0.12], [0.84, -0.135]] },
    { w: [0.008, 0.003], from: 0.3, pts: [[0.86, -0.215], [0.92, -0.2], [0.97, -0.225]] },
    { w: [0.008, 0.003], from: 0.3, pts: [[0.3, 0.085], [0.29, 0.15], [0.32, 0.2]] }
  ];

  function buildTree() {
    if (!petalSprites) makePeachSprites();
    const S = Math.max(190, Math.min(W * 0.9, (H - 64) / 0.68));   // its height sets the scale of everything
    const reach = Math.min(W * 0.9, S * 1.75);                       // but on a wide stage it stretches out
    const ax = 0;
    const ay = clamp(H * 0.4, 0.33 * S + 16, Math.max(0.33 * S + 16, H - 0.27 * S - 56));
    const rand = mulberry(20260311);
    const k = S / 350;                             // sizes below are for a 350 px branch
    const image = document.createElement("canvas");
    image.width = Math.round(W * dpr);
    image.height = Math.round(H * dpr);
    const c = image.getContext("2d");
    c.scale(dpr, dpr);
    c.lineCap = "round";
    c.lineJoin = "round";

    const blossoms = [];
    const buds = [];
    const leaves = [];
    const clear = (x, y, d) => blossoms.every((b) => Math.hypot(b.x - x, b.y - y) > d) &&
      buds.every((b) => Math.hypot(b.x - x, b.y - y) > d * 0.6);
    const addFlower = (x, y, out, forceBlossom) => {
      if (x < 8 || x > W - 12 || y < 14 || y > H - 40) return;
      if (forceBlossom || rand() < 0.72) {
        if (!clear(x, y, 0.058 * S)) return;
        const tint = (rand() * 3) | 0;
        const list = [];
        for (let j = 0; j < 5; j++) {
          list.push({
            a: (j / 5) * TAU + (rand() - 0.5) * 0.24,
            len: 0.9 + rand() * 0.2,
            tint: rand() < 0.75 ? tint : (rand() * 3) | 0,
            on: true, grow: 1, back: 0
          });
        }
        blossoms.push({
          x, y,
          r: (0.035 + rand() * 0.014) * S,
          rot: rand() * TAU,
          squash: 0.6 + rand() * 0.4,
          alpha: 0.76 + rand() * 0.24,
          petals: list,
          delay: rand() * 0.45, wait: 0, open: 1
        });
      } else if (clear(x, y, 0.03 * S)) {
        buds.push({ x, y, rot: out + (rand() - 0.5) * 0.7, size: (0.022 + rand() * 0.012) * S, delay: rand() * 0.4, wait: 0, open: 1 });
      }
    };

    LIMBS.forEach((limb, index) => {
      const pts = limb.pts.map(([x, y], i) => [
        ax + (x + (i && i < limb.pts.length - 1 ? (rand() - 0.5) * 0.012 : 0)) * reach,
        ay + (y + (i && i < limb.pts.length - 1 ? (rand() - 0.5) * 0.012 : 0)) * S
      ]);
      const line = smoothLine(pts, 3);
      const twig = index > 4;
      const shape = inkStroke(c, line, limb.w[0] * S, limb.w[1] * S, rand, twig ? 0.8 : index ? 0.92 : 1);
      // knots where the limb turns, and moss dots along its back
      if (!twig) {
        for (let i = 1; i < pts.length - 1; i++) {
          const at = Math.round((i / (pts.length - 1)) * (line.length - 1));
          const r = shape.half[at] * (0.7 + rand() * 0.5);
          c.fillStyle = "rgba(8,6,5," + (0.34 + rand() * 0.3) + ")";
          c.beginPath();
          c.ellipse(line[at][0] + (rand() - 0.5) * r, line[at][1] + (rand() - 0.5) * r, r, r * (0.55 + rand() * 0.3), rand() * 3, 0, TAU);
          c.fill();
          if (rand() < (index ? 0.45 : 0.8)) {
            for (let m = 0; m < 3 + ((rand() * 3) | 0); m++) {
              const d = shape.half[at] * (0.9 + rand() * 0.9);
              const along = Math.min(line.length - 1, Math.max(0, at + Math.round((rand() - 0.5) * 9)));
              c.fillStyle = "rgba(10,8,7," + (0.6 + rand() * 0.3) + ")";
              c.beginPath();
              c.ellipse(line[along][0] - shape.nx[along] * d, line[along][1] - shape.ny[along] * d,
                (1.2 + rand() * 1.9) * k, (0.9 + rand() * 1.3) * k, rand() * 3, 0, TAU);
              c.fill();
            }
          }
        }
      }
      // flowers and buds along it, thicker towards the young wood
      let run = 0;
      let gap = (0.03 + rand() * 0.04) * S;
      for (let i = Math.floor(line.length * limb.from) + 1; i < line.length; i++) {
        run += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
        if (run < gap) continue;
        run = 0;
        gap = (0.05 + rand() * 0.045) * S;
        const sideways = rand() < 0.5 ? -1 : 1;
        const off = shape.half[i] + (0.012 + rand() * 0.026) * S;
        addFlower(line[i][0] + shape.nx[i] * sideways * off, line[i][1] + shape.ny[i] * sideways * off,
          Math.atan2(shape.ny[i] * sideways, shape.nx[i] * sideways) + Math.PI / 2, false);
      }
      const end = line[line.length - 1];
      const before = line[Math.max(0, line.length - 4)];
      const heading = Math.atan2(end[1] - before[1], end[0] - before[0]);
      addFlower(end[0] + Math.cos(heading) * 0.012 * S, end[1] + Math.sin(heading) * 0.012 * S, heading + Math.PI / 2, index % 2 === 0);
      if (index > 0 && rand() < 0.8) leaves.push([end[0], end[1], heading]);
    });

    // a few young leaves at the tips, in thin green ink
    for (const [x, y, heading] of leaves) {
      for (let j = 0; j < 2; j++) {
        const a = heading + (j ? 0.75 : -0.6) + (rand() - 0.5) * 0.5;
        const len = (0.045 + rand() * 0.03) * S;
        const wide = len * 0.2;
        const tx = x + Math.cos(a) * len;
        const ty = y + Math.sin(a) * len;
        const px = Math.cos(a + Math.PI / 2) * wide;
        const py = Math.sin(a + Math.PI / 2) * wide;
        c.fillStyle = "rgba(96,116,66," + (0.42 + rand() * 0.2) + ")";
        c.beginPath();
        c.moveTo(x, y);
        c.quadraticCurveTo((x + tx) / 2 + px, (y + ty) / 2 + py, tx, ty);
        c.quadraticCurveTo((x + tx) / 2 - px, (y + ty) / 2 - py, x, y);
        c.fill();
        c.strokeStyle = "rgba(44,60,34,0.5)";
        c.lineWidth = 0.8 * k;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(tx, ty);
        c.stroke();
      }
    }

    tree.image = image;
    tree.w = W;
    tree.h = H;
    tree.ax = ax;
    tree.ay = ay;
    tree.S = S;
    tree.blossoms = blossoms;
    tree.buds = buds;
  }

  function paintTreeAgain() {                      // the branch is brushed in afresh each time the toy is chosen
    if (!tree.image || tree.w !== W || tree.h !== H) buildTree();
    tree.t = reduced ? 99 : 0;
    tree.next = 3;
    for (const b of tree.blossoms.concat(tree.buds)) {
      b.open = reduced ? 1 : 0;
      b.wait = b.delay;
    }
  }

  function treePoint(x, y) {                       // where a point of the branch is, now that it sways
    const c = Math.cos(tree.angle);
    const s = Math.sin(tree.angle);
    const dx = x - tree.ax;
    const dy = y - tree.ay;
    return [tree.ax + dx * c - dy * s, tree.ay + dx * s + dy * c];
  }

  function addPetal(x, y, vx, vy, size, tint, rot) {
    if (petals.length >= MAX_PETALS) {
      const lying = petals.findIndex((p) => p.settled);
      petals.splice(lying < 0 ? 0 : lying, 1);
    }
    petals.push({
      x, y, vx, vy, size, tint,
      rot, vr: rnd(-2.6, 2.6),
      phase: rnd(0, TAU), swing: rnd(1.2, 2.3), sway: rnd(16, 44),
      turn: rnd(0, TAU), tumble: rnd(1.6, 4.2),
      fall: rnd(26, 50), age: 0,
      settled: false, rest: 0, keep: rnd(18, 34), lift: rnd(0, 5), flat: rnd(0.35, 0.7)
    });
  }

  // One petal of one flower comes away.
  function shedPetal(b, p, push) {
    if (!p.on || p.grow < 0.6) return false;
    p.on = false;
    p.back = clock + rnd(4, 9);
    const len = b.r * p.len;
    const lx = Math.sin(p.a) * len * 0.5;          // the middle of the petal, in the flower's own frame
    const ly = -Math.cos(p.a) * len * 0.5 * b.squash;
    const c = Math.cos(b.rot);
    const s = Math.sin(b.rot);
    const [x, y] = treePoint(b.x + lx * c - ly * s, b.y + lx * s + ly * c);
    addPetal(x, y, rnd(-16, 16) + (push ? push[0] : 0), rnd(-8, 14) + (push ? push[1] : 0), len, p.tint, p.a + b.rot + tree.angle);
    return true;
  }

  function looseFlowers(x, y, reach) {
    const out = [];
    for (const b of tree.blossoms) {
      if (b.open < 1) continue;
      const [bx, by] = treePoint(b.x, b.y);
      const d = Math.hypot(bx - x, by - y);
      if (d < reach) out.push([b, d, bx, by]);
    }
    return out;
  }

  // A touch at (x, y).  Flowers within reach let petals go, the nearer the more; a touch on empty
  // paper is a breath of air, and a few come away anywhere along the branch.
  function shakeTree(x, y, strength, quiet) {
    if (!tree.image) return 0;
    const reach = Math.max(50, tree.S * 0.16);
    let n = 0;
    for (const [b, d, bx, by] of looseFlowers(x, y, reach)) {
      const chance = strength * (0.2 + 0.8 * Math.pow(1 - d / reach, 0.6));
      const away = Math.hypot(bx - x, by - y) || 1;
      for (const p of b.petals) {
        if (Math.random() < chance && shedPetal(b, p, [((bx - x) / away) * 26 * strength, ((by - y) / away) * 14 * strength])) n++;
      }
    }
    if (!n) {
      const open = tree.blossoms.filter((b) => b.open >= 1 && b.petals.some((p) => p.on && p.grow >= 0.6));
      for (let i = 0; i < Math.round(4 * strength) && open.length; i++) {
        const b = pick(open);
        const loose = b.petals.filter((p) => p.on && p.grow >= 0.6);
        if (loose.length && shedPetal(b, pick(loose))) n++;
      }
    }
    const near = clamp(1 - Math.abs(y - tree.ay) / (tree.S * 0.6), 0.25, 1);
    tree.swayV += (y < tree.ay ? 1 : -1) * 0.05 * strength * near * rnd(0.7, 1.2);
    for (const p of petals) {                      // petals already in the air are pushed aside
      if (p.settled) continue;
      const dx = p.x - x;
      const dy = p.y - y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > 120) continue;
      const f = (1 - d / 120) * 90 * strength;
      p.vx += (dx / d) * f;
      p.vy += (dy / d) * f * 0.6;
    }
    if (!quiet) {
      sfx("pluck", 0.7 + 0.3 * strength);
      setStatus(LABELS.peach + (n ? " — 落花 " + n + " 瓣. " + n + (n === 1 ? " petal falls." : " petals fall.") : " — the branch is resting."));
    }
    return n;
  }

  function updateTree(dt) {
    if (mode === "peach") {
      tree.show = 1;
      tree.t += dt;
    } else if (tree.show > 0) {
      tree.show = Math.max(0, tree.show - dt / 0.4);
    }
    tree.swayV += (-19 * tree.sway - 2.2 * tree.swayV) * dt;
    tree.sway = clamp(tree.sway + tree.swayV * dt, -0.035, 0.035);
    tree.angle = tree.sway + 0.003 * Math.sin(clock * 0.9);
    gust *= Math.pow(0.3, dt);
    if (mode !== "peach" || tree.t < 2.6) return;
    tree.next -= dt;                               // left alone, it still drops one now and then
    if (tree.next <= 0) {
      tree.next = rnd(1.2, 3.4);
      const open = tree.blossoms.filter((b) => b.open >= 1 && b.petals.some((p) => p.on && p.grow >= 0.6));
      if (open.length) {
        const b = pick(open);
        shedPetal(b, pick(b.petals.filter((p) => p.on && p.grow >= 0.6)));
      }
    }
  }

  function drawTree(dt) {
    if (!tree.image || tree.show <= 0) return;
    const full = W + 30;
    const reveal = full * (1 - Math.pow(1 - clamp(tree.t / 1.7, 0, 1), 2.2));   // the brush moves left to right
    const growing = dt > 0 && mode === "peach";
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.translate(tree.ax, tree.ay);
    ctx.rotate(tree.angle);
    ctx.translate(-tree.ax, -tree.ay);
    ctx.globalAlpha = tree.show;
    if (reveal < full - 0.5) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(-30, -30, reveal + 30, H + 60);
      ctx.clip();
      ctx.drawImage(tree.image, 0, 0, W, H);
      ctx.restore();
    } else {
      ctx.drawImage(tree.image, 0, 0, W, H);
    }
    const opening = (b) => {                       // a flower appears once the brush has passed it
      if (b.open >= 1) return 1;
      if (growing && reveal > b.x + 8) {
        b.wait -= dt;
        if (b.wait <= 0) b.open = Math.min(1, b.open + dt / 0.7);
      }
      const t = b.open - 1;
      return b.open <= 0 ? 0 : 1 + 2.1 * t * t * t + 1.1 * t * t;
    };
    for (const b of tree.buds) {
      const pop = opening(b);
      if (pop <= 0) continue;
      const h = b.size * 1.4 * pop;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.drawImage(budSprite, -h * 0.357, -h * 0.9, h * 0.714, h);
      ctx.restore();
    }
    for (const b of tree.blossoms) {
      const pop = opening(b);
      if (pop <= 0) continue;
      ctx.save();
      ctx.globalAlpha = tree.show * b.alpha;
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.scale(1, b.squash);
      for (const p of b.petals) {
        if (!p.on) {
          if (growing && clock >= p.back) {        // and a petal that fell grows back, slowly
            p.on = true;
            p.grow = 0;
          }
          continue;
        }
        if (growing && p.grow < 1) p.grow = Math.min(1, p.grow + dt / 1.6);
        const len = b.r * p.len * pop * (1 - Math.pow(1 - p.grow, 2));
        if (len < 0.5) continue;
        ctx.rotate(p.a);
        ctx.drawImage(petalSprites[p.tint], -len * 0.41, -len * 0.96, len * 0.82, len);
        ctx.rotate(-p.a);
      }
      const s = b.r * 1.5 * pop;
      ctx.drawImage(stamenSprite, -s / 2, -s / 2, s, s);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawPetals(dt) {
    if (!petals.length) return;
    const wind = 7 * Math.sin(clock * 0.23) + gust;
    ctx.globalCompositeOperation = "source-over";
    for (let i = petals.length - 1; i >= 0; i--) {
      const p = petals[i];
      let alpha = 0.95;
      let flip = p.flat;
      if (p.settled) {
        p.rest += dt;
        p.y = groundY(clamp(p.x, 0, W)) - 1 - p.lift;
        if (p.rest > p.keep) { petals.splice(i, 1); continue; }
        alpha = Math.min(0.95, (p.keep - p.rest) / 1.5);
      } else {
        p.age += dt;
        const swing = Math.sin(p.phase + p.age * p.swing);
        p.vx += (wind + swing * p.sway - p.vx) * 1.4 * dt;
        p.vy += (p.fall * (0.7 + 0.5 * Math.abs(swing)) - p.vy) * 1.6 * dt;   // it sideslips, then drops
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += (p.vr + swing * 1.4) * dt;
        flip = Math.cos(p.turn + p.age * p.tumble);
        if (Math.abs(flip) < 0.12) flip = flip < 0 ? -0.12 : 0.12;
        if (p.x < -40 || p.x > W + 40 || p.y < -260) { petals.splice(i, 1); continue; }
        if (p.vy > 0 && p.y >= groundY(clamp(p.x, 0, W)) - 1 - p.lift) {
          p.settled = true;
          p.rest = 0;
          p.rot = rnd(-0.6, 0.6) + (Math.random() < 0.5 ? Math.PI : 0) + Math.PI / 2;
        }
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, flip);
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.drawImage(petalSprites[p.tint], -p.size * 0.41, -p.size * 0.5, p.size * 0.82, p.size);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------- gestures */
  function point(e) {
    const rect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  function releaseGesture(g, ok) {
    if (g.mode === "fireworks") {
      if (ok && !g.fired) fireworksAt(g.x, g.y);
    } else if (g.mode === "firecracker") {
      if (g.moved) {
        if (!layString(g.path) && ok) hangString(g.x, g.y);
      } else if (ok && !g.fired) {
        hangString(g.sx, g.sy);
      }
    } else if (g.mode === "bomb" && g.bomb) {
      const b = g.bomb;
      b.held = false;
      const a = g.samples[0];
      const z = g.samples[g.samples.length - 1];
      const span = Math.max(0.016, (z[0] - a[0]) / 1000);
      if (g.moved && z[0] - a[0] < 220) {
        b.vx = clamp((z[1] - a[1]) / span, -1900, 1900);
        b.vy = clamp((z[2] - a[2]) / span, -1900, 1900);
      } else {
        b.vx = rnd(-40, 40);
      }
      setStatus(LABELS.bomb + " — " + (b.big ? "a big one. " : "") + bombs.length + " live.");
    } else if (g.mode === "snow") {
      if (!g.moved) {
        if (g.t > 0.4) releaseCrystal(g);
        else if (ok) snowBurst(g.sx, g.sy);
      }
    }
  }

  function releaseAll() {
    touches.forEach((g) => releaseGesture(g, false));
    touches.clear();
  }

  function updateGesture(g, dt) {
    g.t += dt;
    if (g.mode === "peach") {                      // held: a steady breeze through the branch
      if (g.t > 0.35) {
        g.shed += dt;
        while (g.shed > 0.12) {
          g.shed -= 0.12;
          shakeTree(g.x, g.y, 0.22, true);
        }
      }
      return;
    }
    if (g.moved || g.fired) return;
    if (g.mode === "fireworks" && g.t >= 0.72) {
      g.fired = true;
      launchGrand(g.sx, g.sy);
    } else if (g.mode === "firecracker" && g.t >= 0.55) {
      g.fired = true;
      addKicker(g.sx, g.sy);
    } else if (g.mode === "bomb" && g.bomb && !g.bomb.big && g.t >= 0.6) {
      makeBig(g.bomb);
      sfx("thud", 0.6);
    }
  }

  function drawRing(x, y, p, label) {
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 26, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 26, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(p, 0, 1));
    ctx.stroke();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = "#ffd700";
    ctx.font = '600 10px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(label, x, y + 46);
    ctx.globalAlpha = 1;
  }

  function drawGesture(g) {
    if (g.mode === "firecracker") {
      if (g.moved && g.path.length > 1) {
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = "#d8b05c";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        g.path.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        ctx.stroke();
        ctx.setLineDash([]);
        for (let i = 0; i < g.path.length; i += 3) drawCracker(g.path[i][0], g.path[i][1], i * 0.9, 0.5, false, false);
        ctx.globalAlpha = 1;
      } else if (!g.fired && g.t > 0.12) {
        drawRing(g.sx, g.sy, g.t / 0.55, "二踢脚");
      }
    } else if (g.mode === "bomb" && g.bomb && !g.bomb.big && !g.moved && g.t > 0.12) {
      drawRing(g.x, g.y, g.t / 0.6, "BIGGER");
    } else if (g.mode === "snow" && !g.moved && g.t > 0.18) {
      const grown = clamp((g.t - 0.18) / 1.5, 0, 1);
      const size = 30 + 100 * grown;
      g.spin += 0.006;
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(g.spin);
      ctx.beginPath();                            // the crystal grows outward from its centre
      ctx.arc(0, 0, safe(size * 0.5 * Math.min(1, g.t / 0.5 + grown)), 0, TAU);
      ctx.clip();
      ctx.globalAlpha = 0.97;
      ctx.drawImage(g.sprite, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
  }

  /* ---------------------------------------------------------- one frame */
  function startLoop() {
    if (reduced || running || !visible) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(tick);
  }

  function active() {
    return particles.length || smoke.length || flashes.length || shocks.length || fireballs.length ||
      rockets.length || strings.length || strays.length || cracks.length || kickers.length || bombs.length ||
      flakes.length ||
      texts.length || touches.size || whiteout > 0.01 || shakeLeft > 0 ||
      papers.some((p) => !p.settled || p.rest > p.keep - 1.2) || mode === "snow" ||
      mode === "peach" || tree.show > 0 || petals.some((p) => !p.settled || p.rest > p.keep - 1.5);
  }

  function tick(now) {
    if (document.hidden || !visible) {
      running = false;
      return;
    }
    const dt = Math.min(0.045, (now - last) / 1000 || 0.016);
    last = now;
    draw(dt);
    if (active()) {
      requestAnimationFrame(tick);
    } else {
      running = false;
      draw(0);
    }
  }

  function draw(dt) {
    const f = dt * 60;                           // sparks keep their per-frame units
    clock += dt;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    let sx = 0;
    let sy = 0;
    if (shakeLeft > 0) {
      shakeLeft -= dt;
      const k = Math.max(0, shakeLeft / shakeTotal);
      sx = rnd(-1, 1) * shakeAmp * k * k;
      sy = rnd(-1, 1) * shakeAmp * k * k;
      if (shakeLeft <= 0) shakeAmp = 0;
    }
    ctx.save();
    ctx.translate(sx, sy);

    touches.forEach((g) => updateGesture(g, dt));
    if (dt > 0) updateTree(dt);

    // ambient snowfall while the snow toy is selected
    if (mode === "snow" && dt > 0) {
      ambient += dt * (W / 46);
      while (ambient > 1) {
        ambient -= 1;
        if (flakes.length < 150) addFlake(rnd(-10, W + 10), -6, rnd(-10, 10), rnd(30, 60), rnd(1.6, 3.4), null);
      }
    }

    // the snow on the ground
    if (dt > 0) settlePile();
    if (pileTop > 0.6) {
      const g = ctx.createLinearGradient(0, H - pileTop - 6, 0, H);
      g.addColorStop(0, "rgba(248,252,255,0.97)");
      g.addColorStop(1, "rgba(168,198,232,0.92)");
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-4, H + 4);
      for (let i = 0; i < pile.length; i++) {      // drawn through a three-point average, for a soft edge
        const a = pile[Math.max(0, i - 1)];
        const c = pile[Math.min(pile.length - 1, i + 1)];
        ctx.lineTo(i * COL, H - FLOOR - (a + 2 * pile[i] + c) / 4);
      }
      ctx.lineTo(W + 4, H + 4);
      ctx.closePath();
      ctx.fill();
    }

    drawTree(dt);

    // paper
    ctx.globalCompositeOperation = "source-over";
    for (let i = papers.length - 1; i >= 0; i--) {
      const p = papers[i];
      p.age += dt;
      let alpha = 0.95;
      if (p.settled) {
        p.rest += dt;
        p.y = groundY(p.x) - 1 - p.lift;
        if (p.rest > p.keep) { papers.splice(i, 1); continue; }
        alpha = Math.min(0.95, (p.keep - p.rest) / 1.2);
      } else {
        p.vy += 260 * dt;
        p.vx += Math.sin(p.phase + p.age * 7) * 90 * dt;
        const drag = Math.pow(0.08, dt);
        p.vx *= drag;
        p.vy *= drag;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        if (p.x < 2) { p.x = 2; p.vx = Math.abs(p.vx) * 0.4; }
        if (p.x > W - 2) { p.x = W - 2; p.vx = -Math.abs(p.vx) * 0.4; }
        if (p.vy > 0 && p.y >= groundY(p.x) - 1 - p.lift) {
          p.settled = true;
          p.rest = 0;
          p.rot = rnd(-0.4, 0.4);
        }
      }
      if (p.settled) {
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
        continue;
      }
      const flip = 0.25 + 0.75 * Math.abs(Math.cos(p.age * 9 + p.phase));
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, (-p.h / 2) * flip, p.w, p.h * flip);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // rockets
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.t += dt;
      const k = Math.min(1, r.t / r.fly);
      const ease = 1 - Math.pow(1 - k, 2);
      r.x = r.x0 + (r.x1 - r.x0) * ease;
      r.y = r.y0 + (r.y1 - r.y0) * ease;
      if (k >= 1) {
        if (r.grand) grandBurst(r.x1, r.y1);
        else burst(r.x1, r.y1, r.scale, r.type);
        rockets.splice(i, 1);
        continue;
      }
      ctx.globalCompositeOperation = "lighter";
      const glow = r.grand ? 9 : 5.5;
      const g = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, glow * 2.2);
      g.addColorStop(0, "rgba(255,255,245,0.95)");
      g.addColorStop(0.3, r.grand ? "rgba(255,215,0,0.7)" : "rgba(255,214,10,0.6)");
      g.addColorStop(1, "rgba(255,120,0,0)");
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(r.x, r.y, glow * 2.2, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.grand ? 2.6 : 1.8, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // strings of crackers
    for (let i = strings.length - 1; i >= 0; i--) {
      if (dt > 0 && !updateString(strings[i], dt)) { strings.splice(i, 1); continue; }
      drawString(strings[i]);
    }
    for (let i = strays.length - 1; i >= 0; i--) {
      if (dt > 0 && !updateStray(strays[i], dt)) { strays.splice(i, 1); continue; }
      drawCracker(strays[i].x, strays[i].y, strays[i].rot, 1, true, false);
    }

    for (let i = kickers.length - 1; i >= 0; i--) {
      if (dt > 0 && !updateKicker(kickers[i], dt)) { kickers.splice(i, 1); continue; }
      drawKicker(kickers[i]);
    }

    for (let i = bombs.length - 1; i >= 0; i--) {
      if (dt > 0 && !updateBomb(bombs[i], dt)) { bombs.splice(i, 1); continue; }
      drawBomb(bombs[i]);
    }

    touches.forEach(drawGesture);

    // flashes, shock rings, fireballs
    ctx.globalCompositeOperation = "lighter";
    for (let i = flashes.length - 1; i >= 0; i--) {
      const fl = flashes[i];
      fl.t += dt;
      const k = fl.t / fl.life;
      if (k >= 1) { flashes.splice(i, 1); continue; }
      const r = safe((22 + 110 * k) * fl.scale);
      const g = ctx.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, r);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.18, fl.color);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.globalAlpha = (1 - k) * 0.65;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(fl.x, fl.y, r, 0, TAU);
      ctx.fill();
    }
    for (let i = shocks.length - 1; i >= 0; i--) {
      const s = shocks[i];
      s.t += dt;
      const k = s.t / s.life;
      if (k >= 1) { shocks.splice(i, 1); continue; }
      if (k < 0) continue;
      ctx.globalAlpha = (1 - k) * (s.wide ? 0.5 : 0.22);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.wide ? 1.4 + 9 * (1 - k) : 1.4;
      ctx.beginPath();
      ctx.arc(s.x, s.y, safe(s.max * (s.wide ? 1 - Math.pow(1 - k, 3) : k)), 0, TAU);
      ctx.stroke();
    }
    for (let i = fireballs.length - 1; i >= 0; i--) {
      const fb = fireballs[i];
      fb.t += dt;
      const k = fb.t / fb.life;
      if (k >= 1) { fireballs.splice(i, 1); continue; }
      const r = safe((18 + 105 * Math.sqrt(k)) * fb.scale);
      const g = ctx.createRadialGradient(fb.x, fb.y, 0, fb.x, fb.y, r);
      g.addColorStop(0, "rgba(255,255,245,0.85)");
      g.addColorStop(0.22, "rgba(255,214,10,0.55)");
      g.addColorStop(0.55, "rgba(255,110,20,0.22)");
      g.addColorStop(1, "rgba(255,80,0,0)");
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(fb.x, fb.y, r, 0, TAU);
      ctx.fill();
    }

    // smoke
    ctx.globalCompositeOperation = "source-over";
    for (let i = smoke.length - 1; i >= 0; i--) {
      const p = smoke[i];
      p.life -= dt;
      if (p.life <= 0) { smoke.splice(i, 1); continue; }
      p.x += p.vx * f;
      p.y += p.vy * f - p.rise * dt * 10;
      p.vx *= Math.pow(p.drag, f);
      p.vy *= Math.pow(p.drag, f);
      const k = p.life / p.maxLife;
      const r = safe(p.size * (1.7 - k * 0.55));
      ctx.globalAlpha = p.a * k;
      ctx.drawImage(puffImage(), p.x - r, p.y - r, r * 2, r * 2);
    }

    // crackers going off: lit after the smoke, so the cloud glows from inside
    ctx.globalCompositeOperation = "lighter";
    for (let i = cracks.length - 1; i >= 0; i--) {
      const c = cracks[i];
      c.t += dt;
      const k = c.t / c.life;
      if (k >= 1) { cracks.splice(i, 1); continue; }
      const fade = 1 - k * k;
      const R = safe(c.r * 5.5);
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, R);
      g.addColorStop(0, "rgba(255,255,246,1)");   // white-hot at the centre
      g.addColorStop(0.07, "rgba(255,246,206,0.95)");
      g.addColorStop(0.2, "rgba(255,200,90,0.34)");
      g.addColorStop(0.45, "rgba(255,150,50,0.11)");
      g.addColorStop(1, "rgba(255,120,30,0)");
      ctx.globalAlpha = fade;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c.x, c.y, R, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = fade * 0.8;               // thin rays, uneven, thrown out as it goes
      ctx.strokeStyle = "#fff6d8";
      ctx.lineWidth = Math.max(0.8, c.r * 0.06);
      ctx.beginPath();
      const n = c.spikes.length;
      for (let j = 0; j < n; j++) {
        const a = c.turn + (j / n) * TAU + c.spikes[j];
        const r0 = c.r * 0.3;
        const r1 = c.r * c.spikes[j] * (0.9 + 0.9 * k);
        ctx.moveTo(c.x + Math.cos(a) * r0, c.y + Math.sin(a) * r0);
        ctx.lineTo(c.x + Math.cos(a) * r1, c.y + Math.sin(a) * r1);
      }
      ctx.stroke();
    }

    // sparks and debris
    ctx.globalCompositeOperation = "lighter";
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vx *= Math.pow(p.drag, f);
      p.vy *= Math.pow(p.drag, f);
      p.vy += p.gravity * dt;
      const step = p.asBefore ? (dt > 0 ? 1 : 0) : f;   // fireworks: one step a frame, as before
      p.x += p.vx * step;
      p.y += p.vy * step;
      if (p.split && !p.didSplit && p.life < p.maxLife * 0.6) {
        p.didSplit = true;
        splitParticle(p);
      }
      const k = Math.max(0, p.life / p.maxLife);
      const alpha = Math.min(1, 0.5 + k * 0.65) * (p.flicker && Math.random() < 0.18 ? 0.25 : 1);
      if (p.kind === "debris") {
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = alpha * 0.9;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size);
        ctx.globalCompositeOperation = "lighter";
        continue;
      }
      const width = Math.max(0.6, p.size * (0.45 + 0.8 * k));
      ctx.globalAlpha = alpha * 0.16;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.5, width * 1.7), 0, TAU);
      ctx.fill();
      if (p.size > 0.9) {
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1.1, p.size * 0.8), 0, TAU);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.size * 0.3), 0, TAU);
        ctx.fill();
        ctx.globalAlpha = alpha * 0.75;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 0.7;
        const s = Math.max(1.5, p.size * 1.2);
        ctx.beginPath();
        ctx.moveTo(p.x - s, p.y);
        ctx.lineTo(p.x + s, p.y);
        ctx.moveTo(p.x, p.y - s);
        ctx.lineTo(p.x, p.y + s);
        ctx.stroke();
      }
    }

    touches.forEach(drawCharge);

    drawPetals(dt);

    // snowflakes, in front of everything else
    ctx.globalCompositeOperation = "source-over";
    const wind = Math.sin(clock * 0.21) * 14;
    for (let i = flakes.length - 1; i >= 0; i--) {
      const fl = flakes[i];
      fl.age += dt;
      fl.vx += (wind + Math.sin(fl.phase + fl.age * 1.4) * fl.sway - fl.vx) * 1.6 * dt;
      fl.vy += (fl.fall - fl.vy) * 1.8 * dt;
      fl.x += fl.vx * dt;
      fl.y += fl.vy * dt;
      fl.rot += fl.vr * dt;
      fl.vr *= Math.pow(0.5, dt);
      if (fl.x < -40) fl.x = W + 30;
      if (fl.x > W + 40) fl.x = -30;
      if (fl.vy > 0 && fl.y + fl.size * 0.2 >= groundY(clamp(fl.x, 0, W))) {
        deposit(fl.x, fl.sprite ? fl.size * 0.17 : 0.55);
        flakes.splice(i, 1);
        continue;
      }
      if (fl.y < -200) { flakes.splice(i, 1); continue; }
      if (fl.sprite) {
        ctx.save();
        ctx.translate(fl.x, fl.y);
        ctx.rotate(fl.rot);
        ctx.globalAlpha = 0.96;
        ctx.drawImage(fl.sprite, -fl.size / 2, -fl.size / 2, fl.size, fl.size);
        ctx.restore();
      } else {
        ctx.globalAlpha = fl.alpha;
        ctx.fillStyle = "#f4faff";
        ctx.beginPath();
        ctx.arc(fl.x, fl.y, fl.size * 0.5, 0, TAU);
        ctx.fill();
      }
    }

    // the sound of it, written out
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      t.t += dt;
      const k = t.t / t.life;
      if (k >= 1) { texts.splice(i, 1); continue; }
      const grow = 0.6 + 0.5 * Math.min(1, k * 7);
      ctx.globalAlpha = Math.min(1, (1 - k) * 2.2);
      ctx.fillStyle = t.color;
      ctx.font = "800 " + Math.round(t.size * grow) + 'px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(t.str, t.x, t.y - 26 * k);
    }
    ctx.textBaseline = "alphabetic";
    ctx.globalAlpha = 1;
    ctx.restore();

    if (whiteout > 0.01) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = whiteout;
      ctx.fillStyle = "#fff4dc";
      ctx.fillRect(0, 0, W, H);
      whiteout *= Math.pow(0.00008, dt);
    } else {
      whiteout = 0;
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  /* -------------------------------------------------------------- controls */
  function ready() {
    if (!reduced) return true;
    setStatus("Reduced motion is on — effects are paused.");
    return false;
  }

  function ignite(x, y) {
    if (!ready()) return;
    primeAudio();
    if (mode === "fireworks") fireworksAt(x, y);
    else if (mode === "firecracker") hangString(x, y);
    else if (mode === "bomb") {
      const b = newBomb(clamp(x + rnd(-30, 30), 20, W - 20), clamp(y, 20, H - 30), false);
      b.vx = rnd(-160, 160);
    } else if (mode === "snow") snowBurst(x, y);
    else if (mode === "peach" && tree.blossoms.length) {
      const b = pick(tree.blossoms);
      shakeTree(b.x, b.y, 1);
    }
    startLoop();
  }

  function clearAll() {
    for (const list of [particles, smoke, flashes, shocks, fireballs, rockets, strings, strays, cracks, kickers, bombs, papers, flakes, petals, texts]) list.length = 0;
    for (const b of tree.blossoms) for (const p of b.petals) { p.on = true; p.grow = 1; }
    touches.clear();
    pile.fill(0);
    pileTop = 0;
    whiteout = 0;
    shakeLeft = 0;
    draw(0);
    setStatus(LABELS[mode] + " — stage cleared.");
    if (mode === "snow" || mode === "peach") startLoop();
  }

  modeButtons.forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));

  if (launchBtn) {
    launchBtn.addEventListener("click", () => {
      const y = mode === "firecracker" ? 0.26 : mode === "bomb" ? 0.18 : 0.38;
      ignite(W * 0.5, H * y);
    });
  }
  if (clearBtn) clearBtn.addEventListener("click", clearAll);
  if (soundBtn) soundBtn.addEventListener("click", () => setSound(!audio.on));

  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!ready()) return;
    primeAudio();
    const [x, y] = point(e);
    const g = {
      mode, x, y, sx: x, sy: y, t: 0,
      moved: false, fired: false,
      path: [[x, y]], length: 0, brush: 0, shed: 0,
      samples: [[performance.now(), x, y]]
    };
    if (mode === "bomb") g.bomb = newBomb(clamp(x, 14, W - 14), clamp(y, 14, H - 14), true);
    if (mode === "peach") shakeTree(x, y, 1);
    if (mode === "snow") {
      g.snowType = SNOW_TYPES[snowIndex % SNOW_TYPES.length];
      g.sprite = spriteFor(g.snowType.id);
      g.spin = rnd(0, TAU);
    }
    touches.set(e.pointerId, g);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* older engines */ }
    startLoop();
  });

  canvas.addEventListener("pointermove", (e) => {
    const g = touches.get(e.pointerId);
    if (!g) return;
    const [x, y] = point(e);
    const dx = x - g.x;
    const dy = y - g.y;
    const step = Math.hypot(dx, dy);
    g.x = x;
    g.y = y;
    g.samples.push([performance.now(), x, y]);
    while (g.samples.length > 2 && g.samples[g.samples.length - 1][0] - g.samples[0][0] > 90) g.samples.shift();
    if (!g.moved && Math.hypot(x - g.sx, y - g.sy) > (g.mode === "fireworks" ? 14 : 12)) g.moved = true;
    if (!g.moved) return;
    if (g.mode === "firecracker" && g.length < 1300) {
      const lastPoint = g.path[g.path.length - 1];
      const d = Math.hypot(x - lastPoint[0], y - lastPoint[1]);
      if (d >= 4) {
        g.path.push([x, y]);
        g.length += d;
      }
    } else if (g.mode === "bomb" && g.bomb) {
      g.bomb.x = clamp(x, g.bomb.r, W - g.bomb.r);
      g.bomb.y = clamp(y, g.bomb.r, H - g.bomb.r);
    } else if (g.mode === "snow") {
      g.brush += step;
      while (g.brush > 20) {
        g.brush -= 20;
        addFlake(x + rnd(-8, 8), y + rnd(-8, 8), rnd(-50, 50), rnd(-70, 10), rnd(10, 22), g.snowType.id);
      }
    } else if (g.mode === "peach") {               // the hand stirs the air
      gust = clamp(gust + dx * 0.5, -70, 70);
      for (const p of petals) {
        if (p.settled) continue;
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < 90) {
          p.vx += dx * 5 * (1 - d / 90);
          p.vy += dy * 3 * (1 - d / 90);
        }
      }
      g.brush += step;
      while (g.brush > 30) {
        g.brush -= 30;
        shakeTree(x, y, 0.4, true);
      }
    }
  });

  const finish = (ok) => (e) => {
    const g = touches.get(e.pointerId);
    if (!g) return;
    touches.delete(e.pointerId);
    if (ok) {
      const [x, y] = point(e);
      g.x = x;
      g.y = y;
      g.samples.push([performance.now(), x, y]);
    }
    if (g.mode === "snow" && g.moved) snowIndex++;       // the next stroke uses the next crystal
    releaseGesture(g, ok);
    startLoop();
  };
  canvas.addEventListener("pointerup", finish(true));
  canvas.addEventListener("pointercancel", finish(false));
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  if (fullScreen) {
    // the stand-alone app owns the whole screen: no scrolling, zooming or callouts
    canvas.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
    document.addEventListener("gesturestart", (e) => e.preventDefault());
  }

  canvas.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      if (ready()) launchGrand(W * 0.5, H * 0.4);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      ignite(W * 0.5, H * (mode === "bomb" ? 0.18 : mode === "fireworks" ? 0.42 : 0.36));
    }
  });

  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => window.setTimeout(resize, 250));
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && active()) startLoop(); });
  if (window.IntersectionObserver) {
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible && active()) startLoop();
    }, { threshold: 0.08 }).observe(stage);
  }

  resize();
  let remembered = false;
  try { remembered = window.localStorage.getItem("bengbeng-sound") === "1"; } catch (e) { /* private mode */ }
  audio.on = remembered;                // the context itself starts on the first touch
  if (soundBtn || badgeEl) {
    if (soundBtn) {
      soundBtn.setAttribute("aria-pressed", String(remembered));
      const label = soundBtn.querySelector("[data-sound-label]");
      if (label) label.textContent = remembered ? "on" : "off";
    }
    if (badgeEl) badgeEl.textContent = remembered ? "LIVE · SOUND ON" : "LIVE · NO SOUND";
  }
  const wanted = new URLSearchParams(window.location.search).get("mode");
  setMode(LABELS[wanted] ? wanted : "fireworks");

  if (reduced) {
    setStatus("Reduced motion is on — effects are paused.");
    if (motionBtn) {
      motionBtn.hidden = false;
      motionBtn.addEventListener("click", () => {
        reduced = false;
        motionBtn.hidden = true;
        canvas.removeAttribute("aria-disabled");
        setMode(mode);
      });
    } else {
      canvas.setAttribute("aria-disabled", "true");
    }
  }
})();
