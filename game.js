'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
];

const SKIN_PALETTES = {
  retro: COLORS,
  neon: [
    null,
    '#00e5ff', // I
    '#fff700', // O
    '#e040fb', // T
    '#00e676', // S
    '#ff1744', // Z
    '#2979ff', // J
    '#ff9100', // L
  ],
  pastel: [
    null,
    '#aee7ea', // I
    '#fff2b2', // O
    '#dcb8ea', // T
    '#bfe7c2', // S
    '#f3b8b8', // Z
    '#bcd8f7', // J
    '#f7cda3', // L
  ],
  pixel: COLORS,
};
const SKIN_NAMES = Object.keys(SKIN_PALETTES);
const NEON_ACCENT = SKIN_PALETTES.neon[1];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const POWERUPS = {
  bomb: { icon: '💣', name: 'BOMBA' },
  lightning: { icon: '⚡', name: 'RAYO' },
  tint: { icon: '🎨', name: 'TINTE' },
  gravity: { icon: '⬇', name: 'GRAVEDAD' },
  freeze: { icon: '❄', name: 'CONGELAR' },
};
const POWERUP_TYPES = Object.keys(POWERUPS);
const POWERUP_LINE_INTERVAL = 5;
const FREEZE_DURATION_MS = 5000;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggleBtn = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');

const THEME_KEY = 'tetris-theme';
const SKIN_KEY = 'tetris-skin';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let gridLineColor;
let linesUntilPowerup, freezeUntil;
let currentSkin = 'retro';

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  if (cleared && !next.powerup) {
    linesUntilPowerup -= cleared;
    if (linesUntilPowerup <= 0) {
      next.powerup = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
      linesUntilPowerup = POWERUP_LINE_INTERVAL;
    }
  }
}

function pieceBounds(piece) {
  const shape = piece.shape;
  let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      if (shape[r][c]) {
        minR = Math.min(minR, r); maxR = Math.max(maxR, r);
        minC = Math.min(minC, c); maxC = Math.max(maxC, c);
      }
  return { minR, maxR, minC, maxC };
}

