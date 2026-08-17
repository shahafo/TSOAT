import { backgroundImageDestRect } from "@/lib/canvasBackground"
import { barScaleMaxValue, scaleBarWidthPx } from "@/lib/raceBarScale"
import type { RaceBar } from "@/lib/raceCompute"
import { cssFont, FALLBACK_AUTO_COLOR, formatRaceNumber } from "@/lib/raceDesign"
import { getGlowIntensity } from "@/lib/raceGlow"
import { formatTimelineLabel } from "@/lib/timelineLabelFormat"
import {
  clampCanvasBackgroundOpacity,
  normalizeRaceDesign,
  type RaceDesign,
  type RaceFont,
} from "@/types/race"

const CANVAS_BACKGROUND_BLACK = "#000000"
const CANVAS_BACKGROUND_WHITE = "#ffffff"
const GAP_PX = 8
const INNER_PADDING_MIN_PX = 6
/** Canvas2D shadowBlur for an active bar at full glow intensity. */
const GLOW_BASE_BLUR = 20

/** Design px values and safe-zone ratios are specified against this frame. */
export const REFERENCE_FRAME_WIDTH = 1080
export const REFERENCE_FRAME_HEIGHT = 1920

/** @deprecated Use REFERENCE_FRAME_WIDTH. Kept as an alias. */
export const EXPORT_FRAME_WIDTH = REFERENCE_FRAME_WIDTH
/** @deprecated Use REFERENCE_FRAME_HEIGHT. Kept as an alias. */
export const EXPORT_FRAME_HEIGHT = REFERENCE_FRAME_HEIGHT

/**
 * Instagram Reels best-practice insets as fractions of the reference frame.
 * Not in the UI — same class of internal constant as `FREEZE_SECONDS`.
 */
export const SAFE_ZONE_RATIO = {
  top: 400 / REFERENCE_FRAME_HEIGHT,
  bottom: 250 / REFERENCE_FRAME_HEIGHT,
  right: 150 / REFERENCE_FRAME_WIDTH,
  left: 60 / REFERENCE_FRAME_WIDTH,
} as const

export interface ScaledSafeZone {
  top: number
  bottom: number
  right: number
  left: number
}

export function layoutScale(width: number, height: number): {
  x: number
  y: number
} {
  return {
    x: width / REFERENCE_FRAME_WIDTH,
    y: height / REFERENCE_FRAME_HEIGHT,
  }
}

/**
 * Bitmap size for a CSS box. Width/height are even because H.264 WebCodecs
 * (yuv420) rejects odd frame dimensions.
 */
export function evenBackingStoreSize(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number
): { width: number; height: number } {
  const even = (value: number) => {
    const rounded = Math.max(2, Math.round(value))
    return rounded - (rounded % 2)
  }

  return {
    width: even(cssWidth * devicePixelRatio),
    height: even(cssHeight * devicePixelRatio),
  }
}

function scaledFont(font: RaceFont, scale: number): RaceFont {
  return { ...font, sizePx: font.sizePx * scale }
}

/** Safe-zone insets in CSS pixels for the current canvas size. */
export function scaleSafeZone(
  width: number,
  height: number
): ScaledSafeZone {
  return {
    top: SAFE_ZONE_RATIO.top * height,
    bottom: SAFE_ZONE_RATIO.bottom * height,
    left: SAFE_ZONE_RATIO.left * width,
    right: SAFE_ZONE_RATIO.right * width,
  }
}

export interface ContentRect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

/**
 * Drawable rect: scaled safe zone, then padding inside it.
 * All bar/text layout uses this, never the full frame.
 */
export function contentRectFromCanvas(
  width: number,
  height: number,
  paddingX: number,
  paddingY: number = paddingX
): { safe: ScaledSafeZone; content: ContentRect } {
  const safe = scaleSafeZone(width, height)
  const left = safe.left + paddingX
  const top = safe.top + paddingY
  const right = width - safe.right - paddingX
  const bottom = height - safe.bottom - paddingY

  return {
    safe,
    content: {
      left,
      top,
      right,
      bottom,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    },
  }
}

export function resolveLabelPlacement(
  ctx: CanvasRenderingContext2D,
  label: string,
  barWidthPx: number,
  innerPaddingPx: number
): { position: "inside" | "outside"; labelWidthPx: number } {
  // Caller must set ctx.font to the label font before this — measured width
  // depends on the current font. Never cache the result across frames.
  const labelWidthPx = ctx.measureText(label).width
  const fitsInside = labelWidthPx + innerPaddingPx * 2 <= barWidthPx

  return {
    position: fitsInside ? "inside" : "outside",
    labelWidthPx,
  }
}

function ellipsizeLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidthPx: number
): string {
  if (maxWidthPx <= 0) {
    return ""
  }

  if (ctx.measureText(text).width <= maxWidthPx) {
    return text
  }

  const ellipsis = "..."

  if (ctx.measureText(ellipsis).width > maxWidthPx) {
    return ""
  }

  let low = 0
  let high = text.length
  let best = ellipsis

  while (low <= high) {
    const mid = (low + high) >> 1
    const candidate = text.slice(0, mid) + ellipsis

    if (ctx.measureText(candidate).width <= maxWidthPx) {
      best = candidate
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return best
}

/**
 * Draws a single static frame. Y comes from `continuousRank` (not a
 * re-sort of this frame). Top N is `continuousRank < topN`. Colors come
 * from the compute-time label map, never from the current rank.
 */
export function renderRaceFrame(
  canvas: HTMLCanvasElement,
  bars: RaceBar[],
  design: RaceDesign,
  devicePixelRatio: number,
  colorAssignments: Record<string, string>,
  options?: {
    showSafeZoneGuides?: boolean
    timelineLabel?: string
    backgroundImage?: HTMLImageElement | null
    elapsedSeconds?: number
  }
): void {
  const ctx = canvas.getContext("2d")

  if (!ctx) {
    return
  }

  const resolved = normalizeRaceDesign(design)
  const width = canvas.width / devicePixelRatio
  const height = canvas.height / devicePixelRatio
  const scale = layoutScale(width, height)
  const gapPx = GAP_PX * scale.x
  const { safe, content } = contentRectFromCanvas(
    width,
    height,
    resolved.canvasPaddingPx * scale.x,
    resolved.canvasPaddingPx * scale.y
  )

  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
  ctx.clearRect(0, 0, width, height)

  const background = resolved.canvasBackground
  ctx.fillStyle =
    background.baseColor === "white"
      ? CANVAS_BACKGROUND_WHITE
      : CANVAS_BACKGROUND_BLACK
  ctx.fillRect(0, 0, width, height)

  const overlay = background.image
  const backgroundImage = options?.backgroundImage
  if (
    overlay.enabled &&
    backgroundImage &&
    backgroundImage.complete &&
    backgroundImage.naturalWidth > 0 &&
    backgroundImage.naturalHeight > 0
  ) {
    const dest = backgroundImageDestRect(
      backgroundImage.naturalWidth,
      backgroundImage.naturalHeight,
      width,
      height,
      overlay.fit
    )
    ctx.globalAlpha = clampCanvasBackgroundOpacity(overlay.opacity)
    try {
      ctx.drawImage(backgroundImage, dest.x, dest.y, dest.width, dest.height)
    } finally {
      ctx.globalAlpha = 1
    }
  }

  const topN = Math.max(1, resolved.topN)
  const visible = bars.filter((bar) => bar.continuousRank < topN)
  const maxValue = barScaleMaxValue(bars)

  if (visible.length > 0 && maxValue > 0 && content.width > 0 && content.height > 0) {
    const rowHeight = resolved.rowHeightPx * scale.y
    const rowGap = resolved.rowGapPx * scale.y
    const stride = rowHeight + rowGap
    const innerWidth = content.width
    const canvasRight = content.right
    const groupHeight =
      topN * rowHeight + Math.max(0, topN - 1) * rowGap
    const originY = content.bottom - groupHeight

    ctx.save()
    ctx.beginPath()
    ctx.rect(
      safe.left,
      safe.top,
      Math.max(0, width - safe.left - safe.right),
      Math.max(0, height - safe.top - safe.bottom)
    )
    ctx.clip()

    ctx.textBaseline = "middle"

    const valueFont = scaledFont(resolved.valueFont, scale.y)
    const labelFont = scaledFont(resolved.labelFont, scale.y)
    ctx.font = cssFont(valueFont)
    const formattedValues = visible.map((bar) =>
      formatRaceNumber(bar.value, resolved.numberFormat)
    )
    const valueWidths = formattedValues.map((text) => ctx.measureText(text).width)
    const valueCol = Math.min(
      innerWidth * 0.28,
      Math.max(ctx.measureText("0").width, ...valueWidths)
    )

    const barMaxWidth = Math.max(1, innerWidth - gapPx - valueCol)
    const barX = content.left

    const paintOrder = visible
      .map((bar, index) => ({ bar, formatted: formattedValues[index], valueWidth: valueWidths[index] }))
      .sort((a, b) => b.bar.continuousRank - a.bar.continuousRank)

    paintOrder.forEach(({ bar, formatted, valueWidth }) => {
      const color =
        resolved.colorMode === "auto"
          ? (colorAssignments[bar.label] ?? FALLBACK_AUTO_COLOR)
          : resolved.uniformColor
      const top = originY + bar.continuousRank * stride
      const centerY = top + rowHeight / 2
      const barWidth = scaleBarWidthPx(
        bar.value,
        barMaxWidth,
        resolved.barScaleExponent,
        maxValue
      )
      const barEndX = barX + barWidth
      const radius = Math.min(
        Math.max(0, resolved.barCornerRadiusPx * scale.y),
        rowHeight / 2,
        barWidth / 2
      )
      const innerPaddingPx = Math.max(INNER_PADDING_MIN_PX * scale.x, radius)
      const glowEnabled =
        resolved.glowEffect.enabled && bar.isReceivingData

      ctx.fillStyle = color
      ctx.beginPath()
      ctx.roundRect(barX, top, barWidth, rowHeight, radius)
      if (glowEnabled) {
        ctx.shadowColor = color
        ctx.shadowBlur =
          GLOW_BASE_BLUR * scale.y * getGlowIntensity(options?.elapsedSeconds ?? 0)
      }
      try {
        ctx.fill()
      } finally {
        ctx.shadowBlur = 0
        ctx.shadowColor = "transparent"
      }

      ctx.font = cssFont(labelFont)
      const placement = resolveLabelPlacement(
        ctx,
        bar.label,
        barWidth,
        innerPaddingPx
      )
      const position =
        resolved.labelPosition === "outside" ? "outside" : placement.position

      let labelText = bar.label
      let labelWidthPx = placement.labelWidthPx
      let labelX: number
      let valueX: number

      if (position === "inside") {
        labelX = barX + innerPaddingPx
        valueX = barEndX + gapPx
      } else {
        const availableLabelWidth =
          canvasRight - barEndX - gapPx - gapPx - valueWidth

        if (labelWidthPx > availableLabelWidth) {
          labelText = ellipsizeLabel(ctx, bar.label, availableLabelWidth)
          labelWidthPx = ctx.measureText(labelText).width
        }

        labelX = barEndX + gapPx
        valueX = barEndX + gapPx + labelWidthPx + gapPx
      }

      ctx.fillStyle = resolved.labelFont.color
      ctx.textAlign = "left"
      ctx.fillText(labelText, labelX, centerY)

      ctx.font = cssFont(valueFont)
      ctx.fillStyle = resolved.valueFont.color
      ctx.textAlign = "left"
      ctx.fillText(formatted, valueX, centerY)
    })

    ctx.restore()
  }

  const rawTimelineLabel = options?.timelineLabel ?? ""
  const timelineLabel = formatTimelineLabel(
    rawTimelineLabel,
    resolved.timelineLabelFormat
  )
  if (timelineLabel !== "") {
    ctx.save()
    ctx.font = cssFont(scaledFont(resolved.timelineFont, scale.y))
    ctx.fillStyle = resolved.timelineFont.color
    ctx.textAlign = "right"
    ctx.textBaseline = "top"
    ctx.fillText(timelineLabel, width - safe.right, content.top)
    ctx.restore()
  }

  if (options?.showSafeZoneGuides) {
    drawSafeZoneGuides(ctx, width, height, safe, scale)
  }
}

function drawSafeZoneGuides(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  safe: ScaledSafeZone,
  scale: { x: number; y: number }
): void {
  const innerLeft = safe.left
  const innerTop = safe.top
  const innerWidth = Math.max(0, width - safe.left - safe.right)
  const innerHeight = Math.max(0, height - safe.top - safe.bottom)

  ctx.save()
  ctx.fillStyle = "rgba(255, 0, 0, 0.18)"
  ctx.fillRect(0, 0, width, innerTop)
  ctx.fillRect(0, innerTop + innerHeight, width, safe.bottom)
  ctx.fillRect(0, innerTop, innerLeft, innerHeight)
  ctx.fillRect(innerLeft + innerWidth, innerTop, safe.right, innerHeight)

  ctx.strokeStyle = "rgba(255, 40, 40, 0.9)"
  ctx.lineWidth = 2 * scale.y
  ctx.setLineDash([8 * scale.x, 5 * scale.x])
  ctx.strokeRect(innerLeft, innerTop, innerWidth, innerHeight)
  ctx.restore()
}
