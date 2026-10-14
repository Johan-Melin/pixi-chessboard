# Retro chess playground — step 4

Run `npm install`, then `npm run dev`. Run `npm run build` for a checked production build.

PixiJS v8 animation playground starting with all 32 pieces. Hover to brighten a piece and highlight its square. Press and hold to lift, then drag to any square. Motion adds subtle speed-responsive stretch and tilt. The ground shadow follows beneath the lifted piece. Release to snap into place, lower, and settle with off-white pixel dust at ground contact. Dropping onto another piece automatically captures it, regardless of color: the target flashes white and breaks into palette-colored fragments. Supports mouse and touch; no chess rules or turns.

Green destination highlights indicate an empty square; amber indicates a capture. Outside drops return the piece to its original square. Touch cancellation, lost pointer capture, window blur, and resizing during a hold also return it safely. Reset board restores all 32 pieces and cancels ongoing motion, capture visuals, and particles. A six-pixel threshold separates holding from dragging, and the grab offset is preserved so picking up from the side of a square does not cause a jump.

Interaction accepts both the visible piece silhouette and the surrounding occupied square. The frontmost visible piece wins where silhouettes overlap; otherwise the square selects its occupant. Empty squares and the frame do not select pieces. Logical square occupancy is separate from temporary drag position, and drawing order follows the destination rank after settling. Reduced-motion preferences suppress travel, lift, landing, stretch, tilt, flashes, and particles while captures remain functional. Extra canvas padding accommodates the raised top rank.

Transient effects live in `src/effects.ts` and use independent board coordinates. Captured actors stop receiving input immediately; a detached visual finishes the flash and burst. Dust is scheduled at ground contact and cancelled if the piece is picked up before landing. Particles expire automatically and are capped at 240. Reset clears all pending effects, and stale bursts are skipped after a long background-tab pause.

Verified step 4 with browser checks for contact-timed dust, opposite/same-color captures, repeated captures, unique occupancy, effect cleanup, reset during effects, self/outside drops, reduced motion, and touch capture/reset. TypeScript and production build pass.

The original transparent asset sheet is in `public/retro-chess-assets.png`. Texture frames are measured individually in `src/main.ts`; no image edits or additional generated assets are needed. Clean tile interiors from that sheet are repeated to produce an exact, equally spaced 8×8 grid inside the original decorative frame. The lower-right tile is light.

Each piece has a board-position container, a separate stepped ground shadow, and a visual container ready for future animation. Per-type heights range from 1.00 tiles for pawns to 1.22 tiles for kings, preserving each sprite's aspect ratio. Bases sit at 82% of the tile height, allowing silhouettes to overlap the rank above. Pieces render in row order so nearer rows cover farther ones. Canvas padding prevents top-rank clipping. Scanlines are part of the source image.
