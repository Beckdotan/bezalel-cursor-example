# Paper Art hero video — how it was made

This documents how the scroll-driven hero clip used in **Paper Art** mode was
generated, so it can be reproduced or tweaked later.

- **Final asset:** `public/origami-portrait.mp4`
- **Used by:** `src/PaperArtHero.jsx` (scrubbed by scroll position)
- **Image generation tool:** Nano Banana 2
- **Video generation tool:** LTX 2.3 Pro
- **Frame rate:** 25 fps
- **Playback in the app:** reversed — the page opens on the *last* frame (the
  crumpled paper ball) and scrolling down rewinds it back to the *first* frame
  (the portrait).

> Note: the app re-encodes this clip to an **all-keyframe** MP4 for instant
> scroll-scrubbing (see the README / `ffmpeg` step). The prompts below produced
> the *original* clip; the all-keyframe version is a post-process.

---

## Step 1 — Turn the portrait into folded paper (Nano Banana 2)

Started from a photo of the person and prompted:

```text
make this man look like from a paper that was creased. he is made from this
paper. tha background should be simmilar to what currently exsists. the person
itself should still be in color just in a texture of a folderd paper.
```

## Step 2 — Reposition the subject (Nano Banana 2)

Took the result of Step 1 and prompted:

```text
put the character in the third right of the image
```

## Step 3 — Create the "end" frame: a crumpled paper ball (Nano Banana 2)

Took the result of Step 2 and prompted:

```text
change the person to be a crumbled paper ball flaoting in the middle of the
third right of the screen where the person is. make it small size
```

## Step 4 — Animate between the two frames (LTX 2.3 Pro)

Used **LTX 2.3 Pro** at **25 fps** with **first and last image** keyframes
(first frame = the person from Step 2, last frame = the paper ball from Step 3)
and this prompt:

```text
Animate the original origami-photo portrait transforming into a cramped,
crumpled paper ball version. Start with the clean folded photo face sculpture
from the original prompt, then gradually compress it inward as if invisible
hands are squeezing and folding the paper into a paper ball. The character
bends, collapses, wrinkles, and tightens into a smaller distorted paper
sculpture with dense sharp creases, overlapping folds, warped facial features,
and crushed paper texture. Keep background the same as it was, same
composition, same angle, same lighting, preserved printed photo skin tones.
Smooth physical paper-folding motion, no camera zoom, no new objects, no hands,
no text, no watermark, slow motion, effects,
```

---

## Reproducing / swapping the video

1. Generate a new clip following the steps above (or any clip you like).
2. Drop the `.mp4` into `public/`.
3. Re-encode to all-keyframes for smooth scrubbing, e.g.:

   ```bash
   ffmpeg -y -i public/your-clip.mp4 -an -c:v libx264 -preset slow -crf 20 \
     -g 1 -keyint_min 1 -sc_threshold 0 \
     -x264-params "keyint=1:min-keyint=1:scenecut=0" \
     -pix_fmt yuv420p -movflags +faststart public/origami-portrait.mp4
   ```

4. If the new clip should play forward instead of reversed, flip the mapping in
   `src/PaperArtHero.jsx` (`targetTimeRef.current = p * duration` instead of
   `(1 - p) * duration`).
