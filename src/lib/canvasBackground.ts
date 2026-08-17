import type { CanvasBackgroundImageFit } from "@/types/race"

export interface BackgroundImageDestRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Destination rect for drawing a background image onto a canvas.
 * `cover` fills the canvas (crop the overflow); `contain` fits inside
 * (letterbox leftover stays the base color underneath).
 */
export function backgroundImageDestRect(
  imageWidth: number,
  imageHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  fit: CanvasBackgroundImageFit
): BackgroundImageDestRect {
  if (imageWidth <= 0 || imageHeight <= 0) {
    return { x: 0, y: 0, width: canvasWidth, height: canvasHeight }
  }

  const scale =
    fit === "cover"
      ? Math.max(canvasWidth / imageWidth, canvasHeight / imageHeight)
      : Math.min(canvasWidth / imageWidth, canvasHeight / imageHeight)

  const width = imageWidth * scale
  const height = imageHeight * scale

  return {
    x: (canvasWidth - width) / 2,
    y: (canvasHeight - height) / 2,
    width,
    height,
  }
}
