import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import initFluidSimulation from './fluidSimulation';

// How bright the chosen ink is. The engine adds color straight onto the dye,
// so we keep this low for soft, watery trails (bombs boost their own glow).
const COLOR_SCALE = 0.13;

// Brush sizes 1..5 mapped to the engine's splat radius (small -> large).
export const BRUSH_RADII = {
  1: 0.08,
  2: 0.15,
  3: 0.25,
  4: 0.4,
  5: 0.6,
};

// "Mood" presets: each swaps several live-tunable simulation values at once to
// give the liquid a different personality. All of these fields are read by the
// engine every frame, so switching mood takes effect instantly.
export const MOODS = {
  // Water: the balanced default.
  water: {
    label: 'Water',
    params: { CURL: 30, VELOCITY_DISSIPATION: 0.2, DENSITY_DISSIPATION: 1.6, PRESSURE: 0.8, BLOOM_INTENSITY: 0.7, SUNRAYS_WEIGHT: 1.0, SPLAT_FORCE: 6000 },
  },
  // Smoke: very swirly, almost frictionless (keeps drifting), slow color fade
  // and extra glow -> ethereal, wispy, never settles.
  smoke: {
    label: 'Smoke',
    params: { CURL: 60, VELOCITY_DISSIPATION: 0.02, DENSITY_DISSIPATION: 0.4, PRESSURE: 0.6, BLOOM_INTENSITY: 0.9, SUNRAYS_WEIGHT: 1.4, SPLAT_FORCE: 4800 },
  },
  // Paint: almost no swirl, very high friction (motion stops instantly), rich
  // long-lasting color and a matte look -> thick blobs that smear and stay put.
  paint: {
    label: 'Paint',
    params: { CURL: 1, VELOCITY_DISSIPATION: 3.5, DENSITY_DISSIPATION: 0.35, PRESSURE: 1.0, BLOOM_INTENSITY: 0.2, SUNRAYS_WEIGHT: 0.3, SPLAT_FORCE: 9500 },
  },
  // Neon: energetic with bright bloom + rays for a luminous, glowing look.
  neon: {
    label: 'Neon',
    params: { CURL: 35, VELOCITY_DISSIPATION: 0.15, DENSITY_DISSIPATION: 1.2, PRESSURE: 0.8, BLOOM_INTENSITY: 1.5, SUNRAYS_WEIGHT: 1.7, SPLAT_FORCE: 6500 },
  },
};

// "#aabbcc" -> { r, g, b } in 0..1, then scaled down for the watery look.
export function hexToFluidColor(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return { r: r * COLOR_SCALE, g: g * COLOR_SCALE, b: b * COLOR_SCALE };
}

// The default starting parameters (same as the Water mood).
export const DEFAULT_PARAMS = MOODS.water.params;

const FluidBackground = forwardRef(function FluidBackground(
  {
    color,
    brushSize = 3,
    params = DEFAULT_PARAMS,
    bloom = true,
    sunrays = false,
    shading = true,
  },
  ref,
) {
  const canvasRef = useRef(null);
  const controllerRef = useRef(null);

  // Let the parent drive the fluid: trigger a bomb or inject splats (used by
  // the audio-reactive mode).
  useImperativeHandle(ref, () => ({
    bomb: (fx, fy) => controllerRef.current?.bomb(fx, fy),
    addSplat: (x, y, dx, dy, opts) =>
      controllerRef.current?.addSplat(x, y, dx, dy, opts),
    setBackColor: (rgb) => controllerRef.current?.setBackColor(rgb),
    setParams: (p) => controllerRef.current?.setParams(p),
  }));

  // Start the simulation once, when the canvas mounts.
  useEffect(() => {
    const controller = initFluidSimulation(canvasRef.current, {
      SPLAT_COLOR: color ? hexToFluidColor(color) : null,
      SPLAT_RADIUS: BRUSH_RADII[brushSize] ?? BRUSH_RADII[3],
      BLOOM: bloom,
      SUNRAYS: sunrays,
      SHADING: shading,
      ...params,
    });
    controllerRef.current = controller;
    return () => controller.destroy();
  }, []);

  // Apply the live-tunable parameters (from moods or the advanced sliders)
  // whenever they change. These are read by the engine every frame.
  useEffect(() => {
    controllerRef.current?.setParams(params);
  }, [params]);

  // Toggle the post-processing effects (recompiles the display shader).
  useEffect(() => {
    controllerRef.current?.setEffects({
      BLOOM: bloom,
      SUNRAYS: sunrays,
      SHADING: shading,
    });
  }, [bloom, sunrays, shading]);

  // Whenever the chosen color changes, update the running simulation live.
  useEffect(() => {
    if (!controllerRef.current) return;
    controllerRef.current.setSplatColor(color ? hexToFluidColor(color) : null);
  }, [color]);

  // Whenever the brush size changes, update the running simulation live.
  useEffect(() => {
    if (!controllerRef.current) return;
    controllerRef.current.setSplatRadius(BRUSH_RADII[brushSize] ?? BRUSH_RADII[3]);
  }, [brushSize]);

  return <canvas ref={canvasRef} className="fluid-canvas" />;
});

export default FluidBackground;
