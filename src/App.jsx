import { useEffect, useRef, useState } from 'react';
import FluidBackground, { MOODS, DEFAULT_PARAMS } from './FluidBackground';
import ParticleField, { PALETTES } from './ParticleField';
import ScrollHero from './ScrollHero';
import { createAudioEngine } from './audioEngine';
import { createHandTracker } from './handTracker';
import './App.css';

const PALETTE_LIST = ['rainbow', 'sunset', 'ocean', 'candy'];

// Order the mood buttons appear in the panel.
const MOOD_LIST = ['water', 'smoke', 'paint', 'neon'];

// Advanced sliders: every live-tunable physics value, with a designer-friendly
// label, the underlying engine key, a range and a step. `decimals` controls how
// the current value is displayed.
const SLIDERS = [
  { key: 'CURL', label: 'Swirl (curl)', min: 0, max: 80, step: 1, decimals: 0 },
  { key: 'SPLAT_FORCE', label: 'Push strength', min: 1000, max: 12000, step: 100, decimals: 0 },
  { key: 'VELOCITY_DISSIPATION', label: 'Friction (motion fade)', min: 0, max: 4, step: 0.05, decimals: 2 },
  { key: 'DENSITY_DISSIPATION', label: 'Ink fade', min: 0, max: 4, step: 0.05, decimals: 2 },
  { key: 'PRESSURE', label: 'Pressure', min: 0, max: 1.2, step: 0.05, decimals: 2 },
  { key: 'BLOOM_INTENSITY', label: 'Bloom strength', min: 0, max: 2, step: 0.05, decimals: 2 },
  { key: 'SUNRAYS_WEIGHT', label: 'Rays strength', min: 0, max: 2, step: 0.05, decimals: 2 },
];

// Color presets. `key` is the keyboard shortcut; `color` is a hex string
// (or null for rainbow / auto-cycling mode).
const PRESETS = [
  { id: 'rainbow', label: 'Rainbow', key: null, color: null, swatch: 'conic-gradient(#ff0080,#ffcc00,#33ff99,#00ccff,#cc66ff,#ff0080)' },
  { id: 'red', label: 'Red', key: 'r', color: '#ff2b2b', swatch: '#ff2b2b' },
  { id: 'green', label: 'Green', key: 'g', color: '#39ff7a', swatch: '#39ff7a' },
  { id: 'blue', label: 'Blue', key: 'b', color: '#2b6dff', swatch: '#2b6dff' },
  { id: 'orange', label: 'Orange', key: 'o', color: '#ffa92b', swatch: '#ffa92b' },
  { id: 'purple', label: 'Purple', key: 'p', color: '#8b5cff', swatch: '#8b5cff' },
  { id: 'pink', label: 'Pink', key: 'k', color: '#ff5cc8', swatch: '#ff5cc8' },
];

// Build a quick lookup of keyboard letter -> hex color (or null for rainbow).
const KEY_TO_COLOR = PRESETS.reduce((acc, p) => {
  if (p.key) acc[p.key] = p.color;
  return acc;
}, {});

const BRUSH_SIZES = [1, 2, 3, 4, 5];

// How the music moves the liquid.
const LAYOUTS = [
  { id: 'bars', label: 'Bars' },
  { id: 'radial', label: 'Radial' },
  { id: 'scatter', label: 'Scatter' },
  { id: 'mirror', label: 'Mirror' },
];

// How hard audio energy pushes the liquid.
const AUDIO_FORCE = 5600;

// How hard a moving fingertip pushes the liquid. The fluid engine multiplies a
// per-frame normalized delta by its own SPLAT_FORCE (6000) for the mouse, so we
// use a similar scale here for a matching feel.
const HAND_FORCE = 6000;

// Below this per-frame movement we don't paint (keeps a still hand from
// flooding the surface with ink — same idea as the mouse only painting when it
// moves).
const HAND_MOVE_THRESHOLD = 0.0025;

