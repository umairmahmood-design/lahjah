/**
 * OCR utility for UI text annotations.
 *
 * Two-phase strategy:
 *
 * Phase 1 — Full-image pre-scan (runs once per screenshot after upload):
 *   Run Tesseract on the complete screenshot with PSM AUTO to detect all
 *   text regions and their bounding boxes. Results are cached per URL.
 *   When the designer draws an annotation, we find which pre-detected words
 *   overlap with the drawn rectangle and join their text — accurate even for
 *   tight selections because OCR ran on the full high-quality image.
 *
 * Phase 2 — Per-crop fallback (runs if the pre-scan has no overlapping words):
 *   Crop the annotation region, upscale 3×, apply Otsu thresholding, and
 *   run Tesseract with PSM SINGLE_BLOCK. Used when the pre-scan hasn't
 *   finished yet or when it detected no text in the region.
 */

import Tesseract from "tesseract.js";

// ── Shared cached worker ─────────────────────────────────────────────────────
// One worker is created on first use and reused for every subsequent call.
// Language data is downloaded once and cached by the browser.

let workerPromise: Promise<Tesseract.Worker> | null = null;

function getWorker(): Promise<Tesseract.Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      try {
        const worker = await Tesseract.createWorker(
          "eng+ara",
          Tesseract.OEM.LSTM_ONLY,
        );
        // Default PSM for per-crop recognition
        await worker.setParameters({
          tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
        });
        return worker;
      } catch (err) {
        workerPromise = null; // allow retry
        throw err;
      }
    })();
  }
  return workerPromise;
}

// ── Types ────────────────────────────────────────────────────────────────────

/** A single word detected by Tesseract, with coordinates normalised to 0–1. */
export interface WordData {
  text: string;
  x: number; // left edge, 0–1 relative to image width
  y: number; // top edge, 0–1 relative to image height
  w: number; // width, 0–1
  h: number; // height, 0–1
  confidence: number;
}

// ── Phase 1: Full-image scan ─────────────────────────────────────────────────

/**
 * Fetch a screenshot (via the server-side proxy to avoid CORS), run Tesseract
 * on the full image with PSM AUTO, and return all detected words with their
 * bounding boxes normalised to 0–1 coordinates.
 *
 * PSM is temporarily switched to AUTO for this call and restored to SINGLE_BLOCK
 * afterward. Both jobs are queued sequentially so no per-crop call is affected.
 */
export async function scanScreenshot(screenshotUrl: string): Promise<WordData[]> {
  try {
    const response = await fetch(
      `/api/proxy-image?url=${encodeURIComponent(screenshotUrl)}`,
    );
    if (!response.ok) return [];
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Image load failed"));
      el.src = blobUrl;
    });
    URL.revokeObjectURL(blobUrl);

    // Draw full image to canvas at natural resolution (no upscaling for full scan)
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return [];
    ctx.drawImage(img, 0, 0);

    const nw = img.naturalWidth;
    const nh = img.naturalHeight;

    const worker = await getWorker();

    // Switch to PSM AUTO for full-page layout detection
    await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.AUTO });
    const { data } = await worker.recognize(canvas, {}, { blocks: true });
    // Restore default PSM for subsequent per-crop calls
    await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK });

    // Flatten block → paragraph → line → word hierarchy
    const words: WordData[] = [];
    for (const block of data.blocks ?? []) {
      for (const para of block.paragraphs) {
        for (const line of para.lines) {
          for (const word of line.words) {
            if (!word.text.trim() || word.confidence < 30) continue;
            words.push({
              text: word.text.trim(),
              x: word.bbox.x0 / nw,
              y: word.bbox.y0 / nh,
              w: (word.bbox.x1 - word.bbox.x0) / nw,
              h: (word.bbox.y1 - word.bbox.y0) / nh,
              confidence: word.confidence,
            });
          }
        }
      }
    }

    console.log(`[OCR pre-scan] ${screenshotUrl.slice(-40)}: ${words.length} words detected`);
    return words;
  } catch (err) {
    console.error("[OCR pre-scan] Failed:", err);
    return [];
  }
}

