# Interactive Liquid

An interactive, audio-reactive liquid surface built with **React + Vite** and a
WebGL fluid simulation. Move your cursor to trail through the water, click to
drop a "bomb", recolor the ink live, and let the surface dance to your
microphone or an uploaded song.

**Live demo:** https://beckdotan.github.io/bezalel-cursor-example/

## Features

- **Liquid surface** — a GPU fluid simulation with a soft, ink-in-water look.
- **Mouse interaction** — hover to create ripples, click anywhere to drop a bomb.
- **Live color** — a color picker plus presets, or a rainbow (auto-cycling) mode.
- **Brush size** — five sizes for how wide the ripples are.
- **Audio-reactive mode** — react in real time to your **microphone**, or to an
  **uploaded audio file**:
  - Selectable motion layouts: **Bars**, **Radial**, **Scatter**, **Mirror**.
  - Loudness drives ripple size; bass beats trigger bombs.
  - The background slowly tints to the music's "mood".
- **Keyboard shortcuts** — `1`–`5` brush size · `R G B O P K` colors.

Everything runs **client-side** — the microphone and audio never leave your
browser; there is no backend.

## Tech

- [React](https://react.dev/) + [Vite](https://vite.dev/)
- WebGL fluid simulation adapted from Pavel Dobryakov's
  [WebGL-Fluid-Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation)
  (MIT License)
- The [Web Audio API](https://developer.mozilla.org/docs/Web/API/Web_Audio_API)
  (`AnalyserNode`) for real-time audio analysis

## Run locally

```bash
npm install
npm run dev
```

Then open the printed local URL (usually `http://localhost:5173/`).

## Build

```bash
npm run build      # outputs to dist/
npm run preview    # preview the production build locally
```

## Deployment

Pushes to `main` are automatically built and deployed to GitHub Pages via the
workflow in `.github/workflows/deploy.yml`.