function applyPowerup(type, piece) {
  const { minR, maxR, minC, maxC } = pieceBounds(piece);
  const centerRow = piece.y + Math.round((minR + maxR) / 2);
  const centerCol = piece.x + Math.round((minC + maxC) / 2);
  const bottomRow = piece.y + maxR;

  switch (type) {
    case 'bomb':
      for (let r = centerRow - 1; r <= centerRow + 1; r++) {
        if (r < 0 || r >= ROWS) continue;
        for (let c = centerCol - 1; c <= centerCol + 1; c++) {
          if (c < 0 || c >= COLS) continue;
          board[r][c] = 0;
        }
      }
      break;
    case 'lightning':
      if (bottomRow >= 0 && bottomRow < ROWS) {
        board.splice(bottomRow, 1);
        board.unshift(new Array(COLS).fill(0));
      }
      if (centerCol >= 0 && centerCol < COLS) {
        for (let r = 0; r < ROWS; r++) board[r][centerCol] = 0;
      }
      break;
    case 'tint': {
      const counts = {};
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (board[r][c]) counts[board[r][c]] = (counts[board[r][c]] || 0) + 1;
      const colors = Object.keys(counts);
      if (colors.length) {
        const target = Number(colors[Math.floor(Math.random() * colors.length)]);
        for (let r = 0; r < ROWS; r++)
          for (let c = 0; c < COLS; c++)
            if (board[r][c] === target) board[r][c] = 0;
      }
      break;
    }
    case 'gravity':
      for (let c = 0; c < COLS; c++) {
        const colVals = [];
        for (let r = 0; r < ROWS; r++) if (board[r][c]) colVals.push(board[r][c]);
        for (let r = ROWS - 1, i = colVals.length - 1; r >= 0; r--, i--) {
          board[r][c] = i >= 0 ? colVals[i] : 0;
        }
      }
      break;
    case 'freeze':
      freezeUntil = performance.now() + FREEZE_DURATION_MS;
      break;
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  if (current.powerup) applyPowerup(current.powerup, current);
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawRoundedRectPath(context, x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  context.beginPath();
  context.moveTo(x + rad, y);
  context.arcTo(x + w, y, x + w, y + h, rad);
  context.arcTo(x + w, y + h, x, y + h, rad);
  context.arcTo(x, y + h, x, y, rad);
  context.arcTo(x, y, x + w, y, rad);
  context.closePath();
}

function drawPixelTexture(context, px, py, pw, ph, size) {
  // Plain (non-rounded) cell body, so squares can be clamped to the block
  // bounds directly instead of paying for a save/clip/restore per block.
  const cell = Math.max(2, Math.floor(size / 6));
  context.fillStyle = 'rgba(0,0,0,0.14)';
  let rowToggle = false;
  for (let yy = py; yy < py + ph; yy += cell) {
    const h = Math.min(cell, py + ph - yy);
    let shade = rowToggle;
    for (let xx = px; xx < px + pw; xx += cell) {
      if (shade) {
        const w = Math.min(cell, px + pw - xx);
        context.fillRect(xx, yy, w, h);
      }
      shade = !shade;
    }
    rowToggle = !rowToggle;
  }
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const palette = SKIN_PALETTES[currentSkin] || COLORS;
  const color = palette[colorIndex] || COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.shadowBlur = 0;

  const px = x * size + 1;
  const py = y * size + 1;
  const pw = size - 2;
  const ph = size - 2;

  if (currentSkin === 'pastel') {
    context.fillStyle = color;
    drawRoundedRectPath(context, px, py, pw, ph, 6);
    context.fill();
    // Clip the highlight to the body's rounded silhouette so it can't
    // overhang the rounded top corners (they'd otherwise use different
    // effective radii since the highlight strip is much shorter than pw).
    context.save();
    drawRoundedRectPath(context, px, py, pw, ph, 6);
    context.clip();
    context.fillStyle = 'rgba(255,255,255,0.3)';
    context.fillRect(px, py, pw, 4);
    context.restore();
  } else {
    if (currentSkin === 'neon') {
      context.shadowBlur = 14;
      context.shadowColor = color;
    }
    context.fillStyle = color;
    context.fillRect(px, py, pw, ph);
    if (currentSkin === 'neon') {
      // Glow only the body fill; skip it for the thin highlight strip to
      // halve the per-block shadow cost (shadowBlur is expensive at 60fps).
      context.shadowBlur = 0;
    }
    // highlight
    context.fillStyle = 'rgba(255,255,255,0.12)';
    context.fillRect(px, py, pw, 4);
  }

  if (currentSkin === 'pixel') {
    drawPixelTexture(context, px, py, pw, ph, size);
  }

  context.shadowBlur = 0;
  context.globalAlpha = 1;
}

function drawGrid() {
  const neon = currentSkin === 'neon';
  ctx.save();
  if (neon) {
    ctx.strokeStyle = NEON_ACCENT;
    ctx.lineWidth = 0.75;
    ctx.shadowBlur = 4;
    ctx.shadowColor = NEON_ACCENT;
    ctx.globalAlpha = 0.35;
  } else {
    ctx.strokeStyle = gridLineColor;
    ctx.lineWidth = 0.5;
  }
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPowerupOverlay(context, piece, size, offX, offY) {
  if (!piece.powerup) return;
  const { minR, maxR, minC, maxC } = pieceBounds(piece);
  const w = (maxC - minC + 1) * size;
  const h = (maxR - minR + 1) * size;
  const x = (offX + minC) * size;
  const y = (offY + minR) * size;
  context.save();
  context.strokeStyle = '#fff176';
  context.lineWidth = 2;
  context.strokeRect(x + 1, y + 1, w - 2, h - 2);
  context.font = `${Math.floor(size * 0.9)}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(POWERUPS[piece.powerup].icon, x + w / 2, y + h / 2 + 1);
  context.restore();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);

  drawPowerupOverlay(ctx, current, BLOCK, current.x, current.y);

  if (freezeUntil && performance.now() < freezeUntil) {
    ctx.save();
    ctx.fillStyle = 'rgba(129, 199, 255, 0.15)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#81d4fa';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('❄ CONGELADO', canvas.width / 2, 24);
    ctx.restore();
  }
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
  drawPowerupOverlay(nextCtx, next, NB, offX, offY);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
  gridLineColor = getComputedStyle(document.body).getPropertyValue('--grid-line').trim();
  themeToggleBtn.textContent = theme === 'light' ? '☀️ Claro' : '🌙 Oscuro';
  localStorage.setItem(THEME_KEY, theme);
}

function toggleTheme() {
  const isLight = document.body.classList.contains('light');
  applyTheme(isLight ? 'dark' : 'light');
}

function applySkin(skin) {
  currentSkin = SKIN_NAMES.includes(skin) ? skin : 'retro';
  skinSelect.value = currentSkin;
  localStorage.setItem(SKIN_KEY, currentSkin);
}

function handleSkinChange() {
  applySkin(skinSelect.value);
  // Redraw immediately so the change is visible without waiting on the RAF loop
  // (which is stopped while paused or after game over).
  if (next) drawNext();
  if ((paused || gameOver) && current) draw();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (gameOver) return;
  const dt = ts - lastTime;
  lastTime = ts;
  if (freezeUntil && ts < freezeUntil) {
    dropAccum = 0;
  } else {
    dropAccum += dt;
    if (dropAccum >= dropInterval) {
      dropAccum = 0;
      if (!collide(current.shape, current.x, current.y + 1)) {
        current.y++;
      } else {
        lockPiece();
      }
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
  applySkin(localStorage.getItem(SKIN_KEY) || 'retro');
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  linesUntilPowerup = POWERUP_LINE_INTERVAL;
  freezeUntil = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
themeToggleBtn.addEventListener('click', toggleTheme);
skinSelect.addEventListener('change', handleSkinChange);

init();
