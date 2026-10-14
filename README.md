# Retro chess playground — step 2

Run `npm install`, then `npm run dev`. Run `npm run build` for a checked production build.

PixiJS v8 scene with all 32 pieces. Hover to brighten a piece and highlight its square. Press and hold to lift; release to lower and settle. Supports mouse and touch. No dragging, dust, or chess rules yet.

Interaction accepts both the visible piece silhouette and the surrounding occupied square. The frontmost visible piece wins where silhouettes overlap; otherwise the square selects its occupant. Empty squares and the frame do not select pieces. Hit areas stay fixed during animation. Pointer capture handles release outside the canvas, with cancellation and window-blur cleanup. Animation can be interrupted without queuing old movements. Reduced-motion preferences skip the lift and landing transitions. Shadows remain at ground level while visuals lift. Extra canvas padding accommodates the raised top rank.

The original transparent asset sheet is in `public/retro-chess-assets.png`. Texture frames are measured individually in `src/main.ts`; no image edits or additional generated assets are needed. Clean tile interiors from that sheet are repeated to produce an exact, equally spaced 8×8 grid inside the original decorative frame. The lower-right tile is light.

Each piece has a board-position container, a separate stepped ground shadow, and a visual container ready for future animation. Per-type heights range from 1.00 tiles for pawns to 1.22 tiles for kings, preserving each sprite's aspect ratio. Bases sit at 82% of the tile height, allowing silhouettes to overlap the rank above. Pieces render in row order so nearer rows cover farther ones. Canvas padding prevents top-rank clipping. Scanlines are part of the source image.
