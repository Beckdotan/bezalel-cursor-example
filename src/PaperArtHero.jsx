import { useEffect, useRef, useState } from 'react';
import './PaperArtHero.css';

// The text "scenes" that appear as you scroll. Each one is tied to a slice of
// the scroll timeline using `start` and `end` (both 0..1, where 0 is the very
// top and 1 is the very bottom). The scene is fully visible in the middle of
// its window and fades in/out at the edges. Edit this array to change the copy.
const SCENES = [
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
];

// How quickly the video position chases the scroll position. Lower = smoother
// but laggier; higher = snappier but can look jittery. 0.2 keeps a little
// filmic glide while still catching up quickly on a fast scroll.
const SCRUB_EASE = 0.2;

// Map a scroll progress value (0..1) to an opacity for a single scene, fading
// in over the first 18% of its window and out over the last 18%.
function sceneOpacity(progress, start, end) {
  if (progress < start || progress > end) return 0;
  const span = end - start;
  const fade = span * 0.18;
  const local = progress - start;
  // The very first scene (start at the top) shouldn't fade in — it should be
  // fully visible the moment the page loads.
  if (start > 0 && local < fade) return local / fade; // fading in
  // The final scene (ends at the very bottom) shouldn't fade out — it stays on
  // the finished sculpture as a closing call-to-action.
  if (end < 1 && local > span - fade) return (span - local) / fade; // fading out
  return 1; // fully visible
}