// The two Hero Section variants. Each is a self-contained config handed to the
// reusable <ScrollHero> component: which video to scrub, whether it plays
// forward or in reverse, the scroll hint, and the headline "scenes" (each tied
// to a 0..1 slice of the scroll timeline). To tweak copy, edit `scenes` here.
const HERO_VARIANTS = {
  paper: {
    label: 'Paper Art',
    videoFile: 'origami-portrait.mp4',
    reverse: true, // opens on the folded sculpture, rewinds to the portrait
    hint: 'Scroll to unfold',
    scenes: [
      {
        start: 0.0,
        end: 0.24,
        eyebrow: 'Paper art studio',
        title: 'FOLD',
        sub: 'Sculpture from a single sheet.',
      },
      {
        start: 0.2,
        end: 0.46,
        eyebrow: 'The craft',
        title: 'Every crease\ntells a story.',
        sub: 'Hand-folded, never cut. One continuous gesture of paper.',
      },
      {
        start: 0.42,
        end: 0.68,
        eyebrow: 'The form',
        title: 'A portrait,\nunfolding.',
        sub: 'Flat geometry becomes a living, three-dimensional face.',
      },
      {
        start: 0.66,
        end: 1.0,
        eyebrow: 'Commission',
        title: 'Made for\nyour space.',
        sub: 'Bespoke paper sculptures for homes, brands and galleries.',
        cta: 'Start a commission',
      },
    ],
  },
  construction: {
    label: 'City Renewal',
    videoFile: 'city-renewal.mp4',
    reverse: false, // plays forward: neglected site -> finished living space
    hint: 'Scroll to rebuild',
    loader: 'construction',
    loaderLabel: 'Breaking ground',
    scenes: [
      {
        start: 0.0,
        end: 0.24,
        eyebrow: 'Urban renewal',
        title: 'RENEW',
        sub: 'We see homes where the city sees waste.',
      },
      {
        start: 0.2,
        end: 0.46,
        eyebrow: 'The site',
        title: 'From the\nforgotten.',
        sub: 'Vacant lots and derelict corners, hiding in plain sight.',
      },
      {
        start: 0.42,
        end: 0.68,
        eyebrow: 'The build',
        title: 'Rebuilt from\nthe ground up.',
        sub: 'Foundations, structure and life — rising in time-lapse.',
      },
      {
        start: 0.66,
        end: 1.0,
        eyebrow: 'The result',
        title: 'Places to\ncall home.',
        sub: 'Vibrant living spaces, reclaimed for the people of the city.',
        cta: 'Explore our projects',
      },
    ],
  },
  coach: {
    label: 'Personal Coach',
    videoFile: 'out-of-shell.mp4',
    reverse: false, // plays forward: curled in a shell -> speaking out loud
    hint: 'Scroll to emerge',
    loader: 'shell',
    loaderLabel: 'Finding your voice',
    scenes: [
      {
        start: 0.0,
        end: 0.24,
        eyebrow: 'Personal coaching',
        title: 'EMERGE',
        sub: 'Step out of your shell — and into the room.',
      },
      {
        start: 0.2,
        end: 0.46,
        eyebrow: 'The comfort zone',
        title: 'It starts\ninside.',
        sub: 'Where it feels safe, small, and easy to stay unseen.',
      },
      {
        start: 0.42,
        end: 0.68,
        eyebrow: 'The breakthrough',
        title: 'Break\nthrough.',
        sub: 'One coached step at a time, you find your edge.',
      },
      {
        start: 0.66,
        end: 1.0,
        eyebrow: 'The stage',
        title: 'Speak with\nconfidence.',
        sub: 'From hiding away to holding the room.',
        cta: 'Book a session',
      },
    ],
  },
};

const HERO_VARIANT_LIST = ['paper', 'construction', 'coach'];

// Tiny HSV->RGB (0..1) helper for the background mood tint.
function hsvToRgb01(h, s, v) {
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
  return { r, g, b };
}

