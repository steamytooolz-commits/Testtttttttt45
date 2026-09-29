import 'server-only';

/** Shared upload-file security helpers (magic-byte sniffing, size guards). */

export const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export const JPEG_MAGIC = [0xff, 0xd8, 0xff];
export const GIF87A = 'GIF87a';
export const GIF89A = 'GIF89a';

function startsWith(bytes: Buffer, magic: number[]): boolean {
  return bytes.length >= magic.length && magic.every((b, i) => bytes[i] === b);
}

/**
 * Detect the real MIME type of an image upload from its magic bytes.
 * Returns null for anything that is not PNG/JPEG/GIF/WEBP.
 */
export function sniffImageMime(buffer: Buffer): string | null {
  if (startsWith(buffer, PNG_MAGIC)) return 'image/png';
  if (startsWith(buffer, JPEG_MAGIC)) return 'image/jpeg';
  const head = buffer.subarray(0, 6).toString('ascii');
  if (head === GIF87A || head === GIF89A) return 'image/gif';
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/** Accept a declared MIME type only if the bytes agree (blocks disguised uploads). */
export function imageMimeMatches(buffer: Buffer, declaredMime: string): boolean {
  const sniffed = sniffImageMime(buffer);
  return sniffed !== null && sniffed === declaredMime;
}

/** Sanity clamp for upload sizes (bytes). */
export function isWithinSizeLimit(buffer: Buffer, maxBytes: number): boolean {
  return buffer.length > 0 && buffer.length <= maxBytes;
}