// ── Word-to-annotation matching ──────────────────────────────────────────────

/**
 * Find all pre-scanned words that substantially overlap with an annotation
 * rectangle, then join them into a readable string preserving line breaks.
 *
 * A word is included if at least 40% of its area falls inside the rect.
 * Words are grouped into lines by Y-center proximity, then sorted left-to-right.
 */
export function findOverlappingText(
  words: WordData[],
  rect: { x: number; y: number; width: number; height: number },
): string {
  const matching = words.filter((word) => {
    const overlapX =
      Math.min(word.x + word.w, rect.x + rect.width) - Math.max(word.x, rect.x);
    const overlapY =
      Math.min(word.y + word.h, rect.y + rect.height) - Math.max(word.y, rect.y);
    if (overlapX <= 0 || overlapY <= 0) return false;
    const wordArea = word.w * word.h;
    return wordArea > 0 && (overlapX * overlapY) / wordArea >= 0.4;
  });

  if (matching.length === 0) return "";

  // Sort by Y center then X
  matching.sort((a, b) => {
    const dy = (a.y + a.h / 2) - (b.y + b.h / 2);
    if (Math.abs(dy) < 0.015) return a.x - b.x; // same line → left to right
    return dy;
  });

  // Group into lines: words whose Y centers are within 60% of a word-height apart
  const lines: WordData[][] = [];
  let currentLine: WordData[] = [];
  let prevCenterY = -1;

  for (const word of matching) {
    const cy = word.y + word.h / 2;
    const threshold = word.h * 0.6;
    if (prevCenterY < 0 || Math.abs(cy - prevCenterY) <= threshold) {
      currentLine.push(word);
    } else {
      if (currentLine.length) lines.push(currentLine);
      currentLine = [word];
    }
    prevCenterY = cy;
  }
  if (currentLine.length) lines.push(currentLine);

  return lines.map((line) => line.map((w) => w.text).join(" ")).join("\n");
}

// ── Phase 2: Per-crop fallback ───────────────────────────────────────────────

/**
 * Preprocess a cropped canvas for better OCR accuracy on small UI text:
 * upscale 3×, grayscale, Otsu thresholding, auto-invert for dark backgrounds.
 */
function preprocessForOCR(source: HTMLCanvasElement): HTMLCanvasElement {
  const SCALE = 3;
  const out = document.createElement("canvas");
  out.width = source.width * SCALE;
  out.height = source.height * SCALE;

  const ctx = out.getContext("2d", { willReadFrequently: true });
  if (!ctx) return source;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, out.width, out.height);

  const imageData = ctx.getImageData(0, 0, out.width, out.height);
  const data = imageData.data;
  const pixelCount = out.width * out.height;

  // Grayscale + histogram
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = data[i + 1] = data[i + 2] = gray;
    histogram[gray]++;
  }

  // Otsu's method
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];
  let sumB = 0, wB = 0, maxVar = 0, threshold = 128;
  for (let i = 0; i < 256; i++) {
    wB += histogram[i];
    if (wB === 0) continue;
    const wF = pixelCount - wB;
    if (wF === 0) break;
    sumB += i * histogram[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) ** 2;
    if (v > maxVar) { maxVar = v; threshold = i; }
  }

  // Threshold → black/white, count black pixels
  let blackCount = 0;
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i] > threshold ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = v;
    if (v === 0) blackCount++;
  }

  // Invert if background is dark (>55% black = light text on dark bg)
  if (blackCount / pixelCount > 0.55) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = data[i + 1] = data[i + 2] = 255 - data[i];
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return out;
}

/**
 * Run OCR on a pre-cropped canvas using the fallback pipeline.
 * Applies 3× upscale + Otsu thresholding before recognition.
 */
export async function recognizeText(croppedCanvas: HTMLCanvasElement): Promise<string> {
  const processed = preprocessForOCR(croppedCanvas);
  const worker = await getWorker();
  const { data } = await worker.recognize(processed);
  return data.text.trim();
}
