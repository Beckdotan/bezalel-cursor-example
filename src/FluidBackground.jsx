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
  smoke: {
    label: 'Smoke',
    params: { CURL: 45, VELOCITY_DISSIPATION: 0.05, DENSITY_DISSIPATION: 0.7, PRESSURE: 0.8, BLOOM_INTENSITY: 0.6, SUNRAYS_WEIGHT: 1.0, SPLAT_FORCE: 6000 },
  },
  paint: {
    label: 'Paint',
    params: { CURL: 12, VELOCITY_DISSIPATION: 1.4, DENSITY_DISSIPATION: 0.6, PRESSURE: 1.0, BLOOM_INTENSITY: 0.5, SUNRAYS_WEIGHT: 0.6, SPLAT_FORCE: 7000 },
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

const FluidBackground = forwardRef(function FluidBackground(
  { color, brushSize = 3, mood = 'water' },
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
    setParams: (params) => controllerRef.current?.setParams(params),
  }));

  // Start the simulation once, when the canvas mounts.
  useEffect(() => {
    const controller = initFluidSimulation(canvasRef.current, {
      SPLAT_COLOR: color ? hexToFluidColor(color) : null,
      SPLAT_RADIUS: BRUSH_RADII[brushSize] ?? BRUSH_RADII[3],
      ...(MOODS[mood]?.params ?? {}),
    });
    controllerRef.current = controller;
    return () => controller.destroy();
  }, []);

  // Apply the selected mood (a bundle of simulation values) whenever it changes.
  useEffect(() => {
    const params = MOODS[mood]?.params;
    if (controllerRef.current && params) {
      controllerRef.current.setParams(params);
    }
  }, [mood]);

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
