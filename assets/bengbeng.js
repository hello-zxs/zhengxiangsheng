/* zhengxiangsheng.com — 蹦蹦 / BENG BENG
   Three small effects on one stage: fireworks, firecrackers, a bomb.
   No audio, no dependencies, reduced-motion aware. */
(() => {
  "use strict";

  const stage = document.querySelector("[data-bengbeng-stage]");
  const canvas = document.querySelector("[data-bengbeng-canvas]");
  const statusEl = document.querySelector("[data-bengbeng-status]");
  const modeButtons = Array.from(document.querySelectorAll("[data-mode]"));
  const launchBtn = document.querySelector("[data-launch]");
  const clearBtn = document.querySelector("[data-clear]");
  if (!stage || !canvas || !statusEl) return;

  const ctx = canvas.getContext("2d");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
    "willow", "willow", "crossette", "palm"
  ];
  const LABELS = {
    fireworks: "烟花 · Fireworks",
    firecracker: "爆竹 · Firecracker",
    bomb: "炸弹 · Bomb"
  };
  const MAX_PARTICLES = 3600;
  const MAX_SMOKE = 420;

  let W = 1;
  let H = 1;
  let dpr = 1;
  let running = false;
  let last = 0;
  let mode = "fireworks";
  let shakeTimer = 0;
  let charge = null;
  let suppressClick = false;

  const particles = [];
  const smoke = [];
  const flashes = [];
  const shocks = [];
  const fireballs = [];
  const rockets = [];
  const strings = [];
  const bombs = [];

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const safe = (r) => (Number.isFinite(r) && r > 0.1 ? r : 0.1);

  function resize() {
    const rect = stage.getBoundingClientRect();
    W = Math.max(1, Math.round(rect.width));
    H = Math.max(1, Math.round(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function setMode(next) {
    mode = next;
    charge = null;
    modeButtons.forEach((b) => {
      const on = b.dataset.mode === next;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    if (next === "fireworks") {
      setStatus("烟花 · Fireworks — click for a shell, hold for a grand one.");
    } else {
      setStatus(LABELS[next] + " — click the stage, or press Ignite.");
    }
  }

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

  function makeParticle(x, y, vx, vy, life, color, size, gravity, drag, kind) {
    return {
      x, y, vx, vy,
      life, maxLife: life,
      color, size,
      gravity, drag,
      history: [],
      kind: kind || "spark",
      flicker: Math.random() < 0.14,
      split: false,
      didSplit: false
    };
  }

  function heartPoint(t) {
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    return [x / 18, y / 18];
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

    const colors = pick(FIREWORK_SETS);
    let n = 220;
    let speed = 5.4;
    let life = 2.5;
    let gravity = 8.5;
    let drag = 0.988;
    let size = 1.7;

    if (type === "chrysanthemum") { n = 250; speed = 5.8; life = 2.7; gravity = 7; size = 1.6; }
    if (type === "willow") { n = 180; speed = 4.8; life = 3.4; gravity = 4.5; drag = 0.993; size = 1.4; }
    if (type === "ring") { n = 200; speed = 5.0; life = 2.3; gravity = 5; size = 1.6; }
    if (type === "crossette") { n = 110; speed = 5.4; life = 2.4; gravity = 9; size = 1.7; }
    if (type === "palm") { n = 75; speed = 5.2; life = 2.9; gravity = 5.5; size = 2.6; }

    for (let i = 0; i < n; i++) {
      let vx;
      let vy;
      if (type === "heart") {
        const [hx, hy] = heartPoint((i / n) * Math.PI * 2);
        vx = hx * 7.0 * scale;
        vy = hy * 7.0 * scale;
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
      const color = r < 0.72 ? colors[0] : r < 0.94 ? colors[1] : "#ffffff";
      const p = makeParticle(x, y, vx, vy, life * rnd(0.78, 1.12), color,
        size * rnd(0.62, 1.28), gravity * rnd(0.85, 1.15), drag, "spark");
      p.split = type === "crossette" && i % 2 === 0;
      addParticle(p);
    }

    flash(x, y, 1.55 * scale, colors[0]);
    shocks.push({ x, y, t: 0, life: 0.65, max: 96 * scale, color: colors[0] });

    for (let i = 0; i < 5; i++) {
      addSmoke(makeSmoke(x + rnd(-8, 8), y + rnd(-4, 8),
        rnd(-12, 12), rnd(-8, 4), rnd(0.8, 1.5), rnd(8, 16)));
    }
    for (let i = 0; i < 24; i++) {
      const a = rnd(0, Math.PI * 2);
      const s = rnd(0.5, 2.2);
      addParticle(makeParticle(x, y, Math.cos(a) * s, Math.sin(a) * s,
        rnd(0.3, 0.8), pick(["#ffffff", "#ffd60a", colors[1]]),
        rnd(0.6, 1.2), 28, 0.98, "spark"));
    }
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
    const gold = ["#ffd700", "#ffe9a8", "#fffbe6", "#ffffff"];
    const jewel = ["#4169e1", "#8b1e3f", "#1f7a5a", "#bf9b30", "#ffd700"];

    flash(x, y, 3.0, "#ffd700");
    shocks.push({ x, y, t: 0, life: 1.0, max: 270, color: "#ffd700" });
    shocks.push({ x, y, t: 0.08, life: 0.85, max: 205, color: "#ffffff" });
    shocks.push({ x, y, t: 0.18, life: 0.75, max: 150, color: "#bf9b30" });

    for (let i = 0; i < 320; i++) {
      const a = (i / 320) * Math.PI * 2 + rnd(-0.01, 0.01);
      const s = 6.4 * Math.sqrt(rnd(0.12, 1));
      addParticle(makeParticle(x, y, Math.cos(a) * s, Math.sin(a) * s,
        rnd(2.9, 3.5), pick(gold), rnd(1.4, 2.4), 3.8, 0.991, "spark"));
    }

    for (let i = 0; i < 100; i++) {
      const a = (i / 100) * Math.PI * 2 + rnd(-0.02, 0.02);
      const s = 3.2 * Math.sqrt(rnd(0.1, 1));
      addParticle(makeParticle(x, y, Math.cos(a) * s, Math.sin(a) * s,
        rnd(3.0, 3.8), pick(["#ffd700", "#e6b84a", "#ffe9a8"]),
        rnd(1.0, 1.8), 2.0, 0.993, "spark"));
    }

    window.setTimeout(() => {
      if (reduced) return;
      for (let i = 0; i < 180; i++) {
        const a = (i / 180) * Math.PI * 2 + rnd(-0.02, 0.02);
        const s = 4.0 * Math.sqrt(rnd(0.15, 1));
        addParticle(makeParticle(x, y, Math.cos(a) * s, Math.sin(a) * s,
          rnd(2.5, 3.0), pick(jewel), rnd(1.1, 2.0), 4.2, 0.99, "spark"));
      }
    }, 130);

    window.setTimeout(() => {
      if (reduced) return;
      for (let i = 0; i < 140; i++) {
        const a = (i / 140) * Math.PI * 2;
        addParticle(makeParticle(x, y,
          Math.cos(a) * 5.8, Math.sin(a) * 5.8 * 0.66,
          rnd(2.6, 3.0), pick(["#fffbe6", "#ffd700", "#ffffff"]),
          rnd(1.2, 2.0), 2.4, 0.993, "spark"));
      }
    }, 240);

    window.setTimeout(() => {
      if (reduced) return;
      for (let i = 0; i < 110; i++) {
        const a = rnd(0, Math.PI * 2);
        const s = rnd(1.2, 5.2);
        addParticle(makeParticle(x, y, Math.cos(a) * s, Math.sin(a) * s,
          rnd(0.9, 1.7), pick(["#ffffff", "#ffe9a8", "#ffd700"]),
          rnd(0.6, 1.2), 5, 0.985, "spark"));
      }
    }, 330);

    for (let i = 0; i < 30; i++) {
      addSmoke(makeSmoke(x + rnd(-24, 24), y + rnd(-10, 18),
        rnd(-16, 16), rnd(-18, 2), rnd(1.6, 3.0), rnd(16, 34)));
    }
  }

  function drawCharge() {
    if (!charge) return;
    const p = Math.min(1, charge.t / charge.duration);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(charge.x, charge.y, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(charge.x, charge.y, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
    ctx.stroke();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = "#ffd700";
    ctx.font = '9px "Inter", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("HOLD", charge.x, charge.y + 42);
    ctx.globalAlpha = 1;
  }

  function popCracker(x, y, scale) {    scale = scale || 1;
    flash(x, y, 0.75 * scale, "#ff2d55");
    shocks.push({ x, y, t: 0, life: 0.5, max: 72 * scale, color: "#ffd60a" });
    for (let i = 0; i < 42; i++) {
      const a = rnd(0, Math.PI * 2);
      const s = rnd(0.8, 5.2) * scale;
      addParticle(makeParticle(x, y, Math.cos(a) * s, Math.sin(a) * s,
        rnd(0.3, 0.85), pick(["#ff2d55", "#ffd60a", "#ffffff", "#ff9f0a"]),
        rnd(0.8, 2.0), 44, 0.976, "spark"));
    }
    for (let i = 0; i < 20; i++) {
      const a = rnd(0, Math.PI * 2);
      const s = rnd(1, 4.5) * scale;
      addParticle(makeParticle(x, y, Math.cos(a) * s, Math.sin(a) * s,
        rnd(0.5, 1.1), pick(["#c81e1e", "#ffd60a", "#f2e6c9"]),
        rnd(1.2, 2.8), 50, 0.99, "debris"));
    }
    for (let i = 0; i < 7; i++) {
      addSmoke(makeSmoke(x + rnd(-8, 8), y - 2, rnd(-8, 8), rnd(-16, -5),
        rnd(1.0, 1.8), rnd(9, 18)));
    }
  }

  function makeSmoke(x, y, vx, vy, life, size) {
    return {
      x, y, vx, vy,
      life, maxLife: life,
      size,
      drag: 0.992,
      rise: rnd(2, 8)
    };
  }

  function firecracker(x, y) {
    if (reduced) return;
    if (strings.length > 1) strings.shift();
    const n = 18;
    const anchorX = clamp(x, 78, W - 78);
    const topY = clamp(y - 135, 22, H - 270);
    const length = Math.min(260, H - topY - 32);
    const items = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const sway = Math.sin(t * Math.PI * 1.35) * 14;
      items.push({
        x: anchorX + sway,
        y: topY + length * t,
        delay: (n - 1 - i) * 0.072,
        popped: false,
        rot: Math.sin(t * Math.PI) * 0.1
      });
    }
    strings.push({ items, t: 0, anchorX, topY, length });
    startLoop();
  }

  function drawString(s) {
    ctx.globalCompositeOperation = "source-over";
    const items = s.items;
    if (!items.length) return;

    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = "#d8b05c";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(s.anchorX, s.topY);
    for (const it of items) ctx.quadraticCurveTo(it.x, it.y, it.x, it.y);
    ctx.stroke();

    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = "#7a5426";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(s.anchorX - 28, s.topY - 8);
    ctx.lineTo(s.anchorX + 28, s.topY - 8);
    ctx.stroke();
    ctx.fillStyle = "#d8b05c";
    ctx.beginPath();
    ctx.arc(s.anchorX, s.topY - 8, 2.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.32;
    ctx.strokeStyle = "#8c642f";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(s.anchorX + 2, s.topY);
    for (const it of items) ctx.quadraticCurveTo(it.x + 2, it.y, it.x + 2, it.y);
    ctx.stroke();

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.popped) {
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = "#2a1a12";
        ctx.fillRect(it.x - 2, it.y - 2, 4, 5);
        continue;
      }
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(it.rot);
      ctx.globalAlpha = 0.98;

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
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function bomb(x, y) {
    if (reduced) return;
    if (bombs.length > 2) bombs.shift();
    bombs.push({ x: clamp(x, 30, W - 30), y: clamp(y, 28, H - 28), t: 0, fuse: 0.78, boom: false });
    startLoop();
  }

  function drawBomb(b) {
    ctx.globalCompositeOperation = "source-over";
    const x = b.x;
    const y = b.y;
    const r = 13;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#050607";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.arc(x - 4, y - 5, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#b3261e";
    ctx.fillRect(x - r, y - 2, r * 2, 4);
    ctx.strokeStyle = "#d9b26a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 4, y - r);
    ctx.quadraticCurveTo(x + 14, y - r - 8, x + 17, y - r - 16);
    ctx.stroke();
    const spark = 1.2 + Math.random() * 1.8;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "#ffd60a";
    ctx.beginPath();
    ctx.arc(x + 17, y - r - 16, spark, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x + 17, y - r - 16, spark * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = "#ffd60a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x + 17, y - r - 16, 4 + Math.sin(b.t * 40) * 1.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function explodeBomb(b) {
    if (b.boom) return;
    b.boom = true;
    flash(b.x, b.y, 3.2, "#ffd60a");
    for (let i = 0; i < 3; i++) {
      fireballs.push({
        x: b.x + rnd(-14, 14),
        y: b.y + rnd(-12, 12),
        t: 0,
        life: rnd(0.55, 0.95),
        scale: rnd(0.72, 1.25)
      });
    }
    shocks.push({ x: b.x, y: b.y, t: 0, life: 1.05, max: 250, color: "#ff9f0a" });
    shocks.push({ x: b.x, y: b.y, t: 0.06, life: 0.9, max: 180, color: "#ffffff" });
    shocks.push({ x: b.x, y: b.y, t: 0.14, life: 0.72, max: 125, color: "#ff2d55" });

    for (let i = 0; i < 145; i++) {
      const a = rnd(0, Math.PI * 2);
      const s = rnd(1.5, 13);
      addParticle(makeParticle(b.x, b.y, Math.cos(a) * s, Math.sin(a) * s,
        rnd(0.4, 1.15), pick(["#ffd60a", "#ff9f0a", "#ff2d55", "#ffffff"]),
        rnd(0.9, 3.0), 34, 0.975, "spark"));
    }
    for (let i = 0; i < 38; i++) {
      const a = rnd(0, Math.PI * 2);
      const s = rnd(1.5, 7);
      addParticle(makeParticle(b.x, b.y, Math.cos(a) * s, Math.sin(a) * s,
        rnd(0.5, 1.1), pick(["#2b2b2b", "#3a2a1f", "#1a1a1a", "#5a3a20"]),
        rnd(1.2, 3.4), 48, 0.99, "debris"));
    }
    for (let i = 0; i < 46; i++) {
      addSmoke(makeSmoke(b.x + rnd(-22, 22), b.y + rnd(-12, 18),
        rnd(-24, 24), rnd(-28, -2), rnd(1.4, 2.8), rnd(16, 34)));
    }

    stage.classList.remove("is-shaking");
    void stage.offsetWidth;
    stage.classList.add("is-shaking");
    window.clearTimeout(shakeTimer);
    shakeTimer = window.setTimeout(() => stage.classList.remove("is-shaking"), 520);
  }

  function splitParticle(p) {
    for (let i = 0; i < 4; i++) {
      const a = rnd(0, Math.PI * 2);
      const s = rnd(0.5, 2.6);
      addParticle(makeParticle(p.x, p.y, Math.cos(a) * s, Math.sin(a) * s,
        rnd(0.3, 0.7), i === 0 ? "#ffffff" : p.color,
        rnd(0.7, 1.5), 28, 0.97, "spark"));
    }
  }

  function startLoop() {
    if (reduced) return;
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(tick);
  }

  function drawRocket(r) {
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = r.grand ? 0.5 : 0.32;
    ctx.strokeStyle = r.grand ? "#ffe9a8" : "#ffb347";
    ctx.lineWidth = r.grand ? 2.2 : 1.2;
    ctx.beginPath();
    ctx.moveTo(r.x0, r.y0);
    ctx.lineTo(r.x, r.y);
    ctx.stroke();

    const glow = r.grand ? 9 : 5.5;
    const g = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, glow * 2.2);
    g.addColorStop(0, "rgba(255,255,245,0.95)");
    g.addColorStop(0.3, r.grand ? "rgba(255,215,0,0.7)" : "rgba(255,214,10,0.6)");
    g.addColorStop(1, "rgba(255,120,0,0)");
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(r.x, r.y, glow * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.grand ? 2.6 : 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function active() {
    return particles.length || smoke.length || flashes.length || shocks.length ||
      fireballs.length || rockets.length || strings.length || bombs.length || charge;
  }

  function tick(now) {
    if (document.hidden) {
      running = false;
      return;
    }
    const dt = Math.min(0.045, (now - last) / 1000 || 0.016);
    last = now;

    ctx.clearRect(0, 0, W, H);

    if (charge) {
      charge.t += dt;
      if (charge.t >= charge.duration) {
        const c = charge;
        charge = null;
        suppressClick = true;
        launchGrand(c.x, c.y);
      }
    }

    // rockets, crackers and bombs are solid props
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.t += dt;
      const k = Math.min(1, r.t / r.fly);
      const ease = 1 - Math.pow(1 - k, 2);
      r.x = r.x0 + (r.x1 - r.x0) * ease;
      r.y = r.y0 + (r.y1 - r.y0) * ease;
      r.trailClock += dt;

      if (r.trailClock > 0.045) {
        r.trailClock = 0;
        addParticle(makeParticle(r.x + rnd(-2, 2), r.y + 4,
          rnd(-8, 8), rnd(12, 34), rnd(0.18, 0.36),
          pick(["#ffd60a", "#ff9f0a", "#ffffff"]), rnd(0.7, 1.4), 18, 0.97, "spark"));
        addSmoke(makeSmoke(r.x + rnd(-2, 2), r.y + 6,
          rnd(-3, 3), rnd(4, 10), rnd(0.35, 0.6), rnd(3, 6)));
      }

      if (k >= 1) {
        if (r.grand) {
          grandBurst(r.x1, r.y1);
        } else {
          burst(r.x1, r.y1, r.scale, r.type);
        }
        rockets.splice(i, 1);
      } else {
        drawRocket(r);
      }
    }

    for (let i = strings.length - 1; i >= 0; i--) {
      const s = strings[i];
      s.t += dt;
      for (const it of s.items) {
        if (!it.popped && s.t >= it.delay) {
          it.popped = true;
          popCracker(it.x, it.y, 0.9);
        }
      }
      if (s.items.every((it) => it.popped) && s.t > s.items[s.items.length - 1].delay + 0.35) {
        strings.splice(i, 1);
      } else {
        drawString(s);
      }
    }

    for (let i = bombs.length - 1; i >= 0; i--) {
      const b = bombs[i];
      b.t += dt;
      if (!b.boom && b.t >= b.fuse) {
        explodeBomb(b);
      }
      if (b.boom && b.t >= b.fuse + 0.12) {
        bombs.splice(i, 1);
        continue;
      }
      if (!b.boom) drawBomb(b);
    }

    // flashes and shockwaves
    ctx.globalCompositeOperation = "lighter";
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) { flashes.splice(i, 1); continue; }
      const r = safe((22 + 110 * k) * f.scale);
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.18, f.color);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.globalAlpha = (1 - k) * 0.65;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = shocks.length - 1; i >= 0; i--) {
      const s = shocks[i];
      s.t += dt;
      const k = s.t / s.life;
      if (k >= 1) { shocks.splice(i, 1); continue; }
      ctx.globalAlpha = (1 - k) * 0.22;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(s.x, s.y, safe(s.max * k), 0, Math.PI * 2);
      ctx.stroke();
    }

    for (let i = fireballs.length - 1; i >= 0; i--) {
      const f = fireballs[i];
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) { fireballs.splice(i, 1); continue; }
      const r = safe((18 + 105 * Math.sqrt(k)) * f.scale);
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      g.addColorStop(0, "rgba(255,255,245,0.85)");
      g.addColorStop(0.22, "rgba(255,214,10,0.55)");
      g.addColorStop(0.55, "rgba(255,110,20,0.22)");
      g.addColorStop(1, "rgba(255,80,0,0)");
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // smoke behind sparks
    ctx.globalCompositeOperation = "source-over";
    for (let i = smoke.length - 1; i >= 0; i--) {
      const p = smoke[i];
      p.life -= dt;
      if (p.life <= 0) { smoke.splice(i, 1); continue; }
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60 - p.rise * dt * 10;
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy *= Math.pow(p.drag, dt * 60);
      const k = p.life / p.maxLife;
      const r = safe(p.size * (1.7 - k * 0.55));
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, "rgba(190,186,176,0.22)");
      g.addColorStop(1, "rgba(190,186,176,0)");
      ctx.globalAlpha = 0.3 * k;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // particles
    ctx.globalCompositeOperation = "lighter";
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.history.push([p.x, p.y]);
      if (p.history.length > 7) p.history.shift();
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy *= Math.pow(p.drag, dt * 60);
      p.vy += p.gravity * dt;
      p.x += p.vx;
      p.y += p.vy;

      if (p.split && !p.didSplit && p.life < p.maxLife * 0.6) {
        p.didSplit = true;
        splitParticle(p);
      }

      const k = Math.max(0, p.life / p.maxLife);
      const alpha = Math.min(1, 0.5 + k * 0.65) * (p.flicker && Math.random() < 0.18 ? 0.25 : 1);
      const width = Math.max(0.6, p.size * (0.45 + 0.8 * k));
      const h = p.history;

      if (p.kind === "debris") {        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = alpha * 0.9;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size);
        ctx.globalCompositeOperation = "lighter";
        continue;
      }

      ctx.globalAlpha = alpha * 0.1;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, width * 3.2, 0, Math.PI * 2);
      ctx.fill();

      if (h.length) {
        ctx.globalAlpha = alpha * 0.55;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(0.8, width * 0.65);
        ctx.beginPath();
        ctx.moveTo(h[0][0], h[0][1]);
        for (let j = 1; j < h.length; j++) ctx.lineTo(h[j][0], h[j][1]);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }

      if (p.size > 0.9) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1, p.size * 0.62), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.45, p.size * 0.26), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    drawCharge();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    if (active()) {
      requestAnimationFrame(tick);
    } else {
      running = false;
      ctx.clearRect(0, 0, W, H);
    }
  }

  function ignite(x, y) {
    if (reduced) {
      setStatus("Reduced motion is on — effects are paused.");
      return;
    }
    x = clamp(x, 18, W - 18);
    y = clamp(y, 18, H - 18);
    if (mode === "fireworks") {
      launchShell(x, y, 1.1);
      window.setTimeout(() => {
        launchShell(x + rnd(-120, 120), y + rnd(-58, 52), rnd(0.55, 0.75));
      }, rnd(160, 260));
      window.setTimeout(() => {
        launchShell(x + rnd(-150, 150), y + rnd(-70, 62), rnd(0.42, 0.58));
      }, rnd(320, 410));
    }
    if (mode === "firecracker") firecracker(x, y);
    if (mode === "bomb") bomb(x, y);
    startLoop();
  }

  function clearAll() {
    particles.length = 0;
    smoke.length = 0;
    flashes.length = 0;
    shocks.length = 0;
    fireballs.length = 0;
    rockets.length = 0;
    strings.length = 0;
    bombs.length = 0;
    charge = null;
    suppressClick = false;
    running = false;
    ctx.clearRect(0, 0, W, H);
    stage.classList.remove("is-shaking");
    setStatus(LABELS[mode] + " — stage cleared.");
  }

  // controls
  modeButtons.forEach((b) => {
    b.addEventListener("click", () => setMode(b.dataset.mode));
  });

  if (launchBtn) {
    launchBtn.addEventListener("click", () => {
      if (mode === "firecracker") {
        ignite(W * 0.5, H * 0.62);
      } else if (mode === "bomb") {
        ignite(W * 0.5, H * 0.42);
      } else {
        ignite(W * 0.5, H * 0.38);
      }
    });
  }

  if (clearBtn) clearBtn.addEventListener("click", clearAll);

  canvas.addEventListener("click", (event) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const rect = canvas.getBoundingClientRect();
    ignite(event.clientX - rect.left, event.clientY - rect.top);
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (mode !== "fireworks" || reduced || event.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    charge = { x, y, sx: x, sy: y, t: 0, duration: 0.72 };
    startLoop();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!charge) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (Math.hypot(x - charge.sx, y - charge.sy) > 14) charge = null;
  });

  const endCharge = () => {
    charge = null;
    if (suppressClick) {
      window.setTimeout(() => { suppressClick = false; }, 400);
    }
  };
  canvas.addEventListener("pointerup", endCharge);
  canvas.addEventListener("pointercancel", endCharge);
  canvas.addEventListener("pointerleave", endCharge);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  canvas.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      launchGrand(W * 0.5, H * 0.4);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      ignite(W * 0.5, H * 0.42);
    }
  });

  window.addEventListener("resize", resize);
  if (window.ResizeObserver) {
    new ResizeObserver(resize).observe(stage);
  }

  if (window.IntersectionObserver) {
    new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting && running) {
        running = false;
      } else if (entries[0].isIntersecting && active() && !reduced) {
        startLoop();
      }
    }, { threshold: 0.08 }).observe(stage);
  }

  resize();
  setMode("fireworks");

  if (reduced) {
    setStatus("Reduced motion is on — effects are paused.");
    canvas.setAttribute("aria-disabled", "true");
  }
})();
