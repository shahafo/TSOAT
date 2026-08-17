export type AggregationMode = "count" | "sum"

export const DEFAULT_TOP_N = 10

export interface RaceFilter {
  column: string
  value: string
}

/** What gets computed: the questions asked of the event stream. */
export interface RaceInit {
  name: string
  /** MVP: single-column equality. Extensible later. */
  filter: RaceFilter | null
  barDimensionColumn: string
  aggregationMode: AggregationMode
  /** Required when `aggregationMode` is `sum`. Ignored for `count`. */
  valueColumn: string | null
  /**
   * Display label only. Playback order always follows the conventional
   * `keyframe` column, which is never stored here.
   */
  timelineLabelColumn: string
  /**
   * Bar-dimension values (after merge) that are dropped entirely.
   * Excluding a merge target also drops every source merged into it.
   */
  excludedValues: string[]
  /**
   * Post-merge value → display name. One-to-one only — not a merge
   * mechanism. Duplicate display names from distinct values are an error.
   */
  valueAliases: Record<string, string>
  /**
   * Raw source value → raw target value. Flat only: no chains or cycles.
   */
  mergeMap: Record<string, string>
}

/** Fill in dimension-filter fields missing from older stored configs. */
export function normalizeRaceInit(init: RaceInit): RaceInit {
  return {
    ...init,
    excludedValues: init.excludedValues ?? [],
    valueAliases: init.valueAliases ?? {},
    mergeMap: init.mergeMap ?? {},
    valueColumn: init.valueColumn ?? null,
  }
}

/** How the computed result is presented. Never affects compute. */
export type ColorMode = "uniform" | "auto"
export type LabelPosition = "inside" | "outside"
export type NumberFormat = "raw" | "comma" | "abbreviated"
export type CanvasBackgroundBaseColor = "black" | "white"
export type CanvasBackgroundImageFit = "cover" | "contain"

export interface CanvasBackgroundImage {
  enabled: boolean
  /** Key in the `backgroundImages` IndexedDB store. */
  imageId: string | null
  fit: CanvasBackgroundImageFit
  /** 0–1. Drawn over `baseColor` via `globalAlpha`. */
  opacity: number
}

export interface CanvasBackground {
  baseColor: CanvasBackgroundBaseColor
  image: CanvasBackgroundImage
}

/** Pre-layering shape: exclusive `mode` instead of base color + overlay. */
interface LegacyCanvasBackground {
  mode?: "black" | "white" | "image"
  imageId?: string | null
  imageFit?: CanvasBackgroundImageFit
  baseColor?: CanvasBackgroundBaseColor
  image?: Partial<CanvasBackgroundImage>
}

export const DEFAULT_BAR_SCALE_EXPONENT = 1
/** Below this, a power scale is too steep to be useful. */
export const MIN_BAR_SCALE_EXPONENT = 0.05

export function clampBarScaleExponent(exponent: number): number {
  if (!Number.isFinite(exponent) || exponent <= 0) {
    return DEFAULT_BAR_SCALE_EXPONENT
  }

  return Math.max(MIN_BAR_SCALE_EXPONENT, exponent)
}

export interface RaceFont {
  family: string
  sizePx: number
  color: string
  bold: boolean
}

export interface RaceAnimation {
  /** Total playback length, including the end freeze. */
  durationSeconds: number
}

export interface RaceGlowEffect {
  enabled: boolean
}

/** Render-only transform of the raw timeline-column value. */
export interface TimelineLabelFormat {
  enabled: boolean
  /** Regex with capture groups, e.g. `s(\\d+)_e(\\d+)`. */
  pattern: string
  /** Display string with `{1}`, `{2}`, … placeholders. */
  template: string
  stripLeadingZeros: boolean
}

export const DEFAULT_DURATION_SECONDS = 28

export function clampDurationSeconds(value: number): number {
  if (!Number.isFinite(value) || value < 1) {
    return DEFAULT_DURATION_SECONDS
  }

  return Math.max(1, Math.round(value))
}

export interface RaceDesign {
  topN: number
  /**
   * Power-scale exponent for bar width. 1 is linear (the original mapping).
   * Values below 1 compress the gap between the leader and the tail.
   */
  barScaleExponent: number
  colorMode: ColorMode
  /** Hex bar color when `colorMode` is `uniform`. Ignored in `auto`. */
  uniformColor: string
  labelFont: RaceFont
  valueFont: RaceFont
  /** Clock / episode label above the bars. */
  timelineFont: RaceFont
  timelineLabelFormat: TimelineLabelFormat
  labelPosition: LabelPosition
  numberFormat: NumberFormat
  canvasPaddingPx: number
  rowHeightPx: number
  rowGapPx: number
  barCornerRadiusPx: number
  animation: RaceAnimation
  canvasBackground: CanvasBackground
  glowEffect: RaceGlowEffect
}

export const DEFAULT_RACE_FONT: RaceFont = {
  family: "system-ui",
  sizePx: 14,
  color: "#f8fafc",
  bold: false,
}

export const DEFAULT_TIMELINE_FONT: RaceFont = {
  family: "system-ui",
  sizePx: 28,
  color: "#f8fafc",
  bold: false,
}

export const DEFAULT_TIMELINE_LABEL_FORMAT: TimelineLabelFormat = {
  enabled: false,
  pattern: "",
  template: "",
  stripLeadingZeros: true,
}

export const DEFAULT_CANVAS_BACKGROUND_OPACITY = 0.15