export default function App() {
  // Top-level mode: 'studio' is everything we built (Liquid + Particles), and
  // 'hero' is the scroll-driven Hero Sections experience. Hero Sections is the
  // default landing experience.
  const [mode, setMode] = useState('hero');
  // Which Hero Section variant is showing ('paper' | 'construction').
  const [heroVariant, setHeroVariant] = useState('paper');

  // `color` is either a hex string or null (rainbow mode).
  // Which experience is showing: the fluid 'liquid' or the 'particles' field.
  const [view, setView] = useState('particles');

  const [color, setColor] = useState('#19e3ff');
  const [brushSize, setBrushSize] = useState(3);

  // Particles-tab settings.
  const [pPalette, setPPalette] = useState('rainbow');
  const [pCount, setPCount] = useState(220);
  const [pSpeed, setPSpeed] = useState(1);
  const [pGlow, setPGlow] = useState(1);
  const [pCameraOn, setPCameraOn] = useState(false);
  const [pCameraLoading, setPCameraLoading] = useState(false);
  const [pCameraError, setPCameraError] = useState(null);
  // `mood` is just which preset button is highlighted (null = custom, after the
  // user moves a slider). `params` are the actual values driving the fluid.
  const [mood, setMood] = useState('water');
  const [params, setParams] = useState({ ...DEFAULT_PARAMS });
  // Effect toggles (need a shader recompile, handled in FluidBackground).
  // Sunrays defaults OFF because its symmetric "god ray" streaks can show up as
  // a square on each side of bright moving spots.
  const [bloom, setBloom] = useState(true);
  const [sunrays, setSunrays] = useState(false);
  const [shading, setShading] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  // User-saved presets, persisted in the browser (localStorage).
  const [customMoods, setCustomMoods] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('customMoods') || '[]');
    } catch {
      return [];
    }
  });
  const [newMoodName, setNewMoodName] = useState('');

  // Keep saved presets persisted whenever the list changes.
  useEffect(() => {
    localStorage.setItem('customMoods', JSON.stringify(customMoods));
  }, [customMoods]);

  // Pick a built-in mood preset: highlight it and load its full set of values.
  function selectMood(id) {
    setMood(id);
    setParams({ ...MOODS[id].params });
  }

  // Move one advanced slider: update that single value and drop the mood
  // highlight (we're now in "custom" territory).
  function updateParam(key, value) {
    setParams((p) => ({ ...p, [key]: value }));
    setMood(null);
  }

  // Save the current look (slider values + effect toggles) as a named preset.
  function saveCustomMood() {
    const name = newMoodName.trim();
    if (!name) return;
    const id = `custom-${Date.now()}`;
    const entry = { id, label: name, params: { ...params }, bloom, sunrays, shading };
    setCustomMoods((list) => [...list, entry]);
    setMood(id);
    setNewMoodName('');
  }

  // Load a saved preset: restore both its values and its effect toggles.
  function selectCustomMood(entry) {
    setMood(entry.id);
    setParams({ ...entry.params });
    setBloom(entry.bloom);
    setSunrays(entry.sunrays);
    setShading(entry.shading);
  }

  function deleteCustomMood(id) {
    setCustomMoods((list) => list.filter((m) => m.id !== id));
    if (mood === id) setMood(null);
  }

  // Audio mode: 'off' | 'mic' | 'file'
  const [audioMode, setAudioMode] = useState('off');
  const [audioLayout, setAudioLayout] = useState('bars');
  const [audioError, setAudioError] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Camera (hand) control.
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  const fluidRef = useRef(null);
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const overlayRef = useRef(null);

  // Particles tab refs.
  const particleRef = useRef(null);
  const pVideoRef = useRef(null);
  const pOverlayRef = useRef(null);

  // Create the audio engine once.
  const audioEngineRef = useRef(null);
  if (!audioEngineRef.current) {
    audioEngineRef.current = createAudioEngine();
  }

  // Create the hand tracker once.
  const handTrackerRef = useRef(null);
  if (!handTrackerRef.current) {
    handTrackerRef.current = createHandTracker();
  }

  // Per-frame state kept without re-rendering.
  const beatRef = useRef({ avg: 0, cooldown: 0 });
  const bgRef = useRef({ r: 0, g: 0, b: 0 });
  // Per-hand smoothed position + pinch latch (so one pinch fires one bomb).
  const handStateRef = useRef([]);

  const pickerValue = color ?? '#19e3ff';
  const isRainbow = color === null;

  // Keyboard shortcuts: 1-5 change brush size, letters change the color.
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (k >= '1' && k <= '5') {
        setBrushSize(Number(k));
      } else if (k in KEY_TO_COLOR) {
        setColor(KEY_TO_COLOR[k]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Translate each audio frame into liquid motion. The chosen layout decides
  // WHERE the energy goes; louder sound makes bigger ripples; bass beats fire a
  // bomb; and the background slowly tints to the music's "mood".
  useEffect(() => {
    if (audioMode === 'off') return undefined;

    const engine = audioEngineRef.current;
    const bg = bgRef.current;

    const unsubscribe = engine.subscribe(({ spectrum, volume, bass, centroid }) => {
      const fluid = fluidRef.current;
      if (!fluid) return;

      const bands = spectrum.length;
      const sizeBoost = 0.4 + volume * 1.6; // louder => bigger ripples

      if (audioLayout === 'bars' || audioLayout === 'mirror') {
        for (let i = 0; i < bands; i++) {
          const e = spectrum[i];
          if (e < 0.16) continue;
          const dy = e * AUDIO_FORCE;
          const opts = {
            colorBoost: 0.7 + e * 2.4,
            radiusMul: (0.4 + e * 0.9) * sizeBoost,
            hue: i / bands,
          };
          if (audioLayout === 'bars') {
            const x = (i + 0.5) / bands;
            fluid.addSplat(x, 0.05, (Math.random() - 0.5) * 250, dy, opts);
          } else {
            const off = ((i + 0.5) / bands) * 0.5;
            fluid.addSplat(0.5 + off, 0.05, 0, dy, opts);
            fluid.addSplat(0.5 - off, 0.05, 0, dy, opts);
          }
        }
      } else if (audioLayout === 'radial') {
        for (let i = 0; i < bands; i++) {
          const e = spectrum[i];
          if (e < 0.16) continue;
          const angle = (i / bands) * Math.PI * 2;
          const radius = 0.04 + (i / bands) * 0.42;
          const x = 0.5 + Math.cos(angle) * radius;
          const y = 0.5 + Math.sin(angle) * radius;
          const force = e * AUDIO_FORCE * 0.5;
          fluid.addSplat(x, y, Math.cos(angle) * force, Math.sin(angle) * force, {
            colorBoost: 0.7 + e * 2.4,
            radiusMul: (0.4 + e * 0.9) * sizeBoost,
            hue: i / bands,
          });
        }
        if (bass > 0.3) {
          fluid.addSplat(0.5, 0.5, 0, 0, {
            colorBoost: bass * 6,
            radiusMul: (1 + bass * 3) * sizeBoost,
            hue: 0,
          });
        }
      } else if (audioLayout === 'scatter') {
        const count = Math.floor(volume * 14);
        for (let n = 0; n < count; n++) {
          const i = Math.floor(Math.random() * bands);
          const e = spectrum[i];
          if (e < 0.12) continue;
          const angle = Math.random() * Math.PI * 2;
          const force = e * AUDIO_FORCE * 0.4;
          fluid.addSplat(
            Math.random(),
            Math.random(),
            Math.cos(angle) * force,
            Math.sin(angle) * force,
            {
              colorBoost: 0.8 + e * 2.4,
              radiusMul: (0.5 + e) * sizeBoost,
              hue: i / bands,
            },
          );
        }
      }

      // Beat detection: a bass spike well above the running average -> bomb.
      const beat = beatRef.current;
      beat.avg = beat.avg * 0.92 + bass * 0.08;
      if (beat.cooldown > 0) beat.cooldown -= 1;
      if (bass > 0.5 && bass > beat.avg * 1.35 && beat.cooldown === 0) {
        if (audioLayout === 'radial') fluid.bomb(0.5, 0.5);
        else fluid.bomb(Math.random(), 0.3 + Math.random() * 0.45);
        beat.cooldown = 10;
      }

      // Background mood tint: hue follows whether the sound is bassy or bright,
      // brightness follows loudness. Heavily smoothed so it drifts gently.
      const target = hsvToRgb01(centroid, 0.7, Math.min(0.09, volume * 0.16));
      bg.r += (target.r - bg.r) * 0.04;
      bg.g += (target.g - bg.g) * 0.04;
      bg.b += (target.b - bg.b) * 0.04;
      fluid.setBackColor(bg);
    });

    return unsubscribe;
  }, [audioMode, audioLayout]);

  // Stop audio when the app unmounts.
  useEffect(() => {
    const engine = audioEngineRef.current;
    return () => engine.stop();
  }, []);

  // Translate each camera frame into liquid motion. Your index fingertip acts
  // like the cursor (a moving finger trails ink), and a pinch (thumb + index
  // together) drops a bomb. We also draw a small preview with a dot on each
  // tracked fingertip so you can see it working.
  useEffect(() => {
    if (!cameraOn) return undefined;

    const tracker = handTrackerRef.current;
    const states = handStateRef.current;

    const unsubscribe = tracker.subscribe(({ hands }) => {
      const fluid = fluidRef.current;
      const overlay = overlayRef.current;
      const ctx = overlay?.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, overlay.width, overlay.height);

      hands.forEach((hand, i) => {
        // Camera image -> fluid coordinates. We MIRROR x (so it feels like a
        // mirror: move your hand right, the ripple goes right) and FLIP y
        // (the fluid measures y from the bottom, the image from the top).
        const targetX = 1 - hand.x;
        const targetY = 1 - hand.y;

        const prev = states[i] || { x: targetX, y: targetY, latched: false };
        // Smooth the position a little to calm camera jitter.
        const sx = prev.x + (targetX - prev.x) * 0.5;
        const sy = prev.y + (targetY - prev.y) * 0.5;
        const vx = sx - prev.x;
        const vy = sy - prev.y;
        const speed = Math.hypot(vx, vy);

        if (fluid && speed > HAND_MOVE_THRESHOLD) {
          fluid.addSplat(sx, sy, vx * HAND_FORCE, vy * HAND_FORCE, {
            hue: sx, // only used when ink color is set to Rainbow
            colorBoost: 1 + Math.min(2.5, speed * 10),
            radiusMul: 0.7 + Math.min(2, speed * 8),
          });
        }

        // Pinch -> bomb, with hysteresis so one pinch = exactly one bomb.
        let latched = prev.latched;
        if (hand.pinchRatio < 0.42 && !latched) {
          fluid?.bomb(sx, sy);
          latched = true;
        } else if (hand.pinchRatio > 0.55) {
          latched = false;
        }

        states[i] = { x: sx, y: sy, latched };

        // Draw the preview marker (the preview video is mirrored in CSS, so we
        // mirror the dot's x to line it up with where your finger appears).
        if (ctx) {
          const px = (1 - hand.x) * overlay.width;
          const py = hand.y * overlay.height;
          ctx.beginPath();
          ctx.arc(px, py, hand.pinch ? 10 : 6, 0, Math.PI * 2);
          ctx.fillStyle = hand.pinch ? '#ff5cc8' : '#19e3ff';
          ctx.fill();
          if (hand.pinch) {
            ctx.beginPath();
            ctx.arc(px, py, 16, 0, Math.PI * 2);
            ctx.strokeStyle = '#ff5cc8';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
      });

      // Forget hands that are no longer visible.
      states.length = hands.length;
    });

    return unsubscribe;
  }, [cameraOn]);

  // Stop the camera when the app unmounts.
  useEffect(() => {
    const tracker = handTrackerRef.current;
    return () => tracker.stop();
  }, []);

  async function enableMic() {
    try {
      await audioEngineRef.current.useMic();
      setAudioMode('mic');
      setFileName(null);
      setIsPlaying(false);
      setAudioError(null);
    } catch (err) {
      console.error('Microphone error:', err);
      const name = err?.name;
      let message;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        message =
          'Microphone access was blocked. Click the mic/lock icon in the address bar and allow it, then try again.';
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        message = 'No microphone was found. Check that one is connected and enabled.';
      } else if (name === 'NotReadableError') {
        message = 'The microphone is in use by another app. Close it and try again.';
      } else {
        message = `Could not start the microphone (${name || 'unknown error'}).`;
      }
      setAudioError(message);
      setAudioMode('off');
    }
  }

  function pickFile() {
    fileInputRef.current?.click();
  }

  async function onFileChosen(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await audioEngineRef.current.useFile(file);
      setFileName(file.name);
      setIsPlaying(true);
      setAudioMode('file');
      setAudioError(null);
    } catch {
      setAudioError('Sorry, that audio file could not be played.');
    }
    e.target.value = ''; // allow choosing the same file again later
  }

  function togglePlay() {
    const engine = audioEngineRef.current;
    if (isPlaying) {
      engine.pause();
      setIsPlaying(false);
    } else {
      engine.play();
      setIsPlaying(true);
    }
  }

  function disableAudio() {
    audioEngineRef.current.stop();
    setAudioMode('off');
    setIsPlaying(false);
    setFileName(null);
    setAudioError(null);
    // Fade the background back to black.
    bgRef.current = { r: 0, g: 0, b: 0 };
    fluidRef.current?.setBackColor(bgRef.current);
  }

  async function enableCamera() {
    setCameraError(null);
    setCameraLoading(true);
    try {
      await handTrackerRef.current.start(videoRef.current);
      handStateRef.current = [];
      setCameraOn(true);
    } catch (err) {
      // Distinguish a blocked camera from a model/network load failure.
      const denied = err?.name === 'NotAllowedError';
      setCameraError(
        denied
          ? 'Camera access was blocked. Allow the camera in your browser, then try again.'
          : 'Could not start hand tracking. Check your connection and that a camera is available.',
      );
      setCameraOn(false);
    } finally {
      setCameraLoading(false);
    }
  }

  function disableCamera() {
    handTrackerRef.current.stop();
    setCameraOn(false);
    setCameraError(null);
    const overlay = overlayRef.current;
    overlay?.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height);
  }

  // --- Particles tab: camera pushes particles around with your hand ---
  useEffect(() => {
    if (!pCameraOn) return undefined;
    const tracker = handTrackerRef.current;

    const unsubscribe = tracker.subscribe(({ hands }) => {
      const field = particleRef.current;
      const overlay = pOverlayRef.current;
      const ctx = overlay?.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, overlay.width, overlay.height);

      // Mirror x (mirror feel). Particles use a top-left origin like the image,
      // so y is NOT flipped here.
      const points = hands.map((h) => ({ x: 1 - h.x, y: h.y }));
      field?.setHandPoints(points);

      if (ctx) {
        hands.forEach((h) => {
          const px = (1 - h.x) * overlay.width;
          const py = h.y * overlay.height;
          ctx.beginPath();
          ctx.arc(px, py, 7, 0, Math.PI * 2);
          ctx.fillStyle = '#3b82f6';
          ctx.fill();
        });
      }
    });

    return () => {
      unsubscribe();
      particleRef.current?.setHandPoints([]);
    };
  }, [pCameraOn]);

  async function enablePCamera() {
    setPCameraError(null);
    setPCameraLoading(true);
    try {
      await handTrackerRef.current.start(pVideoRef.current);
      setPCameraOn(true);
    } catch (err) {
      const denied = err?.name === 'NotAllowedError';
      setPCameraError(
        denied
          ? 'Camera access was blocked. Allow the camera in your browser, then try again.'
          : 'Could not start hand tracking. Check your connection and that a camera is available.',
      );
      setPCameraOn(false);
    } finally {
      setPCameraLoading(false);
    }
  }

  function disablePCamera() {
    handTrackerRef.current.stop();
    setPCameraOn(false);
    setPCameraError(null);
    particleRef.current?.setHandPoints([]);
    const overlay = pOverlayRef.current;
    overlay?.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height);
  }

  // Switch tabs, stopping any input engines so they don't bleed across views.
  function switchView(next) {
    if (next === view) return;
    if (cameraOn) disableCamera();
    if (pCameraOn) disablePCamera();
    if (audioMode !== 'off') disableAudio();
    setView(next);
  }

  // Switch top-level mode. Leaving the studio stops any live camera/audio so
  // nothing keeps running behind the paper-art hero.
  function switchMode(next) {
    if (next === mode) return;
    if (cameraOn) disableCamera();
    if (pCameraOn) disablePCamera();
    if (audioMode !== 'off') disableAudio();
    setMode(next);
  }

  return (
    <>
      <nav className="mode-switch">
        <button
          className={`mode-pill ${mode === 'studio' ? 'mode-pill--active' : ''}`}
          onClick={() => switchMode('studio')}
        >
          Studio
        </button>
        <button
          className={`mode-pill ${mode === 'hero' ? 'mode-pill--active' : ''}`}
          onClick={() => switchMode('hero')}
        >
          Hero Sections
        </button>
      </nav>

      {mode === 'hero' && (
        <>
          {/* Sub-switcher: pick which Hero Section variant to view. */}
          <nav className="tabs hero-tabs">
            {HERO_VARIANT_LIST.map((id) => (
              <button
                key={id}
                className={`tab ${heroVariant === id ? 'tab--active' : ''}`}
                onClick={() => setHeroVariant(id)}
              >
                {HERO_VARIANTS[id].label}
              </button>
            ))}
          </nav>

          {/* `key` forces a fresh mount when switching variants, so the new
              video reloads from its loading screen and scroll resets. */}
          <ScrollHero key={heroVariant} {...HERO_VARIANTS[heroVariant]} />
        </>
      )}

      {mode === 'studio' && (
    <div className={`app ${view === 'particles' ? 'app--light' : ''}`}>
      <nav className="tabs">
        <button
          className={`tab ${view === 'liquid' ? 'tab--active' : ''}`}
          onClick={() => switchView('liquid')}
        >
          Liquid
        </button>
        <button
          className={`tab ${view === 'particles' ? 'tab--active' : ''}`}
          onClick={() => switchView('particles')}
        >
          Particles
        </button>
      </nav>

      {view === 'liquid' && (
        <>
          <FluidBackground
            ref={fluidRef}
            color={color}
            brushSize={brushSize}
            params={params}
            bloom={bloom}
            sunrays={sunrays}
            shading={shading}
          />

          <header className="hero">
            <p className="eyebrow">interactive liquid</p>
            <h1>
              Touch the <span className="hero-accent">water</span>.
            </h1>
            <p className="hero-sub">
              Move your cursor to trail through the surface, let it dance to your
              voice or a song, or steer it with your hand on camera. Click
              anywhere to drop a bomb.
            </p>
          </header>

      <button
        className="panel-toggle"
        onClick={() => setPanelOpen((v) => !v)}
        aria-expanded={panelOpen}
      >
        {panelOpen ? 'Hide controls' : 'Show controls'}
      </button>

      <section className={`panel ${panelOpen ? 'panel--open' : 'panel--closed'}`}>
        <div className="panel-row">
          <span className="panel-label">Ink color</span>
          <label className="color-input">
            <input
              type="color"
              value={pickerValue}
              onChange={(e) => setColor(e.target.value)}
            />
            <span className="color-input-value">
              {isRainbow ? 'rainbow' : color}
            </span>
          </label>
        </div>

        <div className="panel-row">
          <span className="panel-label">Presets</span>
          <div className="swatches">
            {PRESETS.map((preset) => {
              const active =
                (preset.color === null && isRainbow) || preset.color === color;
              return (
                <button
                  key={preset.id}
                  className={`swatch ${active ? 'swatch--active' : ''}`}
                  style={{ background: preset.swatch }}
                  title={`${preset.label}${preset.key ? ` (${preset.key.toUpperCase()})` : ''}`}
                  aria-label={preset.label}
                  onClick={() => setColor(preset.color)}
                >
                  {preset.key && (
                    <span className="swatch-key">{preset.key.toUpperCase()}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="panel-row">
          <span className="panel-label">Brush size</span>
          <div className="brush-sizes">
            {BRUSH_SIZES.map((size) => (
              <button
                key={size}
                className={`brush-size ${brushSize === size ? 'brush-size--active' : ''}`}
                onClick={() => setBrushSize(size)}
                title={`Brush size ${size} (press ${size})`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        <div className="panel-row">
          <span className="panel-label">Mood</span>
          <div className="moods">
            {MOOD_LIST.map((id) => (
              <button
                key={id}
                className={`mood ${mood === id ? 'mood--active' : ''}`}
                onClick={() => selectMood(id)}
                title={`${MOODS[id].label} feel`}
              >
                {MOODS[id].label}
              </button>
            ))}
          </div>
        </div>

        {customMoods.length > 0 && (
          <div className="panel-row">
            <span className="panel-label">My presets</span>
            <div className="moods moods--wrap">
              {customMoods.map((m) => (
                <div
                  key={m.id}
                  className={`custom-mood ${mood === m.id ? 'custom-mood--active' : ''}`}
                >
                  <button
                    className="custom-mood-select"
                    onClick={() => selectCustomMood(m)}
                    title={`Load "${m.label}"`}
                  >
                    {m.label}
                  </button>
                  <button
                    className="custom-mood-del"
                    onClick={() => deleteCustomMood(m.id)}
                    title="Delete preset"
                    aria-label={`Delete ${m.label}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="panel-row">
          <button
            className="advanced-toggle"
            onClick={() => setAdvancedOpen((v) => !v)}
            aria-expanded={advancedOpen}
          >
            <span className="panel-label">Advanced settings</span>
            <span className="advanced-caret">{advancedOpen ? '−' : '+'}</span>
          </button>

          {advancedOpen && (
            <div className="advanced">
              {SLIDERS.map(({ key, label, min, max, step, decimals }) => (
                <label key={key} className="slider-row">
                  <span className="slider-head">
                    <span className="slider-label">{label}</span>
                    <span className="slider-value">
                      {Number(params[key]).toFixed(decimals)}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={params[key]}
                    onChange={(e) => updateParam(key, Number(e.target.value))}
                  />
                </label>
              ))}

              <span className="slider-label slider-label--section">Effects</span>
              <div className="moods">
                <button
                  className={`mood ${bloom ? 'mood--active' : ''}`}
                  onClick={() => setBloom((v) => !v)}
                  title="Soft glow around bright areas"
                >
                  Bloom {bloom ? 'on' : 'off'}
                </button>
                <button
                  className={`mood ${sunrays ? 'mood--active' : ''}`}
                  onClick={() => setSunrays((v) => !v)}
                  title="Light streaks from bright spots (causes the side squares)"
                >
                  Rays {sunrays ? 'on' : 'off'}
                </button>
                <button
                  className={`mood ${shading ? 'mood--active' : ''}`}
                  onClick={() => setShading((v) => !v)}
                  title="Fake 3D lighting that gives the liquid depth"
                >
                  3D {shading ? 'on' : 'off'}
                </button>
              </div>

              <span className="slider-label slider-label--section">
                Save this look
              </span>
              <div className="save-preset">
                <input
                  type="text"
                  className="save-preset-input"
                  placeholder="Name this look…"
                  value={newMoodName}
                  maxLength={24}
                  onChange={(e) => setNewMoodName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveCustomMood();
                  }}
                />
                <button
                  className="save-preset-btn"
                  onClick={saveCustomMood}
                  disabled={!newMoodName.trim()}
                >
                  Save
                </button>
              </div>

              <button
                className="advanced-reset"
                onClick={() => selectMood('water')}
              >
                Reset to Water
              </button>
            </div>
          )}
        </div>

        <div className="panel-row">
          <span className="panel-label">Audio reactive</span>
          <div className="audio-modes">
            <button
              className={`audio-mode ${audioMode === 'off' ? 'audio-mode--active' : ''}`}
              onClick={disableAudio}
            >
              Off
            </button>
            <button
              className={`audio-mode ${audioMode === 'mic' ? 'audio-mode--active' : ''}`}
              onClick={enableMic}
            >
              Microphone
            </button>
            <button
              className={`audio-mode ${audioMode === 'file' ? 'audio-mode--active' : ''}`}
              onClick={pickFile}
            >
              Upload
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={onFileChosen}
            hidden
          />

          {audioMode !== 'off' && (
            <div className="audio-layouts">
              {LAYOUTS.map((layout) => (
                <button
                  key={layout.id}
                  className={`audio-layout ${audioLayout === layout.id ? 'audio-layout--active' : ''}`}
                  onClick={() => setAudioLayout(layout.id)}
                >
                  {layout.label}
                </button>
              ))}
            </div>
          )}

          {audioMode === 'mic' && (
            <p className="audio-status">Listening to your microphone…</p>
          )}

          {audioMode === 'file' && fileName && (
            <div className="audio-file">
              <button className="audio-play" onClick={togglePlay}>
                {isPlaying ? 'Pause' : 'Play'}
              </button>
              <span className="audio-file-name" title={fileName}>
                {fileName}
              </span>
            </div>
          )}

          {audioError && <p className="audio-error">{audioError}</p>}
        </div>

        <div className="panel-row">
          <span className="panel-label">Camera control</span>
          <div className="audio-modes">
            <button
              className={`audio-mode ${!cameraOn ? 'audio-mode--active' : ''}`}
              onClick={disableCamera}
            >
              Off
            </button>
            <button
              className={`audio-mode ${cameraOn ? 'audio-mode--active' : ''}`}
              onClick={enableCamera}
              disabled={cameraLoading}
            >
              {cameraLoading ? 'Starting…' : 'Hand tracking'}
            </button>
          </div>

          {/* The video is always mounted (so its ref exists when we start the
              camera) but only shown as a preview while tracking is on. */}
          <div
            className={`camera-preview ${cameraOn ? '' : 'camera-preview--hidden'}`}
          >
            <video ref={videoRef} className="camera-video" playsInline muted />
            <canvas
              ref={overlayRef}
              className="camera-overlay"
              width={160}
              height={120}
            />
          </div>

          {cameraOn && (
            <p className="audio-status">
              Move your index finger to trail ink · pinch thumb + finger to drop a bomb.
            </p>
          )}

          {cameraError && <p className="audio-error">{cameraError}</p>}
        </div>

        <button className="bomb-button" onClick={() => fluidRef.current?.bomb()}>
          Drop a bomb
        </button>

        <p className="shortcut-hint">
          Keyboard: <b>1–5</b> size · <b>R G B O P K</b> colors
        </p>
      </section>
        </>
      )}

      {view === 'particles' && (
        <>
          <ParticleField
            ref={particleRef}
            count={pCount}
            speed={pSpeed}
            glow={pGlow}
            palette={pPalette}
            background="light"
          />

          <header className="hero hero--dark">
            <p className="eyebrow">interactive particles</p>
            <h1>
              Drift through <span className="hero-accent">light</span>.
            </h1>
            <p className="hero-sub hero-sub--dark">
              Move your cursor to part the particles, click to burst a splash of
              color, or push them around with your hand on camera.
            </p>
          </header>

          <button
            className="panel-toggle"
            onClick={() => setPanelOpen((v) => !v)}
            aria-expanded={panelOpen}
          >
            {panelOpen ? 'Hide controls' : 'Show controls'}
          </button>

          <section
            className={`panel ${panelOpen ? 'panel--open' : 'panel--closed'}`}
          >
            <div className="panel-row">
              <span className="panel-label">Palette</span>
              <div className="moods moods--wrap">
                {PALETTE_LIST.map((id) => (
                  <button
                    key={id}
                    className={`mood ${pPalette === id ? 'mood--active' : ''}`}
                    onClick={() => setPPalette(id)}
                  >
                    {PALETTES[id].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="panel-row">
              <div className="advanced">
                <label className="slider-row">
                  <span className="slider-head">
                    <span className="slider-label">Density</span>
                    <span className="slider-value">{pCount}</span>
                  </span>
                  <input
                    type="range"
                    min={50}
                    max={500}
                    step={10}
                    value={pCount}
                    onChange={(e) => setPCount(Number(e.target.value))}
                  />
                </label>
                <label className="slider-row">
                  <span className="slider-head">
                    <span className="slider-label">Drift speed</span>
                    <span className="slider-value">{pSpeed.toFixed(2)}</span>
                  </span>
                  <input
                    type="range"
                    min={0.2}
                    max={3}
                    step={0.05}
                    value={pSpeed}
                    onChange={(e) => setPSpeed(Number(e.target.value))}
                  />
                </label>
                <label className="slider-row">
                  <span className="slider-head">
                    <span className="slider-label">Glow</span>
                    <span className="slider-value">{pGlow.toFixed(2)}</span>
                  </span>
                  <input
                    type="range"
                    min={0.3}
                    max={2}
                    step={0.05}
                    value={pGlow}
                    onChange={(e) => setPGlow(Number(e.target.value))}
                  />
                </label>
              </div>
            </div>

            <div className="panel-row">
              <span className="panel-label">Camera control</span>
              <div className="audio-modes">
                <button
                  className={`audio-mode ${!pCameraOn ? 'audio-mode--active' : ''}`}
                  onClick={disablePCamera}
                >
                  Off
                </button>
                <button
                  className={`audio-mode ${pCameraOn ? 'audio-mode--active' : ''}`}
                  onClick={enablePCamera}
                  disabled={pCameraLoading}
                >
                  {pCameraLoading ? 'Starting…' : 'Hand tracking'}
                </button>
              </div>

              <div
                className={`camera-preview ${pCameraOn ? '' : 'camera-preview--hidden'}`}
              >
                <video ref={pVideoRef} className="camera-video" playsInline muted />
                <canvas
                  ref={pOverlayRef}
                  className="camera-overlay"
                  width={160}
                  height={120}
                />
              </div>

              {pCameraOn && (
                <p className="audio-status">
                  Move your hand to push the particles around.
                </p>
              )}

              {pCameraError && <p className="audio-error">{pCameraError}</p>}
            </div>
          </section>
        </>
      )}

      <footer className="hint">
        {view === 'liquid'
          ? 'click · drag · speak · play a song · wave your hand'
          : 'move · click to burst · wave your hand'}
      </footer>
    </div>
      )}
    </>
  );
}
