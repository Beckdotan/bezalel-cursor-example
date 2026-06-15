/*
 * Audio engine: listens to either the microphone or an uploaded audio file and,
 * every animation frame, reports a simple analysis of the sound to subscribers.
 *
 * It uses the browser's built-in Web Audio API (AnalyserNode) — entirely
 * client-side, no network or server involved.
 *
 * Reported each frame:
 *   - spectrum: array of band energies (0..1), low frequencies first
 *   - volume:   overall loudness (0..1)
 *   - bass:     energy of the lowest bands (0..1), useful for beat detection
 */

const BANDS = 24;

// How much to turn the microphone DOWN before analysis (1 = full, 0 = silent).
// Lower this if the mic still feels too sensitive to background sound.
const MIC_GAIN = 0.25;

// Noise floor for the microphone, in decibels. Sound quieter than this is
// treated as silence and ignored. Closer to 0 (e.g. -55) = less sensitive;
// more negative (e.g. -90) = picks up fainter sound.
const MIC_MIN_DECIBELS = -65;

export function createAudioEngine() {
  let ctx = null;
  let analyser = null;
  let sourceNode = null;
  let micGain = null; // attenuates the mic signal so it's less sensitive
  let micStream = null;
  let audioEl = null;
  let rafId = 0;
  let freqData = null;
  const listeners = new Set();

  function ensureContext() {
    if (ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    ctx = new AudioCtx();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024; // -> 512 frequency bins
    analyser.smoothingTimeConstant = 0.82; // smooths jitter between frames
    freqData = new Uint8Array(analyser.frequencyBinCount);
  }

  function analyze() {
    analyser.getByteFrequencyData(freqData);
    const n = freqData.length;

    // We split the spectrum into bands on a LOGARITHMIC scale (the way humans
    // hear), instead of evenly by Hz. A linear split crams nearly all musical
    // energy into the first couple of bands — which is why everything used to
    // pile up on one side. Log spacing spreads bass/mid/treble fairly.
    const minBin = 1; // skip bin 0 (DC offset)
    const maxBin = Math.floor(n * 0.85);
    const spectrum = new Array(BANDS);
    let total = 0;
    let centroidNum = 0; // for the "mood" hue (weighted avg band)

    for (let i = 0; i < BANDS; i++) {
      const f0 = minBin * Math.pow(maxBin / minBin, i / BANDS);
      const f1 = minBin * Math.pow(maxBin / minBin, (i + 1) / BANDS);
      const start = Math.floor(f0);
      const end = Math.max(start + 1, Math.floor(f1));
      let sum = 0;
      let count = 0;
      for (let j = start; j < end && j < n; j++) {
        sum += freqData[j];
        count += 1;
      }
      let avg = sum / Math.max(1, count) / 255;
      // High frequencies are naturally quieter; lift them so they show too.
      const gain = 1 + (i / BANDS) * 1.8;
      avg = Math.min(1, avg * gain);
      spectrum[i] = avg;
      total += avg;
      centroidNum += avg * i;
    }

    const volume = total / BANDS;
    // 0 = energy mostly in the bass, 1 = mostly in the treble.
    const centroid = total > 0.0001 ? centroidNum / total / (BANDS - 1) : 0;
    let bass = 0;
    for (let i = 0; i < 3; i++) bass += spectrum[i];
    bass /= 3;
    return { spectrum, volume, bass, centroid };
  }

  function loop() {
    const data = analyze();
    listeners.forEach((fn) => fn(data));
    rafId = requestAnimationFrame(loop);
  }

  function startLoop() {
    if (!rafId) loop();
  }

  function stopLoop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function disconnectSource() {
    if (sourceNode) {
      try {
        sourceNode.disconnect();
      } catch {
        /* already disconnected */
      }
      sourceNode = null;
    }
    if (micGain) {
      try {
        micGain.disconnect();
      } catch {
        /* already disconnected */
      }
      micGain = null;
    }
    if (micStream) {
      micStream.getTracks().forEach((t) => t.stop());
      micStream = null;
    }
    if (audioEl) {
      audioEl.pause();
      if (audioEl.src) URL.revokeObjectURL(audioEl.src);
      audioEl = null;
    }
    if (analyser) {
      try {
        analyser.disconnect();
      } catch {
        /* no-op */
      }
    }
  }

  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    async useMic() {
      ensureContext();
      await ctx.resume();
      // Turn OFF auto gain control: it auto-boosts quiet input, which makes the
      // mic feel hyper-sensitive to faint background sound. Noise suppression
      // and echo cancellation further calm down ambient noise.
      // Some browsers reject these extra constraints; if so, fall back to a
      // plain mic request so a real permission prompt can still succeed.
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            autoGainControl: false,
            noiseSuppression: true,
            echoCancellation: true,
          },
        });
      } catch (err) {
        if (err && err.name === 'NotAllowedError') throw err; // truly blocked
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      disconnectSource();
      // Raise the noise floor so quiet background sound is ignored (mic only).
      analyser.minDecibels = MIC_MIN_DECIBELS;
      micStream = stream;
      sourceNode = ctx.createMediaStreamSource(stream);
      // Route the mic through a gain node turned below 1 to reduce sensitivity.
      micGain = ctx.createGain();
      micGain.gain.value = MIC_GAIN;
      sourceNode.connect(micGain);
      micGain.connect(analyser);
      // Note: we do NOT connect the analyser to the speakers for the mic,
      // otherwise you'd hear an echo / feedback loop of your own voice.
      startLoop();
    },

    async useFile(file) {
      ensureContext();
      await ctx.resume();
      disconnectSource();
      analyser.minDecibels = -100; // default floor; files play at normal level
      audioEl = new Audio();
      audioEl.src = URL.createObjectURL(file);
      audioEl.loop = true;
      sourceNode = ctx.createMediaElementSource(audioEl);
      sourceNode.connect(analyser);
      analyser.connect(ctx.destination); // so the song is actually audible
      await audioEl.play();
      startLoop();
      return audioEl;
    },

    play() {
      audioEl?.play();
    },

    pause() {
      audioEl?.pause();
    },

    isFilePlaying() {
      return !!audioEl && !audioEl.paused;
    },

    stop() {
      stopLoop();
      disconnectSource();
    },
  };
}