export function clampCanvasBackgroundOpacity(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_CANVAS_BACKGROUND_OPACITY
  }

  return Math.min(1, Math.max(0, value))
}

export const DEFAULT_CANVAS_BACKGROUND_IMAGE: CanvasBackgroundImage = {
  enabled: false,
  imageId: null,
  fit: "cover",
  opacity: DEFAULT_CANVAS_BACKGROUND_OPACITY,
}

export const DEFAULT_CANVAS_BACKGROUND: CanvasBackground = {
  baseColor: "black",
  image: { ...DEFAULT_CANVAS_BACKGROUND_IMAGE },
}

function cloneCanvasBackground(value: CanvasBackground): CanvasBackground {
  return {
    baseColor: value.baseColor,
    image: { ...value.image },
  }
}

/** Map stored `canvasBackground` (current or exclusive-mode) onto the layered shape. */
export function normalizeCanvasBackground(
  raw?: CanvasBackground | LegacyCanvasBackground | null
): CanvasBackground {
  if (raw == null) {
    return cloneCanvasBackground(DEFAULT_CANVAS_BACKGROUND)
  }

  const legacy =
    "mode" in raw
      ? {
          mode: raw.mode,
          imageId: raw.imageId,
          imageFit: raw.imageFit,
        }
      : null

  if (legacy?.mode === "image") {
    return {
      baseColor: "black",
      image: {
        enabled: true,
        imageId: typeof legacy.imageId === "string" ? legacy.imageId : null,
        fit: legacy.imageFit === "contain" ? "contain" : "cover",
        opacity: 1,
      },
    }
  }

  if (legacy?.mode === "white" || legacy?.mode === "black") {
    return {
      baseColor: legacy.mode,
      image: {
        enabled: false,
        imageId: typeof legacy.imageId === "string" ? legacy.imageId : null,
        fit: legacy.imageFit === "contain" ? "contain" : "cover",
        opacity: DEFAULT_CANVAS_BACKGROUND_OPACITY,
      },
    }
  }

  const imageRaw = raw.image ?? {}

  return {
    baseColor: raw.baseColor === "white" ? "white" : "black",
    image: {
      enabled:
        typeof imageRaw.enabled === "boolean"
          ? imageRaw.enabled
          : DEFAULT_CANVAS_BACKGROUND_IMAGE.enabled,
      imageId:
        imageRaw.imageId === undefined
          ? DEFAULT_CANVAS_BACKGROUND_IMAGE.imageId
          : typeof imageRaw.imageId === "string"
            ? imageRaw.imageId
            : null,
      fit: imageRaw.fit === "contain" ? "contain" : "cover",
      opacity: clampCanvasBackgroundOpacity(
        imageRaw.opacity ?? DEFAULT_CANVAS_BACKGROUND_OPACITY
      ),
    },
  }
}

export const DEFAULT_GLOW_EFFECT: RaceGlowEffect = {
  enabled: true,
}

export const DEFAULT_RACE_DESIGN: RaceDesign = {
  topN: DEFAULT_TOP_N,
  barScaleExponent: DEFAULT_BAR_SCALE_EXPONENT,
  colorMode: "auto",
  uniformColor: "#3b82f6",
  labelFont: { ...DEFAULT_RACE_FONT },
  valueFont: { ...DEFAULT_RACE_FONT },
  timelineFont: { ...DEFAULT_TIMELINE_FONT },
  timelineLabelFormat: { ...DEFAULT_TIMELINE_LABEL_FORMAT },
  labelPosition: "inside",
  numberFormat: "comma",
  canvasPaddingPx: 16,
  rowHeightPx: 28,
  rowGapPx: 8,
  barCornerRadiusPx: 4,
  animation: { durationSeconds: DEFAULT_DURATION_SECONDS },
  canvasBackground: cloneCanvasBackground(DEFAULT_CANVAS_BACKGROUND),
  glowEffect: { ...DEFAULT_GLOW_EFFECT },
}

/** Fill in presentation fields missing from older stored configs. */
export function normalizeRaceDesign(design: RaceDesign): RaceDesign {
  return {
    ...DEFAULT_RACE_DESIGN,
    ...design,
    topN: design.topN ?? DEFAULT_RACE_DESIGN.topN,
    barScaleExponent: clampBarScaleExponent(
      design.barScaleExponent ?? DEFAULT_RACE_DESIGN.barScaleExponent
    ),
    labelFont: { ...DEFAULT_RACE_DESIGN.labelFont, ...design.labelFont },
    valueFont: { ...DEFAULT_RACE_DESIGN.valueFont, ...design.valueFont },
    timelineFont: {
      ...DEFAULT_RACE_DESIGN.timelineFont,
      ...design.timelineFont,
    },
    timelineLabelFormat: {
      ...DEFAULT_RACE_DESIGN.timelineLabelFormat,
      ...design.timelineLabelFormat,
    },
    animation: {
      ...DEFAULT_RACE_DESIGN.animation,
      ...design.animation,
      durationSeconds: clampDurationSeconds(
        design.animation?.durationSeconds ??
          DEFAULT_RACE_DESIGN.animation.durationSeconds
      ),
    },
    canvasBackground: normalizeCanvasBackground(design.canvasBackground),
    glowEffect: {
      ...DEFAULT_RACE_DESIGN.glowEffect,
      ...design.glowEffect,
    },
  }
}

export interface RaceConfig {
  id: string
  projectId: string
  createdAt: number
  init: RaceInit
  design: RaceDesign
}
