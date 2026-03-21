// ─── Elements ────────────────────────────────────────────────
const video        = document.getElementById('videoEl');
const offscreen    = document.getElementById('offscreen');
const ditherCanvas = document.getElementById('ditherCanvas');
const ctx          = ditherCanvas.getContext('2d');
const offCtx       = offscreen.getContext('2d');
const permPrompt   = document.getElementById('permPrompt');
const authorizeBtn = document.getElementById('authorizeBtn');

// ─── Canvas Dimensions (set from native video resolution) ────
let W = 640;
let H = 480;

function syncCanvasSize() {
  if (video.videoWidth && video.videoHeight) {
    W = video.videoWidth;
    H = video.videoHeight;
  }
  ditherCanvas.width  = W;
  ditherCanvas.height = H;
  offscreen.width     = W;
  offscreen.height    = H;
}

// ─── Bayer 4×4 Ordered Dither Matrix ─────────────────────────
const BAYER_4 = [
   0,  8,  2, 10,
  12,  4, 14,  6,
   3, 11,  1,  9,
  15,  7, 13,  5,
];

// ─── Teal Phosphor Palette (dark → light) ────────────────────
const PALETTE = [
  [  5,  15,  14],
  [  0,  40,  38],
  [  0,  80,  72],
  [  0, 122, 110],
  [  0, 165, 148],
  [  0, 200, 178],
  [  0, 229, 204],
  [180, 240, 235],
];

// ─── Bayer Dither ─────────────────────────────────────────────
function applyBayerDither(imageData) {
  const src = imageData.data;
  const out = ctx.createImageData(W, H);
  const dst = out.data;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;

      const grey      = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
      const threshold = (BAYER_4[(y % 4) * 4 + (x % 4)] / 16) * 255;
      const dithered  = Math.min(255, grey + threshold * 0.35);
      const pIdx      = Math.floor((dithered / 255) * (PALETTE.length - 1));
      const [r, g, b] = PALETTE[pIdx];

      dst[i]     = r;
      dst[i + 1] = g;
      dst[i + 2] = b;
      dst[i + 3] = 255;
    }
  }

  return out;
}

// ─── Render Loop ──────────────────────────────────────────────
let rafId = null;

function renderFrame() {
  if (video.readyState >= 2) {
    offCtx.save();
    offCtx.translate(W, 0);
    offCtx.scale(-1, 1); // mirror horizontally
    offCtx.drawImage(video, 0, 0, W, H);
    offCtx.restore();

    ctx.putImageData(applyBayerDither(offCtx.getImageData(0, 0, W, H)), 0, 0);
  }

  rafId = requestAnimationFrame(renderFrame);
}

// ─── Camera Init ──────────────────────────────────────────────
async function initCam() {
  authorizeBtn.textContent = '[ INITIALIZING... ]';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width:  { ideal: 1280 },
        height: { ideal: 720 },
      },
    });

    video.srcObject = stream;

    video.addEventListener('loadedmetadata', () => {
      syncCanvasSize();
    }, { once: true });

    await video.play();

    syncCanvasSize();
    permPrompt.style.display = 'none';
    renderFrame();

  } catch (err) {
    console.error('Camera error:', err);
    permPrompt.querySelector('p').textContent =
      'CAMERA ACCESS\nDENIED.\nCHECK PERMISSIONS.';
    authorizeBtn.textContent = '[ RETRY ]';
  }
}

// Handle orientation / resize — re-sync if video is already running
window.addEventListener('resize', () => {
  if (video.readyState >= 2) syncCanvasSize();
});

authorizeBtn.addEventListener('click', initCam);

// ─── Status Cycling ───────────────────────────────────────────
const STATUSES  = ['ACTIVE ▮', 'SCANNING..', 'ACTIVE ▮', 'LINK OK ▮', 'ACTIVE ▮'];
let   statusIdx = 0;
const statusEl  = document.getElementById('statusValue');

setInterval(() => {
  statusEl.textContent = STATUSES[statusIdx++ % STATUSES.length];
}, 2200);