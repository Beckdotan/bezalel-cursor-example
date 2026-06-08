import { useEffect, useRef, useState } from 'react';
import FluidBackground from './FluidBackground';
import { createAudioEngine } from './audioEngine';
import './App.css';

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
  // `color` is either a hex string or null (rainbow mode).
  const [color, setColor] = useState('#19e3ff');
  const [brushSize, setBrushSize] = useState(3);
  const [panelOpen, setPanelOpen] = useState(true);

  // Audio mode: 'off' | 'mic' | 'file'
  const [audioMode, setAudioMode] = useState('off');
  const [audioLayout, setAudioLayout] = useState('bars');
  const [audioError, setAudioError] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const fluidRef = useRef(null);
  const fileInputRef = useRef(null);

  // Create the audio engine once.
  const audioEngineRef = useRef(null);
  if (!audioEngineRef.current) {
    audioEngineRef.current = createAudioEngine();
  }

  // Per-frame state kept without re-rendering.
  const beatRef = useRef({ avg: 0, cooldown: 0 });
  const bgRef = useRef({ r: 0, g: 0, b: 0 });

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

  async function enableMic() {
    try {
      await audioEngineRef.current.useMic();
      setAudioMode('mic');
      setFileName(null);
      setIsPlaying(false);
      setAudioError(null);
    } catch {
      setAudioError('Microphone access was blocked. Check browser permissions.');
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

  return (
    <div className="app">
      <FluidBackground ref={fluidRef} color={color} brushSize={brushSize} />

      <header className="hero">
        <p className="eyebrow">interactive liquid</p>
        <h1>
          Touch the <span className="hero-accent">water</span>.
        </h1>
        <p className="hero-sub">
          Move your cursor to trail through the surface, or let it dance to your
          voice or a song. Click anywhere to drop a bomb.
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

        <button className="bomb-button" onClick={() => fluidRef.current?.bomb()}>
          Drop a bomb
        </button>

        <p className="shortcut-hint">
          Keyboard: <b>1–5</b> size · <b>R G B O P K</b> colors
        </p>
      </section>

      <footer className="hint">click · drag · speak · play a song</footer>
    </div>
  );
}
