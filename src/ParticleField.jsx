import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

/*
 * ParticleField: a calm field of soft, colorful glowing "bokeh" particles
 * drifting on a light background (inspired by the hero-loop reference).
 *
 * It's a plain 2D <canvas> system — no WebGL, no libraries — so it's light and
 * fully client-side. Interactions:
 *   - Cursor repel: particles flow away from the pointer.
 *   - Click burst: a colorful burst of short-lived particles spawns on click.
 *   - Camera push: the parent can feed normalized hand points via the ref to
 *     push particles around (used by the hand-tracking mode).
 */

// Color palettes. Each is a list of hues (0..1) we pick from when spawning.
export const PALETTES = {
  rainbow: { label: 'Rainbow', hues: [0.0, 0.08, 0.15, 0.33, 0.5, 0.6, 0.75, 0.9] },
  sunset: { label: 'Sunset', hues: [0.0, 0.03, 0.07, 0.1, 0.92, 0.85] },
  ocean: { label: 'Ocean', hues: [0.5, 0.55, 0.6, 0.45, 0.48] },
  candy: { label: 'Candy', hues: [0.9, 0.83, 0.95, 0.75, 0.6] },
};

const BG = { light: '#f3f4f6', dark: '#0a0b0f' };

// HSV (0..1) -> {r,g,b} 0..255.
function hsv(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r, g, b;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q; break;
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

const TYPES = ['dot', 'sun', 'blob', 'ring'];

const ParticleField = forwardRef(function ParticleField(
  { count = 220, speed = 1, glow = 1, palette = 'rainbow', background = 'light' },
  ref,
) {
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const burstsRef = useRef([]); // short-lived click/burst particles
  const pointersRef = useRef({ mouse: null, hands: [] }); // repel sources (px)
  const rafRef = useRef(0);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  // Live props read inside the animation loop without restarting it.
  const cfgRef = useRef({ speed, glow, background });
  cfgRef.current = { speed, glow, background };

  // Convert a normalized point (0..1, already mirrored/oriented by caller) to
  // canvas pixels.
  function toPx(nx, ny) {
    const { w, h } = sizeRef.current;
    return { x: nx * w, y: ny * h };
  }

  useImperativeHandle(ref, () => ({
    // Feed hand points (normalized, top-left origin) to push particles.
    setHandPoints(points) {
      pointersRef.current.hands = (points || []).map((p) => toPx(p.x, p.y));
    },
    // Spawn a burst at a normalized point (used by camera pinch, optional).
    burst(nx, ny) {
      const { x, y } = toPx(nx, ny);
      spawnBurst(x, y);
    },
  }));

  function makeParticle(w, h, randomY = true) {
    const hues = PALETTES[palette]?.hues ?? PALETTES.rainbow.hues;
    const hue = hues[Math.floor(Math.random() * hues.length)] + (Math.random() - 0.5) * 0.04;
    const type = TYPES[Math.floor(Math.random() * TYPES.length)];
    const isSun = type === 'sun';
    const baseR = isSun ? 3 + Math.random() * 4 : 6 + Math.random() * 26;
    return {
      x: Math.random() * w,
      y: randomY ? Math.random() * h : Math.random() * h,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: baseR,
      type,
      color: hsv(((hue % 1) + 1) % 1, isSun ? 0.95 : 0.55, isSun ? 1 : 0.95),
      alpha: isSun ? 0.9 : 0.28 + Math.random() * 0.3,
      wob: Math.random() * Math.PI * 2, // wobble phase
      wobSpeed: 0.005 + Math.random() * 0.02,
    };
  }

  function spawnBurst(x, y) {
    const hues = PALETTES[palette]?.hues ?? PALETTES.rainbow.hues;
    const n = 18 + Math.floor(Math.random() * 12);
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 4.5;
      const hue = hues[Math.floor(Math.random() * hues.length)];
      burstsRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * sp,
        vy: Math.sin(angle) * sp,
        r: 3 + Math.random() * 8,
        color: hsv(hue, 0.9, 1),
        life: 1, // 1 -> 0
        decay: 0.012 + Math.random() * 0.02,
      });
    }
  }

  // (Re)create the particle set when count/palette change.
  useEffect(() => {
    const { w, h } = sizeRef.current;
    if (!w) return;
    const arr = [];
    for (let i = 0; i < count; i++) arr.push(makeParticle(w, h));
    particlesRef.current = arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, palette]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w, h, dpr };
      if (particlesRef.current.length === 0) {
        const arr = [];
        for (let i = 0; i < count; i++) arr.push(makeParticle(w, h));
        particlesRef.current = arr;
      }
    }
    resize();
    window.addEventListener('resize', resize);

    const onMove = (e) => {
      pointersRef.current.mouse = { x: e.clientX, y: e.clientY };
    };
    const onLeave = () => {
      pointersRef.current.mouse = null;
    };
    const onDown = (e) => spawnBurst(e.clientX, e.clientY);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('mousedown', onDown);

    const REPEL_RADIUS = 160;

    function drawGlow(p, alpha) {
      const { r, g, b } = p.color;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    function frame() {
      const { w, h } = sizeRef.current;
      const { speed: sp, glow: gl, background: bg } = cfgRef.current;

      // Soft fade fill leaves gentle motion-blur streaks (matches the look).
      ctx.globalCompositeOperation = 'source-over';
      const fade = bg === 'light' ? 'rgba(243,244,246,0.22)' : 'rgba(10,11,15,0.22)';
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, w, h);

      const pointers = [];
      if (pointersRef.current.mouse) pointers.push(pointersRef.current.mouse);
      for (const hp of pointersRef.current.hands) pointers.push(hp);

      for (const p of particlesRef.current) {
        // Drift + gentle wobble.
        p.wob += p.wobSpeed;
        p.x += (p.vx + Math.cos(p.wob) * 0.15) * sp;
        p.y += (p.vy + Math.sin(p.wob) * 0.15) * sp;

        // Repel from each pointer (cursor / hand).
        for (const ptr of pointers) {
          const dx = p.x - ptr.x;
          const dy = p.y - ptr.y;
          const dist = Math.hypot(dx, dy);
          if (dist < REPEL_RADIUS && dist > 0.01) {
            const force = (1 - dist / REPEL_RADIUS) * 1.6;
            p.x += (dx / dist) * force * 4;
            p.y += (dy / dist) * force * 4;
          }
        }

        // Wrap around edges.
        const m = p.r + 4;
        if (p.x < -m) p.x = w + m;
        else if (p.x > w + m) p.x = -m;
        if (p.y < -m) p.y = h + m;
        else if (p.y > h + m) p.y = -m;

        // Draw by type.
        const a = Math.min(1, p.alpha * gl);
        if (p.type === 'ring') {
          const { r, g, b } = p.color;
          ctx.strokeStyle = `rgba(${r},${g},${b},${a})`;
          ctx.lineWidth = Math.max(1, p.r * 0.12);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * 0.7, 0, Math.PI * 2);
          ctx.stroke();
        } else if (p.type === 'sun') {
          drawGlow({ ...p, r: p.r * 5 }, a * 0.5); // halo
          const { r, g, b } = p.color;
          ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        } else {
          drawGlow(p, a);
        }
      }

      // Burst particles (short-lived).
      const bursts = burstsRef.current;
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        b.x += b.vx * sp;
        b.y += b.vy * sp;
        b.vx *= 0.96;
        b.vy *= 0.96;
        b.life -= b.decay;
        if (b.life <= 0) {
          bursts.splice(i, 1);
          continue;
        }
        const col = b.color;
        const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        grad.addColorStop(0, `rgba(${col.r},${col.g},${col.b},${b.life * gl})`);
        grad.addColorStop(1, `rgba(${col.r},${col.g},${col.b},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(frame);
    }
    frame();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
      canvas.removeEventListener('mousedown', onDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="particle-canvas"
      style={{ background: BG[background] ?? BG.light }}
    />
  );
});

export default ParticleField;
