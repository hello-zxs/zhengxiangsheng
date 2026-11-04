/* zhengxiangsheng.com — a small, hand-built fireworks layer.
   Click or tap anywhere. No dependencies, no audio, respects reduced motion. */
(() => {
  "use strict";

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const canvas = document.createElement("canvas");
  canvas.className = "fireworks-canvas";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:400;";
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  let W = 0;
  let H = 0;
  let dpr = 1;
  let running = false;
  let last = 0;

  const COLOR_SETS = [
    ["#ff2d55", "#ffd60a", "#00e5ff"],
    ["#ff9f0a", "#ff375f", "#bf5af2"],
    ["#30d158", "#64d2ff", "#ffd60a"],
    ["#0a84ff", "#bf5af2", "#ff2d55"],
    ["#ffffff", "#ffd60a", "#ff9f0a"],
    ["#64d2ff", "#ffffff", "#0a84ff"]
  ];
  const TYPES = [
    "peony", "chrysanthemum", "willow", "ring", "rainbow",
    "double", "crossette", "palm", "glitter", "heart"
  ];
  const MAX = 3400;
  const particles = [];
  const shocks = [];
  const flashes = [];

  const rnd = (a, b) => a + Math.random() * (b - a);
  const safeRadius = (r) => (Number.isFinite(r) && r > 0.1 ? r : 0.1);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const colorsFor = () => {
    const set = pick(COLOR_SETS).slice();
    return set;
  };

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function add(p) {
    if (particles.length >= MAX) particles.shift();
    particles.push(p);
  }

  function flash(x, y, scale, color) {
    flashes.push({ x, y, t: 0, life: 0.5, scale, color });
    shocks.push({
      x, y, t: 0, life: 0.8,
      max: 125 * scale, color
    });
  }

  function heartPoint(t) {
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    return [x / 18, y / 18];
  }

  function shell(x, y, type, scale) {
    scale = scale || 1;
    const cols = colorsFor();
    const base = cols[0];
    const accent = cols[1];
    let n = 168;
    let speed = 3.8;
    let life = 2.0;
    let gravity = 28;
    let drag = 0.986;
    let size = 1.55;
    let trail = 0.7;

    if (type === "chrysanthemum") { n = 196; speed = 4.2; life = 2.3; gravity = 21; trail = 1.0; size = 1.5; }
    if (type === "willow") { n = 140; speed = 3.1; life = 3.0; gravity = 9; drag = 0.992; trail = 1.5; size = 1.35; }
    if (type === "ring") { n = 150; speed = 3.4; life = 1.9; gravity = 12; trail = 0.8; size = 1.45; }
    if (type === "double") { shell(x, y, "ring", scale * 0.72); shell(x, y, "ring", scale * 1.2); return; }
    if (type === "crossette") { n = 80; speed = 4.0; life = 2.0; gravity = 24; trail = 0.75; size = 1.55; }
    if (type === "palm") { n = 44; speed = 3.7; life = 2.8; gravity = 10; drag = 0.992; trail = 1.9; size = 3.0; }
    if (type === "glitter") { n = 190; speed = 2.2; life = 1.35; gravity = 32; drag = 0.978; trail = 0.35; size = 0.95; }
    if (type === "heart") { n = 125; speed = 3.2; life = 2.25; gravity = 14; trail = 0.9; size = 1.55; }
    if (type === "rainbow") { n = 190; speed = 3.9; life = 2.15; gravity = 22; trail = 0.8; size = 1.5; }

    for (let i = 0; i < n; i++) {
      let vx, vy;
      if (type === "heart") {
        const [hx, hy] = heartPoint((i / n) * Math.PI * 2);
        vx = hx * 6.2 * scale;
        vy = hy * 6.2 * scale;
      } else if (type === "ring") {
        const a = (i / n) * Math.PI * 2;
        vx = Math.cos(a) * speed * scale;
        vy = Math.sin(a) * speed * scale * 0.62;
      } else if (type === "glitter") {
        const a = rnd(0, Math.PI * 2);
        const s = rnd(0.2, speed) * scale;
        vx = Math.cos(a) * s;
        vy = Math.sin(a) * s;
      } else {
        const a = rnd(0, Math.PI * 2);
        const s = rnd(0.35, 1) * speed * scale;
        vx = Math.cos(a) * s;
        vy = Math.sin(a) * s;
      }

      const c = type === "rainbow" ? cols[i % cols.length]
        : (Math.random() < 0.7 ? cols[0] : cols[1]);
      const p = {
        x, y, px: x, py: y, vx, vy,
        life: life * rnd(0.78, 1.12),
        maxLife: life,
        gravity: gravity * rnd(0.85, 1.15),
        drag,
        size: size * rnd(0.65, 1.35),
        color: c,
        trail,
        history: [],
        flicker: Math.random() < 0.12,
        split: type === "crossette" && i % 2 === 0,
        didSplit: false
      };
      add(p);
    }

    flash(x, y, scale, base);

    if (type === "crossette") {
      // The split particles burst into tiny secondary stars in update().
    }
  }

  function spawn(x, y) {
    const type = pick(TYPES);
    shell(x, y, type, rnd(1.05, 1.25));
    window.setTimeout(() => {
      shell(x - rnd(70, 150), y + rnd(-55, 55), pick(TYPES), rnd(0.58, 0.78));
    }, rnd(55, 100));
    window.setTimeout(() => {
      shell(x + rnd(70, 150), y + rnd(-55, 55), pick(TYPES), rnd(0.58, 0.78));
    }, rnd(130, 200));
    if (!running) {
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    }
  }

  function split(p) {
    const cols = [p.color, ...pick(COLOR_SETS), "#ffffff"];
    for (let i = 0; i < 3; i++) {
      const a = rnd(0, Math.PI * 2);
      const s = rnd(0.35, 1.1);
      add({
        x: p.x, y: p.y, px: p.x, py: p.y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rnd(0.35, 0.7), maxLife: 0.7,
        gravity: 26, drag: 0.97, size: 0.75,
        color: pick(cols), trail: 0.25,
        flicker: true, split: false, didSplit: true
      });
    }
  }

  function frame(now) {
    if (document.hidden) {
      running = false;
      return;
    }
    const dt = Math.min(0.04, (now - last) / 1000 || 0.016);
    last = now;

    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
    ctx.lineCap = "round";

    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) { flashes.splice(i, 1); continue; }
      const r = safeRadius((26 + 90 * k) * f.scale);
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      g.addColorStop(0, f.color);
      g.addColorStop(0.25, "rgba(255,255,255,0.85)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.globalAlpha = (1 - k) * 0.55;
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
      ctx.globalAlpha = (1 - k) * 0.16;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, safeRadius(s.max * k), 0, Math.PI * 2);
      ctx.stroke();
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }

      p.px = p.x;
      p.py = p.y;
      p.history.push([p.x, p.y]);
      if (p.history.length > 4) p.history.shift();
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy *= Math.pow(p.drag, dt * 60);
      p.vy += p.gravity * dt;
      p.x += p.vx;
      p.y += p.vy;

      if (p.split && !p.didSplit && p.life < p.maxLife * 0.58) {
        p.didSplit = true;
        split(p);
      }

      const lifeK = Math.max(0, p.life / p.maxLife);
      const alpha = Math.min(1, 0.42 + lifeK * 0.78) * (p.flicker && Math.random() < 0.18 ? 0.25 : 1);
      const width = Math.max(0.7, p.size * (0.5 + 0.9 * lifeK));

      ctx.globalAlpha = alpha * 0.1;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, width * 2.2, 0, Math.PI * 2);
      ctx.fill();

      const h = p.history;
      for (let k = 1; k < h.length; k++) {
        const t = k / h.length;
        ctx.globalAlpha = alpha * (0.12 + 0.8 * t);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(0.45, width * (0.25 + 0.75 * t));
        ctx.beginPath();
        ctx.moveTo(h[k - 1][0], h[k - 1][1]);
        ctx.lineTo(h[k][0], h[k][1]);
        ctx.stroke();
      }
      if (h.length) {
        ctx.globalAlpha = alpha * 0.8;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(0.5, width * 0.7);
        ctx.beginPath();
        ctx.moveTo(h[h.length - 1][0], h[h.length - 1][1]);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }

      if (p.size > 0.9) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1.1, p.size * 0.8), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.4, p.size * 0.3), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    if (particles.length || shocks.length || flashes.length) {
      requestAnimationFrame(frame);
    } else {
      running = false;
      ctx.clearRect(0, 0, W, H);
    }
  }

  window.addEventListener("resize", resize);
  document.addEventListener("click", (event) => {
    if (event.button !== 0) return;
    if (event.detail === 0 && event.clientX === 0 && event.clientY === 0) return;
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("input, textarea, select")) return;
    if (typeof event.clientX !== "number") return;
    spawn(event.clientX, event.clientY);
  });

  resize();
})();
