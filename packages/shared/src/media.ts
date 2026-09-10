/**
 * Header image validation for WhatsApp template messages.
 *
 * Meta will not accept a URL for a template header at registration time — it
 * wants a *handle* produced by its resumable upload API, and it rejects the
 * whole template if the image is wrong. Its rejection arrives after a review
 * cycle, so everything checkable is checked here first.
 *
 * Deliberately reads the real bytes rather than trusting a Content-Type header:
 * a client can label a PDF as image/png, and Meta will not be fooled.
 */

export const HEADER_IMAGE = {
  /** Meta's ceiling for template header images. */
  maxBytes: 5 * 1024 * 1024,
  /** Meta accepts only these two for image headers. */
  allowedMimeTypes: ["image/jpeg", "image/png"] as const,
  /** What WhatsApp renders a template header at. */
  recommendedAspect: 1.91,
  /** Anything narrower or wider than this gets visibly cropped in the bubble. */
  aspectTolerance: 0.35,
  minWidth: 300,
} as const;

export type HeaderImageMime = (typeof HEADER_IMAGE.allowedMimeTypes)[number];

export interface ImageInfo {
  mimeType: HeaderImageMime;
  width: number;
  height: number;
  bytes: number;
}

export interface MediaProblem {
  code:
    | "empty"
    | "too_large"
    | "unsupported_type"
    | "corrupt"
    | "too_small"
    | "bad_aspect";
  message: string;
  /** False for things a merchant can safely ignore, like a slight crop. */
  blocking: boolean;
}

/** PNG: an 8-byte signature, then IHDR carries width and height as big-endian u32. */
function readPngSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 24) return null;
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!sig.every((v, i) => b[i] === v)) return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * JPEG: walk the marker segments to a Start-Of-Frame, which is where the real
 * dimensions live. There is no fixed offset — the number and size of preceding
 * segments (EXIF, colour profiles, thumbnails) varies per encoder.
 */
function readJpegSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let offset = 2;

  while (offset + 9 < b.length) {
    if (b[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = b[offset + 1];

    /* Padding and standalone markers carry no length field. */
    if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }

    const segmentLength = view.getUint16(offset + 2);
    /* SOF0..SOF15, excluding DHT (c4), JPG (c8) and DAC (cc), which are not
       frame headers despite sitting in the same numeric range. */
    const isStartOfFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;

    if (isStartOfFrame) {
      return {
        height: view.getUint16(offset + 5),
        width: view.getUint16(offset + 7),
      };
    }
    if (segmentLength < 2) return null;
    offset += 2 + segmentLength;
  }
  return null;
}

/** Identify the file from its bytes, ignoring whatever the client claimed. */
export function inspectImage(bytes: Uint8Array): ImageInfo | null {
  const png = readPngSize(bytes);
  if (png) {
    return { mimeType: "image/png", ...png, bytes: bytes.length };
  }
  const jpeg = readJpegSize(bytes);
  if (jpeg) {
    return { mimeType: "image/jpeg", ...jpeg, bytes: bytes.length };
  }
  return null;
}

export function validateHeaderImage(bytes: Uint8Array): {
  info: ImageInfo | null;
  problems: MediaProblem[];
} {
  const problems: MediaProblem[] = [];

  if (!bytes.length) {
    return {
      info: null,
      problems: [{ code: "empty", message: "No image data was received.", blocking: true }],
    };
  }

  if (bytes.length > HEADER_IMAGE.maxBytes) {
    problems.push({
      code: "too_large",
      message: `Image is ${(bytes.length / 1024 / 1024).toFixed(1)} MB. WhatsApp's limit is 5 MB.`,
      blocking: true,
    });
  }

  const info = inspectImage(bytes);
  if (!info) {
    return {
      info: null,
      problems: [
        ...problems,
        {
          code: "corrupt",
          message:
            "This file is not a readable JPEG or PNG. WhatsApp accepts only those two for template headers.",
          blocking: true,
        },
      ],
    };
  }

  if (info.width < HEADER_IMAGE.minWidth) {
    problems.push({
      code: "too_small",
      message: `Image is ${info.width}px wide. Anything under ${HEADER_IMAGE.minWidth}px looks soft in the message.`,
      blocking: true,
    });
  }

  const aspect = info.width / info.height;
  if (Math.abs(aspect - HEADER_IMAGE.recommendedAspect) > HEADER_IMAGE.aspectTolerance) {
    /* Not blocking — WhatsApp crops rather than refuses, and a merchant may
       genuinely prefer their own framing. They should know it will be cropped. */
    problems.push({
      code: "bad_aspect",
      message:
        `Image is ${info.width}x${info.height} (${aspect.toFixed(2)}:1). WhatsApp renders header images ` +
        `at about 1.91:1, so this will be cropped top and bottom.`,
      blocking: false,
    });
  }

  return { info, problems };
}

export function isBlocked(problems: MediaProblem[]): boolean {
  return problems.some((p) => p.blocking);
}
