# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Playable Tetris implemented in vanilla JavaScript, HTML5 Canvas, and CSS. No dependencies, no build step, no package.json.

## Running

Open `index.html` directly in a browser, or serve statically:

```bash
python3 -m http.server 8000
# or: npx serve .
# or: php -S localhost:8000
```

No build, lint, or test commands exist in this project.

## Architecture

Three files, no modules/bundler — `index.html` loads `game.js` as a single classic script that runs immediately (`init()` at the bottom of the file).

- **`index.html`** — DOM shell: `#board` canvas (300×600, the 10×20 grid at `BLOCK=30`px/cell), `#next-canvas` for the next-piece preview, HUD spans (`#score`, `#lines`, `#level`), and the `#overlay` div reused for both PAUSE and GAME OVER states.
- **`style.css`** — dark/retro arcade visual theme only; no responsive breakpoints or layout logic that `game.js` depends on beyond canvas dimensions.
- **`game.js`** — all game logic, in one file, no classes:
  - **Board model**: `board` is a `ROWS × COLS` matrix; each cell is `0` (empty) or a piece-color index (1–7).
  - **Pieces**: `PIECES` are 4×4 (I) or 3×3 square matrices; `current` and `next` are `{ type, shape, x, y }`. Rotation (`rotateCW`) transposes + reverses rows; `tryRotate` applies wall-kick offsets `[0, -1, 1, -2, 2]` until one doesn't collide.
  - **Collision** (`collide`): bounds + board-overlap check, used by movement, rotation, ghost projection, and spawn (game-over detection).
  - **Game loop** (`loop`): driven by `requestAnimationFrame`, accumulates `dt` and drops the piece one row once `dropAccum >= dropInterval`; on collision below, calls `lockPiece()` (merge → clear lines → spawn next).
  - **Scoring/leveling**: `LINE_SCORES = [0,100,300,500,800]` × `level`; level increments every 10 lines; `dropInterval = max(100, 1000 - (level-1)*90)`.
  - **Rendering** (`draw`, `drawNext`): redraws grid + locked board + ghost piece (`globalAlpha = 0.2`, position from `ghostY()`) + current piece every frame; no dirty-rect optimization.
  - All state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `animId`, ...) lives in module-level `let` bindings — there is no state container to thread through; new logic reads/writes these globals directly.
  - Input is a single `keydown` listener switching on `e.code` (arrows, `Space`, `KeyX`, `KeyP`); `init()` (also bound to the restart button) resets all state and restarts the `requestAnimationFrame` loop.

When changing board dimensions (`COLS`, `ROWS`, `BLOCK`), also update the `<canvas id="board">` `width`/`height` in `index.html` to match (`COLS × BLOCK`, `ROWS × BLOCK`) — these aren't computed automatically.
