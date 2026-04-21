/**
 * OCR utility for UI text annotations.
 *
 * Strategy:
 *   1. Scale the cropped canvas up 3× — Tesseract accuracy improves significantly on larger images
 *   2. Convert to grayscale
 *   3. Apply Otsu's method to find the optimal threshold → pure black/white image
 *   4. Invert if background is dark (handles white-text-on-dark-button)
 *   5. Run Tesseract with a cached LSTM_ONLY worker (PSM 6 — single uniform block)
 *
 * A single worker is created on first use and reused for every subsequent call.
 * This avoids downloading language data files more than once per session.
 */

import Tesseract from "tesseract.js";

// Module-level worker cache — one instance shared across the whole session.
let workerPromise: Promise<Tesseract.Worker> | null = null;

function getWorker(): Promise<Tesseract.Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      try {
        const worker = await Tesseract.createWorker(
          "eng+ara",
          Tesseract.OEM.LSTM_ONLY,
        );
        await worker.setParameters({
          // PSM 6: single uniform block — handles 1-line and multi-line UI text
          tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
        });
        return worker;
      } catch (err) {
        // Allow retry if initialisation fails
        workerPromise = null;
        throw err;
      }
    })();
  }
  return workerPromise;
}

/**
 * Preprocess a cropped canvas for better OCR on UI text.
 * Returns a new canvas — the original is not mutated.
 */
function preprocessForOCR(source: HTMLCanvasElement): HTMLCanvasElement {
  const SCALE = 3;
  const out = document.createElement("canvas");
  out.width = source.width * SCALE;
  out.height = source.height * SCALE;

  const ctx = out.getContext("2d", { willReadFrequently: true });
  if (!ctx) return source;

  // Step 1 — upscale with high-quality interpolation
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, out.width, out.height);

  const imageData = ctx.getImageData(0, 0, out.width, out.height);
  const data = imageData.data;
  const pixelCount = out.width * out.height;

  // Step 2 — convert to grayscale + build histogram for Otsu
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = data[i + 1] = data[i + 2] = gray;
    histogram[gray]++;
  }

  // Step 3 — Otsu's method: find the threshold that maximises inter-class variance
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];

  let sumB = 0, wB = 0, maxVariance = 0, threshold = 128;
  for (let i = 0; i < 256; i++) {
    wB += histogram[i];
    if (wB === 0) continue;
    const wF = pixelCount - wB;
    if (wF === 0) break;
    sumB += i * histogram[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const variance = wB * wF * (mB - mF) ** 2;
    if (variance > maxVariance) { maxVariance = variance; threshold = i; }
  }

  // Step 4 — apply threshold → pure black (0) or white (255)
  let blackCount = 0;
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i] > threshold ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = v;
    if (v === 0) blackCount++;
  }

  // Step 5 — if background is dark (>55% black pixels), invert so text is dark on white.
  // Tesseract's default expectation is dark text on a light background.
  if (blackCount / pixelCount > 0.55) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = data[i + 1] = data[i + 2] = 255 - data[i];
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return out;
}

/**
 * Run OCR on a pre-cropped canvas.
 * Applies preprocessing automatically. Returns extracted text or "" on failure.
 */
export async function recognizeText(croppedCanvas: HTMLCanvasElement): Promise<string> {
  const processed = preprocessForOCR(croppedCanvas);
  const worker = await getWorker();
  const { data } = await worker.recognize(processed);
  return data.text.trim();
}
