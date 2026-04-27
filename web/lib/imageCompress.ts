/**
 * Client-side image compression for receipt uploads (Phase 6.2).
 *
 * Scope: only re-encodes raster receipt photos. Always returns the *original*
 * File for non-images (PDF / XML / CFDI), tiny images already under the
 * threshold, browsers without canvas, and any unexpected failure. We never
 * block an upload over a compression error — the backend OCR can take the
 * larger original.
 *
 * Why a fixed 2048 long-edge / JPEG q=0.85: phone cameras shoot 12MP+ JPEGs
 * (~3-6 MB) where the OCR-relevant detail bottoms out around 200 dpi for a
 * receipt, so 2048 on the long edge is a generous floor. JPEG over PNG even
 * for screenshots — receipts don't need lossless and PNG of a photo can run
 * 4-5x bigger.
 */

const MAX_DIMENSION = 2048;
const MIN_BYTES_TO_COMPRESS = 512 * 1024; // 512 KB — under this just upload as-is
const QUALITY = 0.85;
const COMPRESSIBLE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function shouldSkip(file: File): boolean {
  if (typeof document === "undefined") return true; // SSR / node
  if (!file.type || !COMPRESSIBLE_TYPES.has(file.type.toLowerCase())) return true;
  if (file.size < MIN_BYTES_TO_COMPRESS) return true;
  // Don't recompress something the user might have already optimized.
  return false;
}

function loadImage(blobUrl: string, timeoutMs = 8000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => reject(new Error("image decode timed out")), timeoutMs);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error("image decode failed")); };
    img.src = blobUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), type, quality);
  });
}

/**
 * Returns a possibly-smaller File. On any failure falls back to the original.
 * Output filename is the original with extension swapped to `.jpg` when the
 * source was re-encoded as JPEG so the server doesn't see a `.png` containing
 * JPEG bytes.
 */
export async function compressImageFile(file: File): Promise<File> {
  if (shouldSkip(file)) return file;

  let url: string | null = null;
  try {
    url = URL.createObjectURL(file);
    const img = await loadImage(url);
    const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
    if (longEdge <= MAX_DIMENSION) return file;

    const scale = MAX_DIMENSION / longEdge;
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await canvasToBlob(canvas, "image/jpeg", QUALITY);
    if (!blob || blob.size >= file.size) return file; // never grow

    const newName = file.name.replace(/\.(png|webp|heic|heif|jpg|jpeg)$/i, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}
