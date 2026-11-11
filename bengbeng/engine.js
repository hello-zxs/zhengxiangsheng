/* 蹦蹦 / BENG BENG — one stage, four toys: fireworks, firecrackers, bombs, snow.

   The same file drives the section on zhengxiangsheng.com and the stand-alone
   app in /bengbeng/.  No dependencies.  Sound is synthesised in the browser and
   stays off until someone asks for it.

   Gestures (mouse, pen or any number of fingers):
     fireworks    tap = three shells          hold = one grand shell
     firecracker  tap = a hanging string      drag = lay a string along the path
                  hold = a double-banger (二踢脚)
     bomb         tap = drop                  hold = a bigger bomb
                  flick = throw; bombs bounce, roll and set each other off
     snow         tap = a flurry of one crystal type (it changes every tap)
                  hold = grow one large crystal   drag = scatter flakes         */
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
    snow: "雪 · Snow"
  };
  const HINTS = {
    fireworks: "tap for a shell, hold for a grand one.",
    firecracker: "tap to hang a string, drag to lay one, hold for a double-banger.",
    bomb: "tap to drop, hold for a big one, flick to throw. They set each other off.",
    snow: "tap for a flurry, hold to grow a crystal, drag to scatter."
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
  const PAPER_COLORS = ["#c81e1e", "#e03a2f", "#b51f1a", "#f2c14e", "#f6e7c8", "#d9322b"];
  const MAX_PARTICLES = 3600;
  const MAX_SMOKE = 420;
  const MAX_PAPER = 520;
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
    if (reduced) return;
    setStatus(LABELS[next] + " — " + HINTS[next]);
    if (next === "snow") startLoop();
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
      audio.master.connect(audio.ctx.destination);
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
    if (kind === "pop") {
      if (t - audio.lastPop < 0.022) return;       // a long string would otherwise saturate
      audio.lastPop = t;
      noiseBurst(t, 0.07, 0.5 * v, "highpass", rnd(900, 1500));
      tone(t, 0.05, 0.3 * v, rnd(170, 230), 60);
    } else if (kind === "bang") {
      noiseBurst(t, 0.22, 0.75 * v, "lowpass", 2600);
      tone(t, 0.2, 0.5 * v, 150, 45);
    } else if (kind === "boom") {
      noiseBurst(t, 0.9 * v, 0.9, "lowpass", 420);
      noiseBurst(t, 0.18, 0.5, "highpass", 1400);
      tone(t, 0.7 * v, 0.9, 95, 28);
    } else if (kind === "burst") {
      noiseBurst(t, 0.4, 0.3 * v, "bandpass", rnd(900, 1500), 0.6);
      tone(t, 0.25, 0.18 * v, 120, 50);
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
      split: false,
      didSplit: false
    };
  }

  function makeSmoke(x, y, vx, vy, life, size) {
    return { x, y, vx, vy, life, maxLife: life, size, drag: 0.992, rise: rnd(2, 8) };
  }

  function sayAt(x, y, str, size, color) {
    texts.push({ x: clamp(x, 30, W - 30), y: clamp(y, 30, H - 20), str, size, color, t: 0, life: 0.95 });
  }

  /* ------------------------------------------------------------ fireworks */
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
    rockets.push({
      x0: clamp(clamp(x, 26, W - 26) + rnd(-22, 22), 14, W - 14),
      y0: H + 6,
      x1: clamp(x, 26, W - 26),
      y1: clamp(y, 34, H - 44),
      t: 0,
      fly: rnd(0.32, 0.44),
      type: pick(FIREWORK_TYPES),
      scale: scale || 1
    });
    startLoop();
  }

  function burst(x, y, scale, type) {
    scale = scale || 1;
    type = type || pick(FIREWORK_TYPES);
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
    if (type === "crossette") { n = 150; speed = 5.4; life = 3.2; gravity = 2.8; size = 1.7; }
    if (type === "palm") { n = 100; speed = 5.2; life = 3.8; gravity = 1.2; size = 2.6; }
    if (type === "heart") { n = 250; life = 4.2; gravity = 0.8; drag = 0.996; size = 1.9; }
    if (type === "clover") { n = 270; life = 4.2; gravity = 0.7; drag = 0.996; size = 1.9; }

    for (let i = 0; i < n; i++) {
      let vx;
      let vy;
      if (type === "heart") {
        const [hx, hy] = heartPoint((i / n) * TAU + rnd(-0.012, 0.012));
        vx = hx * 4.1 * scale;
        vy = hy * 4.1 * scale;
      } else if (type === "clover") {
        const [cx, cy] = cloverPoint((i / n) * TAU + rnd(-0.012, 0.012));
        vx = cx * 4.1 * scale;
        vy = cy * 4.1 * scale;
      } else {
        const a = (i / n) * TAU + rnd(-0.018, 0.018);
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
      const a = rnd(0, TAU);
      const s = rnd(0.5, 2.2);
      addParticle(makeParticle(x, y, Math.cos(a) * s, Math.sin(a) * s,
        rnd(0.3, 0.8), pick(["#ffffff", "#ffd60a", shapeColors[1]]),
        rnd(0.6, 1.2), 28, 0.98, "spark"));
    }
    sfx("burst", clamp(scale, 0.4, 1.2));
  }

  function launchGrand(x, y) {
    rockets.push({
      x0: clamp(x + rnd(-18, 18), 18, W - 18),
      y0: H + 8,
      x1: clamp(x, 42, W - 42),
      y1: clamp(y, 46, H - 58),
      t: 0,
      fly: 0.62,
      type: "grand",
      scale: 1,
      grand: true
    });
    startLoop();
  }

  function grandBurst(x, y) {
    const gold = ["#ffd700", "#ffe9a8", "#fffbe6", "#ffffff"];
    const jewel = ["#4169e1", "#8b1e3f", "#1f7a5a", "#bf9b30", "#ffd700"];
    flash(x, y, 3.0, "#ffd700");
    fireballs.push({ x, y, t: 0, life: 2.2, scale: 1.35 });
    shocks.push({ x, y, t: 0, life: 1.1, max: 280, color: "#ffd700" });
    shocks.push({ x, y, t: 0.08, life: 0.95, max: 215, color: "#ffffff" });
    const ring = (n, speed, lifeA, lifeB, colors, sizeA, sizeB, gravity, drag, squash) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rnd(-0.02, 0.02);
        const s = squash ? speed : speed * Math.sqrt(rnd(0.12, 1));
        addParticle(makeParticle(x, y, Math.cos(a) * s, Math.sin(a) * s * (squash || 1),
          rnd(lifeA, lifeB), pick(colors), rnd(sizeA, sizeB), gravity, drag, "spark"));
      }
    };
    ring(420, 6.2, 3.6, 4.4, gold, 1.8, 2.8, 1.2, 0.994);
    ring(120, 3.2, 3.8, 4.6, ["#ffd700", "#e6b84a", "#ffe9a8"], 1.2, 2.0, 0.7, 0.996);
    ring(240, 4.0, 3.2, 3.8, jewel, 1.3, 2.2, 1.5, 0.994);
    ring(180, 5.8, 3.2, 3.8, ["#fffbe6", "#ffd700", "#ffffff"], 1.4, 2.2, 1.0, 0.995, 0.66);
    for (let i = 0; i < 140; i++) {
      const a = rnd(0, TAU);
      const s = rnd(1.2, 5.2);
      addParticle(makeParticle(x, y, Math.cos(a) * s, Math.sin(a) * s,
        rnd(1.4, 2.4), pick(["#ffffff", "#ffe9a8", "#ffd700"]),
        rnd(0.6, 1.2), 2.0, 0.99, "spark"));
    }
    shake(5, 0.35);
    sfx("boom", 0.8);
  }

  function splitParticle(p) {
    for (let i = 0; i < 4; i++) {
      const a = rnd(0, TAU);
      const s = rnd(0.5, 2.6);
      addParticle(makeParticle(p.x, p.y, Math.cos(a) * s, Math.sin(a) * s,
        rnd(0.3, 0.7), i === 0 ? "#ffffff" : p.color,
        rnd(0.7, 1.5), 28, 0.97, "spark"));
    }
  }

  function fireworksAt(x, y) {
    launchShell(x, y, 1.1);
    window.setTimeout(() => launchShell(x + rnd(-120, 120), y + rnd(-58, 52), rnd(0.55, 0.75)), rnd(160, 260));
    window.setTimeout(() => launchShell(x + rnd(-150, 150), y + rnd(-70, 62), rnd(0.42, 0.58)), rnd(320, 410));
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
      settled: false, rest: 0, keep: rnd(9, 15)
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
  function crackerPop(x, y, scale, loud) {
    flash(x, y, 0.75 * scale, "#ff2d55");
    shocks.push({ x, y, t: 0, life: 0.5, max: 72 * scale, color: "#ffd60a" });
    const sparks = loud ? 70 : 24;
    for (let i = 0; i < sparks; i++) {
      const a = rnd(0, TAU);
      const s = rnd(0.8, 5.2) * scale;
      addParticle(makeParticle(x, y, Math.cos(a) * s, Math.sin(a) * s,
        rnd(0.3, 0.85), pick(["#ff2d55", "#ffd60a", "#ffffff", "#ff9f0a"]),
        rnd(0.8, 2.0), 44, 0.976, "spark"));
    }
    for (let i = 0; i < (loud ? 9 : 3); i++) {
      addSmoke(makeSmoke(x + rnd(-8, 8), y - 2, rnd(-8, 8), rnd(-16, -5), rnd(1.0, 1.8), rnd(9, 18) * scale));
    }
    paperShower(x, y, loud ? 30 : 6, loud ? 340 : 210);
    sfx(loud ? "bang" : "pop");
  }

  function addString(items, igniteIndex, rope) {
    if (strings.length >= 6) {
      const old = strings[0];
      old.items.forEach((it) => { it.popAt = Math.min(it.popAt, old.t + rnd(0, 0.25)); });
    }
    const s = { items, t: 0, rope, interval: rnd(0.052, 0.07) };
    for (let i = 0; i < items.length; i++) {
      items[i].popped = false;
      items[i].popAt = 0.22 + Math.abs(i - igniteIndex) * s.interval + rnd(-0.3, 0.3) * s.interval;
    }
    strings.push(s);
    startLoop();
  }

  // tap: a string hanging from the tap point, lit at the bottom
  function hangString(x, y) {
    const anchorX = clamp(x, 40, W - 40);
    const topY = clamp(y, 18, Math.max(18, H - 150));
    const room = groundY(anchorX) - topY - 26;
    const length = clamp(room, 70, 300);
    const n = clamp(Math.floor(length / 14), 6, 24);
    const items = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      items.push({
        x: anchorX + Math.sin(t * Math.PI * 1.35) * 14,
        y: topY + 10 + length * t,
        rot: Math.sin(t * Math.PI) * 0.1 + (i % 2 ? 0.5 : -0.5)
      });
    }
    addString(items, n - 1, { x: anchorX, y: topY });
    setStatus(LABELS.firecracker + " — " + n + " on the string.");
  }

  // drag: crackers laid herringbone-fashion along the path, lit where the drag began
  function layString(path) {
    const items = [];
    let carry = 0;
    for (let i = 1; i < path.length && items.length < 90; i++) {
      const [x0, y0] = path[i - 1];
      const [x1, y1] = path[i];
      const seg = Math.hypot(x1 - x0, y1 - y0);
      if (seg < 0.01) continue;
      const a = Math.atan2(y1 - y0, x1 - x0);
      let d = 13 - carry;
      while (d <= seg && items.length < 90) {
        const side = items.length % 2 ? 1 : -1;
        const px = x0 + Math.cos(a) * d;
        const py = y0 + Math.sin(a) * d;
        items.push({
          x: px + Math.cos(a + Math.PI / 2) * 4.5 * side,
          y: py + Math.sin(a + Math.PI / 2) * 4.5 * side,
          rot: a + Math.PI / 2 + side * 0.5,
          fx: px, fy: py
        });
        d += 13;
      }
      carry = seg - (d - 13);
    }
    if (items.length < 3) return false;
    addString(items, 0, null);
    setStatus(LABELS.firecracker + " — " + items.length + " laid; lit at the start.");
    return true;
  }

  function drawCracker(x, y, rot, alpha, hot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#b51f1a";
    ctx.fillRect(-3.5, -7, 7, 14);
    ctx.fillStyle = "#e8c76a";
    ctx.fillRect(-3.5, -7, 7, 2.2);
    ctx.fillRect(-3.5, 4.8, 7, 2.2);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(-1.2, -5, 1.2, 10);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(2, -5.5, 1.2, 11);
    ctx.strokeStyle = "#6b4a24";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(0, -11);
    ctx.stroke();
    if (hot) {
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "#ffd60a";
      ctx.beginPath();
      ctx.arc(0, -11, 1.4 + Math.random() * 1.8, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.restore();
  }

  function drawString(s) {
    const items = s.items;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = "#d8b05c";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (s.rope) {
      ctx.moveTo(s.rope.x, s.rope.y);
      for (const it of items) ctx.lineTo(it.x, it.y - 8);
    } else {
      items.forEach((it, i) => (i ? ctx.lineTo(it.fx, it.fy) : ctx.moveTo(it.fx, it.fy)));
    }
    ctx.stroke();
    if (s.rope) {
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = "#7a5426";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(s.rope.x - 26, s.rope.y);
      ctx.lineTo(s.rope.x + 26, s.rope.y);
      ctx.stroke();
    }
    for (const it of items) {
      if (it.popped) continue;
      drawCracker(it.x, it.y, it.rot, 0.98, it.popAt - s.t < 0.11);
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
        crackerPop(k.x, k.y + 12, 1.1, false);
        sfx("bang", 0.8);
        const rise = clamp(k.y - 46, 60, 320);
        k.vy = -Math.sqrt(2 * 900 * rise);
        shake(3, 0.18);
      }
      return true;
    }
    k.vy += 900 * dt;
    k.x += k.vx * dt;
    k.y += k.vy * dt;
    k.rot += k.vx * 0.004;
    addParticle(makeParticle(k.x + rnd(-2, 2), k.y + 12, rnd(-0.4, 0.4), rnd(0.5, 2),
      rnd(0.2, 0.45), pick(["#ffd60a", "#ff9f0a", "#ffffff"]), rnd(0.7, 1.4), 20, 0.97, "spark"));
    if (k.vy >= -40) {
      crackerPop(k.x, k.y, 1.7, true);
      shocks.push({ x: k.x, y: k.y, t: 0, life: 0.8, max: 150, color: "#ffffff" });
      sayAt(k.x, k.y - 34, "砰", 30, "#ffd60a");
      shake(6, 0.3);
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
    if (g.mode === "fireworks" && !g.moved && !g.fired && g.t > 0.12) {
      drawRing(g.sx, g.sy, g.t / 0.72, "HOLD");
    } else if (g.mode === "firecracker") {
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
        for (let i = 0; i < g.path.length; i += 4) drawCracker(g.path[i][0], g.path[i][1], i * 0.9, 0.55, false);
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
      rockets.length || strings.length || kickers.length || bombs.length || flakes.length ||
      texts.length || touches.size || whiteout > 0.01 || shakeLeft > 0 ||
      papers.some((p) => !p.settled || p.rest > p.keep - 1.2) || mode === "snow";
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

    // paper
    ctx.globalCompositeOperation = "source-over";
    for (let i = papers.length - 1; i >= 0; i--) {
      const p = papers[i];
      p.age += dt;
      let alpha = 0.95;
      if (p.settled) {
        p.rest += dt;
        p.y = groundY(p.x) - 1;
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
        if (p.vy > 0 && p.y >= groundY(p.x) - 1) {
          p.settled = true;
          p.rest = 0;
          p.rot = rnd(-0.4, 0.4);
        }
      }
      const flip = p.settled ? 1 : 0.25 + 0.75 * Math.abs(Math.cos(p.age * 9 + p.phase));
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
      const s = strings[i];
      s.t += dt;
      let left = 0;
      let lastPop = 0;
      for (const it of s.items) {
        if (!it.popped && s.t >= it.popAt) {
          it.popped = true;
          it.at = s.t;
          crackerPop(it.x, it.y, 0.9, false);
          if (Math.random() < 0.13) sayAt(it.x + rnd(-18, 18), it.y - 18, "啪", 20, "#ffd60a");
        }
        if (it.popped) lastPop = Math.max(lastPop, it.at || 0);
        else left++;
      }
      if (!left && s.t > lastPop + 0.35) strings.splice(i, 1);
      else drawString(s);
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
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, "rgba(190,186,176,0.22)");
      g.addColorStop(1, "rgba(190,186,176,0)");
      ctx.globalAlpha = 0.3 * k;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.fill();
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
      p.x += p.vx * f;
      p.y += p.vy * f;
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
    startLoop();
  }

  function clearAll() {
    for (const list of [particles, smoke, flashes, shocks, fireballs, rockets, strings, kickers, bombs, papers, flakes, texts]) list.length = 0;
    touches.clear();
    pile.fill(0);
    pileTop = 0;
    whiteout = 0;
    shakeLeft = 0;
    draw(0);
    setStatus(LABELS[mode] + " — stage cleared.");
    if (mode === "snow") startLoop();
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
      path: [[x, y]], length: 0, brush: 0,
      samples: [[performance.now(), x, y]]
    };
    if (mode === "bomb") g.bomb = newBomb(clamp(x, 14, W - 14), clamp(y, 14, H - 14), true);
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
    const step = Math.hypot(x - g.x, y - g.y);
    g.x = x;
    g.y = y;
    g.samples.push([performance.now(), x, y]);
    while (g.samples.length > 2 && g.samples[g.samples.length - 1][0] - g.samples[0][0] > 90) g.samples.shift();
    if (!g.moved && Math.hypot(x - g.sx, y - g.sy) > 12) g.moved = true;
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
      ignite(W * 0.5, H * (mode === "bomb" ? 0.18 : 0.36));
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
