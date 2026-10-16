# pixi-chessboard

A small, application-controlled chessboard renderer for PixiJS v8. It displays the position you supply and animates interaction. It does not decide legal moves, turns, check, or captures, and has no chess-logic dependency.

The retro renderer includes hover highlighting, whole-square picking, lift, drag stretch/tilt, shadows, settling, landing dust, and removal effects. The playground demonstrates free movement and automatic captures through its own controller.

## Development

```sh
npm install
npm run dev
npm run build
npm run build:playground
```

The library builds to `dist/`, with TypeScript declarations. The playground builds to `playground-dist/`. PixiJS is a peer dependency, not bundled into the library. The package remains `private: true` to prevent accidental npm publication; it has not been published. Public naming and licensing can be finalized when preparing a release.

## Minimal API

| API | Purpose |
| --- | --- |
| `createChessboard(host, options)` | Mount a responsive canvas and return the board asynchronously. |
| `board.getPosition()` | Read a defensive copy of the current position. |
| `board.setPosition(position, { animate? })` | Replace the position; animate by default. Use `animate: false` for reset or immediate updates. |
| `board.destroy()` | Remove the canvas and release instance resources. Safe to call twice. |
| `board.canvas` | Access the canvas if the host needs it. |

Each piece has a stable `id`, a `square` such as `e4`, a `kind` (`p`, `n`, `b`, `r`, `q`, `k`), and a `side` (`w` or `b`). These describe appearance and placement only. No king, turn, or chess-rule requirements are enforced. IDs and occupied squares must be unique.

`onMoveRequest({ pieceId, from, to })` is the application boundary:

- Return the **entire next position** to accept. The host decides which pieces moved, disappeared, or changed appearance.
- Return `null` to reject and return the piece to its original square.
- Return a promise for either result when waiting on a server or application logic. New input pauses while pending.
- Omit the handler for a read-only board.
- Callback errors or malformed results reject the action and invoke `onError` (or log an error if none was supplied).

`setPosition` supersedes pending requests; late responses cannot overwrite the newer position. Destroyed boards ignore late responses. The host must likewise prevent stale responses from overwriting its own application state.

Example for a Vite application using a locally installed package tarball:

```ts
import { createChessboard, type Position } from 'pixi-chessboard';
import assetUrl from 'pixi-chessboard/assets/retro-chess-assets.png?url';

let position: Position = [
  { id: 'white-pawn', square: 'd2', kind: 'p', side: 'w' },
  { id: 'black-pawn', square: 'd7', kind: 'p', side: 'b' },
];

const board = await createChessboard(document.querySelector('#board')!, {
  assetUrl,
  position,
  onMoveRequest(request) {
    // Demo policy only. Replace this with your own rules or server validation.
    position = position
      .filter(piece => piece.id === request.pieceId || piece.square !== request.to)
      .map(piece => piece.id === request.pieceId
        ? { ...piece, square: request.to }
        : piece);
    return position;
  },
  onError: console.error,
});

// When unmounting: board.destroy();
```

Give the host a width and square aspect ratio, for example `#board { width: min(100%, 720px); aspect-ratio: 1; }`. No package stylesheet is required. Call `createChessboard` in the browser after the host mounts. Each board owns its canvas and renderer, resizing with its host width.

`assetUrl` points to the supplied asset sheet or an image with the same sprite layout. For another bundler, serve the PNG and pass its URL. Cross-origin assets need CORS permission. The package assumes no Vite paths, page selectors, reset button, or starting position. The `?url` import above is specific to this Vite example.

## Visual behavior

Custom piece artwork can override individual sprites using `pieceAssets: { wp: whitePawnUrl, bp: blackPawnUrl }`. Keys combine side (`w`/`b`) and kind (`p`, `n`, `b`, `r`, `q`, `k`). SVG and other browser image formats work; missing entries use the original sheet. Transparent margins are trimmed before scaling, and pointer hit testing uses the replacement's alpha mask. SVG files load as images, rather than being inserted into the page. Included `assets/pawn-white.svg` and `assets/pawn-black.svg` use the user-provided pawn geometry, recolored with a dark outer outline.

For styling through code, use the unchanged `assets/pawn-original.svg` for both sides and configure `pieceStyles`:

```ts
pieceAssets: { wp: pawnUrl, bp: pawnUrl },
pieceStyles: {
  wp: { color: '#f4dfb0', outline: true, outlineColor: '#12161c', outlineWidth: 2, scale: 1 },
  bp: { color: '#4399ad', outline: true, outlineColor: '#12161c', outlineWidth: 2, scale: 1 },
},
```

`color` tints the artwork: white becomes the chosen color, while gray and black details preserve shading. Omit it to keep the source colors. `outline` defaults to false; `outlineColor` defaults to `#12161c` and `outlineWidth` to 2. Width is measured in board pixels before viewport scaling (a square is 85.5 units). `scale` multiplies the default piece height, preserving proportions; use 0.85 for smaller pieces or 1.1 for larger ones. Styles are applied once at board creation, without modifying the SVG. They also work on the fallback sprites when only `pieceStyles` is provided. Fill and outline are rendered from the combined silhouette, so overlapping SVG primitives do not gain internal seams. Existing shadows, animation, removal effects, and hit testing use the resulting artwork. Edit `playground/main.ts` for immediate style previews.

- Positions are matched by stable ID. Removed IDs flash and fragment. The renderer never removes a piece simply because the pointer was dropped on it.
- Green/amber drop highlights indicate empty/occupied squares, not legality. Allowed-move and threat indicators remain deferred.
- Dust stays at the landing location. Reset with `animate: false` clears transient effects.
- Reduced-motion preferences suppress motion, flashes, and particles while position updates remain functional.
- Outside release, touch cancellation, blur, and resizing during a drag return the held piece. Keyboard piece movement is not implemented yet.
- Artwork has baked-in scanlines. Theme layout, orientation, effect tuning, and annotations remain fixed until needed.

## Hosting the visual playground

The repository's `vercel.json` builds the website using `npm run build:playground` and publishes `playground-dist`. The default `npm run build` generates the reusable library in `dist`; that directory is not a website. In the Vercel dashboard, use the Vite framework preset and the repository root directory. The playground allows free movement; the separate chess integration demo is a different project and is not included in this repository.

## Tests and local packaging

```sh
npx playwright install chromium
npm test
npm pack --dry-run
```

Alternatively, test with installed Edge by setting `PLAYWRIGHT_CHANNEL=msedge` (PowerShell: `$env:PLAYWRIGHT_CHANNEL='msedge'`). Tests cover acceptance/rejection, async decisions, stale replies, immutable input, invalid positions, read-only mode, multiple boards, destruction, and mouse/touch capture.

`npm pack` creates a local installable tarball; it does not publish. The prepack script builds the library. Package contents include built code, declarations, the PNG, and documentation, excluding the playground, tests, screenshots, and dependencies.

## Layout

```text
src/           reusable renderer, public types, and effects
assets/        retro asset sheet
playground/    initial setup, free-play controller, reset UI, and styling
tests/         browser checks against the public API
```
