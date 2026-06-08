/*
 * Hand tracker: turns the laptop camera into a controller for the liquid.
 *
 * It uses Google's MediaPipe "HandLandmarker", a small machine-learning model
 * that runs ENTIRELY in the browser (on the GPU). The camera frames are never
 * uploaded anywhere — we only read the model's output: 21 landmark points per
 * hand. From those we pull out the index fingertip (to steer the liquid) and
 * the thumb-to-index distance (to detect a "pinch" gesture for dropping bombs).
 *
 * Mirrors the shape of audioEngine.js: subscribe(fn) / start(video) / stop().
 * Each frame, subscribers receive: { hands: [{ x, y, pinch, pinchRatio }] }
 * where x,y are 0..1 in the camera image (x: left->right, y: top->bottom).
 */

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

// The model's runtime (WASM) is loaded from a CDN, pinned to the exact version
// of the npm package we installed so the JS and WASM never drift apart.
const WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// Landmark indices we care about (see MediaPipe's hand model).
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9; // base knuckle of the middle finger

// A pinch is "thumb tip close to index tip", measured relative to hand size so
// it works whether your hand is near or far from the camera.
const PINCH_ON = 0.42; // ratio below this => fingers considered pinched

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function createHandTracker() {
  let landmarker = null;
  let video = null;
  let stream = null;
  let rafId = 0;
  let running = false;
  let lastVideoTime = -1;
  const listeners = new Set();

  // Load the model once (a few MB, then cached by the browser).
  async function ensureModel() {
    if (landmarker) return;
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands: 2,
    });
  }

  function loop() {
    if (!running) return;
    rafId = requestAnimationFrame(loop);
    if (!video || video.readyState < 2) return;

    // Only run detection on genuinely new frames.
    if (video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;

    let result;
    try {
      result = landmarker.detectForVideo(video, performance.now());
    } catch {
      return; // transient frame error; try again next tick
    }

    const hands = (result.landmarks || []).map((lm) => {
      const tip = lm[INDEX_TIP];
      const thumb = lm[THUMB_TIP];
      // Normalize the pinch distance by the hand's size so it's distance-proof.
      const handSize = Math.max(0.0001, dist(lm[WRIST], lm[MIDDLE_MCP]));
      const pinchRatio = dist(tip, thumb) / handSize;
      return {
        x: tip.x,
        y: tip.y,
        pinchRatio,
        pinch: pinchRatio < PINCH_ON,
      };
    });

    listeners.forEach((fn) => fn({ hands }));
  }

  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    // Start the camera and the detection loop. `videoEl` is a <video> we draw
    // the camera into (kept muted/inline). Throws if the model or camera fails.
    async start(videoEl) {
      await ensureModel();
      video = videoEl;
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
        audio: false,
      });
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      running = true;
      lastVideoTime = -1;
      loop();
    },

    stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }
      if (video) {
        video.srcObject = null;
        video = null;
      }
    },
  };
}