export default function PaperArtHero() {
  const scrollRef = useRef(null); // the tall scrolling container
  const videoRef = useRef(null);
  const progressRef = useRef(0); // latest raw scroll progress (0..1)
  const targetTimeRef = useRef(0); // where we WANT the video to be
  const currentTimeRef = useRef(0); // where the video smoothly IS
  const rafRef = useRef(0);
  const durationRef = useRef(0);

  // `progress` in state is only used to drive the React text overlay opacities.
  const [progress, setProgress] = useState(0);
  // Loading state for the intro screen.
  const [loadPct, setLoadPct] = useState(0); // 0..100 download progress
  const [hasTotal, setHasTotal] = useState(true); // can we show an exact %?
  const [loaded, setLoaded] = useState(false); // fully downloaded + seekable

  // Preload the ENTIRE video up front. We stream it with fetch so we can show a
  // real download percentage, then hand the finished file to the <video> as an
  // in-memory blob. This guarantees the whole clip is available before we let
  // anyone in, and makes scrubbing instant (nothing left to download/decode).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    let cancelled = false;
    let objectUrl = null;

    // Once the video can actually play/seek, capture its duration, prime it
    // (some browsers won't let us seek until it's been played once), and reveal.
    const onReady = () => {
      const d = video.duration || 0;
      durationRef.current = d;
      // We play the clip in REVERSE: at the top of the page the video sits on
      // its final frame, and scrolling down rewinds it toward the start. So we
      // seed both the target and current time at the end (the smoothing loop
      // will move the actual <video> to that frame).
      targetTimeRef.current = d;
      currentTimeRef.current = d;
      const prime = video.play();
      if (prime && typeof prime.then === 'function') {
        prime.then(() => video.pause()).catch(() => {});
      }
      setLoadPct(100);
      setLoaded(true);
    };

    async function preload() {
      try {
        const res = await fetch('/origami-portrait.mp4');
        const total = Number(res.headers.get('Content-Length')) || 0;
        if (!total) setHasTotal(false);

        // Stream the bytes, updating the percentage as chunks arrive.
        const reader = res.body.getReader();
        const chunks = [];
        let received = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (cancelled) return;
          chunks.push(value);
          received += value.length;
          if (total) {
            setLoadPct(Math.min(99, Math.round((received / total) * 100)));
          }
        }

        const blob = new Blob(chunks, { type: 'video/mp4' });
        objectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        video.src = objectUrl;
        if (video.readyState >= 3) onReady();
        else video.addEventListener('canplay', onReady, { once: true });
      } catch {
        // If the streaming preload fails for any reason, fall back to letting
        // the <video> load normally so the experience still works.
        if (cancelled) return;
        setHasTotal(false);
        video.src = '/origami-portrait.mp4';
        if (video.readyState >= 3) onReady();
        else video.addEventListener('canplay', onReady, { once: true });
      }
    }

    preload();

    return () => {
      cancelled = true;
      video.removeEventListener('canplay', onReady);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  // The smoothing loop: every animation frame we ease the video's actual time
  // toward the target time set by scrolling. This makes scrubbing feel filmic
  // instead of snapping abruptly to each scroll value.
  useEffect(() => {
    const tick = () => {
      const video = videoRef.current;
      const duration = durationRef.current;
      if (video && duration) {
        const cur = currentTimeRef.current;
        const target = targetTimeRef.current;
        const next = cur + (target - cur) * SCRUB_EASE;
        currentTimeRef.current = next;
        // Only seek when the change is meaningful (avoids spamming the decoder).
        if (Math.abs(next - video.currentTime) > 0.01) {
          video.currentTime = next;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Translate the scroll position into (a) a target video time and (b) the
  // progress value that the text overlays react to.
  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const p = max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0;
    progressRef.current = p;
    // Reverse playback: top of page (p=0) -> last frame, bottom (p=1) -> first.
    targetTimeRef.current = (1 - p) * (durationRef.current || 0);
    setProgress(p);
  }

  return (
    <div
      className={`paper ${loaded ? '' : 'paper--locked'}`}
      ref={scrollRef}
      onScroll={onScroll}
    >
      {/* The pinned stage: video + text stay on screen while the tall track
          below scrolls past, which is what drives the scrubbing. */}
      <div className="paper__stage">
        <video
          ref={videoRef}
          className="paper__video"
          muted
          playsInline
          preload="auto"
        />
        <div className="paper__scrim" />

        {SCENES.map((scene, i) => {
          const opacity = sceneOpacity(progress, scene.start, scene.end);
          return (
            <div
              key={i}
              className="paper__scene"
              style={{ opacity, pointerEvents: opacity > 0.6 ? 'auto' : 'none' }}
              aria-hidden={opacity < 0.5}
            >
              <p className="paper__eyebrow">{scene.eyebrow}</p>
              <h1 className="paper__title">
                {scene.title.split('\n').map((line, j) => (
                  <span key={j} className="paper__title-line">
                    {line}
                  </span>
                ))}
              </h1>
              <p className="paper__sub">{scene.sub}</p>
              {scene.cta && (
                <button className="paper__cta" type="button">
                  {scene.cta}
                </button>
              )}
            </div>
          );
        })}

        {/* Thin progress bar so you can feel where you are in the timeline. */}
        <div className="paper__progress">
          <div
            className="paper__progress-fill"
            style={{ transform: `scaleX(${progress})` }}
          />
        </div>

        {/* Scroll hint, fades away once you start moving (and only after the
            loading screen is gone). */}
        <div
          className="paper__hint"
          style={{ opacity: loaded && progress <= 0.02 ? 1 : 0 }}
        >
          <span>Scroll to unfold</span>
          <span className="paper__hint-arrow">↓</span>
        </div>
      </div>

      {/* Branded loading screen. Covers everything until the whole video has
          downloaded, then fades away to reveal the experience. */}
      <div
        className={`paper-loader ${loaded ? 'paper-loader--done' : ''}`}
        aria-hidden={loaded}
      >
        <div className="paper-loader__fold" />
        <p className="paper-loader__label">Loading experience</p>
        <div className="paper-loader__bar">
          <div
            className={`paper-loader__bar-fill ${
              hasTotal ? '' : 'paper-loader__bar-fill--indeterminate'
            }`}
            style={hasTotal ? { transform: `scaleX(${loadPct / 100})` } : undefined}
          />
        </div>
        <p className="paper-loader__pct">{hasTotal ? `${loadPct}%` : 'Preparing…'}</p>
      </div>

      {/* The invisible tall track. Its height is what gives us room to scroll;
          ~6 screens of scrolling maps to the full 4s of video. */}
      <div className="paper__track" aria-hidden="true" />
    </div>
  );
}
