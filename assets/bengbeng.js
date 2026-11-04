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
    ["#ff2d55", "#ffd60a", "#00e5ff"],
    ["#ff9f0a", "#ff375f", "#bf5af2"],
    ["#30d158", "#64d2ff", "#ffd60a"],
    ["#0a84ff", "#bf5af2", "#ff2d55"],
    ["#ff2d55", "#ffd60a", "#30d158"],
    ["#64d2ff", "#ffffff", "#0a84ff"]
  ];
  const FIREWORK_TYPES = ["peony", "ring", "willow", "heart", "double", "crossette", "chrysanthemum"];
  const LABELS = {
    fireworks: "烟花 · Fireworks",
    firecracker: "鞭炮 · Firecrackers",
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

  const particles = [];
  const smoke = [];
  const flashes = [];
  const shocks = [];
  const fireballs = [];
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
    modeButtons.forEach((b) => {
      const on = b.dataset.mode === next;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    setStatus(LABELS[next] + " — click the stage, or press Ignite.");
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

  function firework(x, y, scale, type) {
    if (reduced) return;
    scale = scale || 1;
    type = type || pick(FIREWORK_TYPES);
    if (type === "double") {
      firework(x, y, scale * 0.72, "ring");
      firework(x, y, scale * 1.12, "ring");
      return;
    }

    const colors = pick(FIREWORK_SETS);
    let n = 150;
    let speed = 3.5;
    let life = 2.2;
    let gravity = 20;
    let drag = 0.986;
    let size = 1.6;

    if (type === "chrysanthemum") { n = 180; speed = 3.9; life = 2.4; gravity = 15; size = 1.5; }
    if (type === "willow") { n = 135; speed = 3.0; life = 3.0; gravity = 7; drag = 0.993; size = 1.35; }
    if (type === "ring") { n = 145; speed = 3.2; life = 2.15; gravity = 8; size = 1.5; }
    if (type === "crossette") { n = 68; speed = 3.8; life = 2.2; gravity = 18; size = 1.6; }
    if (type === "heart") { n = 120; speed = 3.2; life = 2.4; gravity = 9; size = 1.55; }

    for (let i = 0; i < n; i++) {
      let vx;
      let vy;
      if (type === "heart") {
        const [hx, hy] = heartPoint((i / n) * Math.PI * 2);
        vx = hx * 7.4 * scale;
        vy = hy * 7.4 * scale;
      } else if (type === "ring") {
        const a = (i / n) * Math.PI * 2;
        vx = Math.cos(a) * speed * scale;
        vy = Math.sin(a) * speed * scale * 0.64;
      } else {
        const a = rnd(0, Math.PI * 2);
        const s = rnd(0.28, 1) * speed * scale;
        vx = Math.cos(a) * s;
        vy = Math.sin(a) * s;
      }
      const color = colors[i % colors.length];
      const p = makeParticle(x, y, vx, vy, life * rnd(0.8, 1.15), color,
        size * rnd(0.65, 1.3), gravity * rnd(0.85, 1.15), drag, "spark");
      p.split = type === "crossette" && i % 2 === 0;
      addParticle(p);
    }

    flash(x, y, 1.15 * scale, colors[0]);

    if (type === "peony" || Math.random() < 0.22) {
      window.setTimeout(() => {
        firework(x + rnd(-55, 55), y + rnd(-35, 35), scale * 0.42, "ring");
      }, rnd(90, 180));
    }
  }

  function popCracker(x, y) {
    flash(x, y, 0.22, "#ffd60a");
    for (let i = 0; i < 14; i++) {
      const a = rnd(0, Math.PI * 2);
      const s = rnd(0.7, 4.2);
      addParticle(makeParticle(x, y, Math.cos(a) * s, Math.sin(a) * s,
        rnd(0.3, 0.7), pick(["#ff2d55", "#ffd60a", "#ffffff", "#ff9f0a"]),
        rnd(0.8, 1.7), 42, 0.976, "spark"));
    }
    for (let i = 0; i < 2; i++) {
      addSmoke(makeSmoke(x + rnd(-4, 4), y - 2, rnd(-4, 4), rnd(-10, -3),
        rnd(0.5, 0.9), rnd(6, 11)));
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
    if (strings.length > 2) strings.shift();
    const n = 18;
    const gap = Math.min(26, (W - 72) / n);
    const total = (n - 1) * gap;
    const start = clamp(x - total / 2, 24, W - 24 - total);
    const yy = clamp(y + 24, H * 0.55, H - 34);
    const items = [];
    for (let i = 0; i < n; i++) {
      items.push({ x: start + i * gap, y: yy, delay: i * 0.075, popped: false });
    }
    strings.push({ items, t: 0, done: false, color: "#ffd60a" });
    startLoop();
  }

  function drawString(s) {
    ctx.globalCompositeOperation = "source-over";
    const items = s.items;
    if (!items.length) return;
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = "rgba(255, 214, 10, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(items[0].x, items[0].y + 7);
    for (let i = 1; i < items.length; i++) {
      const a = items[i - 1];
      const b = items[i];
      ctx.quadraticCurveTo((a.x + b.x) / 2, a.y + 13, b.x, b.y + 7);
    }
    ctx.stroke();

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.popped) {
        ctx.globalAlpha = 0.32;
        ctx.fillStyle = "#2a1a12";
        ctx.fillRect(it.x - 3, it.y, 6, 3);
        continue;
      }
      const tilt = (i % 2 ? 1 : -1) * 0.16;
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(tilt);
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = "#b51f1a";
      ctx.fillRect(-3, -8, 6, 15);
      ctx.fillStyle = "#ffd60a";
      ctx.fillRect(-3, -8, 6, 3);
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillRect(-1, -7, 1, 11);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function bomb(x, y) {
    if (reduced) return;
    if (bombs.length > 2) bombs.shift();
    bombs.push({ x: clamp(x, 30, W - 30), y: clamp(y, 28, H - 28), t: 0, fuse: 0.62, boom: false });
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
    flash(b.x, b.y, 2.4, "#ffd60a");
    fireballs.push({ x: b.x, y: b.y, t: 0, life: 0.85, scale: 1 });
    shocks.push({ x: b.x, y: b.y, t: 0, life: 1.0, max: 210, color: "#ff9f0a" });
    shocks.push({ x: b.x, y: b.y, t: 0.08, life: 0.82, max: 145, color: "#ffffff" });

    for (let i = 0; i < 95; i++) {
      const a = rnd(0, Math.PI * 2);
      const s = rnd(2, 12);
      addParticle(makeParticle(b.x, b.y, Math.cos(a) * s, Math.sin(a) * s,
        rnd(0.45, 1.1), pick(["#ffd60a", "#ff9f0a", "#ff2d55", "#ffffff"]),
        rnd(1, 2.8), 34, 0.975, "spark"));
    }
    for (let i = 0; i < 22; i++) {
      const a = rnd(0, Math.PI * 2);
      const s = rnd(1.5, 6);
      addParticle(makeParticle(b.x, b.y, Math.cos(a) * s, Math.sin(a) * s,
        rnd(0.5, 1.0), pick(["#2b2b2b", "#3a2a1f", "#1a1a1a"]),
        rnd(1.2, 3.0), 46, 0.99, "debris"));
    }
    for (let i = 0; i < 32; i++) {
      addSmoke(makeSmoke(b.x + rnd(-18, 18), b.y + rnd(-10, 16),
        rnd(-18, 18), rnd(-24, -4), rnd(1.2, 2.4), rnd(14, 30)));
    }

    stage.classList.remove("is-shaking");
    void stage.offsetWidth;
    stage.classList.add("is-shaking");
    window.clearTimeout(shakeTimer);
    shakeTimer = window.setTimeout(() => stage.classList.remove("is-shaking"), 430);
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

  function active() {
    return particles.length || smoke.length || flashes.length || shocks.length ||
      fireballs.length || strings.length || bombs.length;
  }

  function tick(now) {
    if (document.hidden) {
      running = false;
      return;
    }
    const dt = Math.min(0.045, (now - last) / 1000 || 0.016);
    last = now;

    ctx.clearRect(0, 0, W, H);

    // strings and bombs are solid props
    for (let i = strings.length - 1; i >= 0; i--) {
      const s = strings[i];
      s.t += dt;
      for (const it of s.items) {
        if (!it.popped && s.t >= it.delay) {
          it.popped = true;
          popCracker(it.x, it.y);
        }
      }
      if (s.items.every((it) => it.popped) && s.t > s.items[s.items.length - 1].delay + 0.3) {
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
      } else {
        drawBomb(b);
      }
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
      const r = safe(18 + 105 * Math.sqrt(k));
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
      if (p.history.length > 4) p.history.shift();
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

      if (p.kind === "debris") {
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = alpha * 0.9;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size);
        ctx.globalCompositeOperation = "lighter";
        continue;
      }

      ctx.globalAlpha = alpha * 0.12;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, width * 2.3, 0, Math.PI * 2);
      ctx.fill();

      for (let j = 1; j < h.length; j++) {
        const t = j / h.length;
        ctx.globalAlpha = alpha * (0.12 + 0.75 * t);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(0.4, width * (0.22 + 0.7 * t));
        ctx.beginPath();
        ctx.moveTo(h[j - 1][0], h[j - 1][1]);
        ctx.lineTo(h[j][0], h[j][1]);
        ctx.stroke();
      }
      if (h.length) {
        ctx.globalAlpha = alpha * 0.75;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(0.45, width * 0.6);
        ctx.beginPath();
        ctx.moveTo(h[h.length - 1][0], h[h.length - 1][1]);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }

      if (p.size > 1.0) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1, p.size * 0.65), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.4, p.size * 0.25), 0, Math.PI * 2);
        ctx.fill();
      }
    }

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
      firework(x, y, 1.1);
      window.setTimeout(() => {
        firework(x + rnd(-120, 120), y + rnd(-58, 52), rnd(0.52, 0.72));
      }, rnd(90, 150));
      window.setTimeout(() => {
        firework(x + rnd(-135, 135), y + rnd(-62, 55), rnd(0.45, 0.62));
      }, rnd(210, 300));
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
    strings.length = 0;
    bombs.length = 0;
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
    const rect = canvas.getBoundingClientRect();
    ignite(event.clientX - rect.left, event.clientY - rect.top);
  });

  canvas.addEventListener("keydown", (event) => {
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
