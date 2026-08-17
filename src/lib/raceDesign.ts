import type { NumberFormat, RaceFont } from "@/types/race"

/** HSL lightness below this (0–100) is blocked for text / uniform bar color. */
export const MIN_TEXT_LIGHTNESS = 15

export const COLOR_TOO_DARK_MESSAGE =
  "This color is too dark to be visible in the export."

const GOLDEN_ANGLE = 137.5
const AUTO_SATURATION = 65
const AUTO_LIGHTNESS = 55

/**
 * Deterministic bar color from rank in the full (pre-Top-N) ordering.
 * Golden-angle hue walk; saturation and lightness are fixed.
 */
export function getColorForRank(rankIndex: number): string {
  const hue = ((rankIndex * GOLDEN_ANGLE) % 360 + 360) % 360
  return `hsl(${hue}, ${AUTO_SATURATION}%, ${AUTO_LIGHTNESS}%)`
}

/** Fallback when a label is missing from the final-rank color map. */
export const FALLBACK_AUTO_COLOR = "#6b7280"

/**
 * Label → color from the *final* ranking only. Same value-desc / label-asc
 * tie-break as keyframe rank assignment. Call once per Compute, not per frame.
 * Never use interpolated `continuousRank` — colors stay pinned to the last
 * keyframe's order.
 */
export function buildColorAssignments(
  finalRanking: { label: string; value: number }[]
): Record<string, string> {
  const sorted = [...finalRanking].sort((a, b) => {
    const diff = b.value - a.value

    if (Math.abs(diff) <= 1e-9) {
      return a.label.localeCompare(b.label)
    }

    return diff
  })

  const assignments: Record<string, string> = {}

  for (let index = 0; index < sorted.length; index += 1) {
    assignments[sorted[index].label] = getColorForRank(index)
  }

  return assignments
}

export function parseHexColor(
  hex: string
): { r: number; g: number; b: number } | null {
  const raw = hex.trim()
  const short = /^#([0-9a-fA-F]{3})$/.exec(raw)
  if (short) {
    const [r, g, b] = short[1].split("")
    return {
      r: Number.parseInt(r + r, 16),
      g: Number.parseInt(g + g, 16),
      b: Number.parseInt(b + b, 16),
    }
  }

  const full = /^#([0-9a-fA-F]{6})$/.exec(raw)
  if (!full) {
    return null
  }

  return {
    r: Number.parseInt(full[1].slice(0, 2), 16),
    g: Number.parseInt(full[1].slice(2, 4), 16),
    b: Number.parseInt(full[1].slice(4, 6), 16),
  }
}

/** HSL lightness in 0–100 from a hex color. */
export function hexLightnessPercent(hex: string): number | null {
  const rgb = parseHexColor(hex)
  if (!rgb) {
    return null
  }

  const r = rgb.r / 255
  const g = rgb.g / 255
  const b = rgb.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return ((max + min) / 2) * 100
}

export function isColorTooDark(hex: string): boolean {
  const lightness = hexLightnessPercent(hex)
  return lightness !== null && lightness < MIN_TEXT_LIGHTNESS
}

/** Native `<input type="color">` requires 7-character #rrggbb. */
export function toColorInputValue(hex: string): string {
  const rgb = parseHexColor(hex)

  if (!rgb) {
    return "#ffffff"
  }

  const channel = (value: number) => value.toString(16).padStart(2, "0")
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`
}

export function formatRaceNumber(value: number, format: NumberFormat): string {
  // Round only at draw time. Playback interpolates continuous floats;
  // rounding mid-lerp would cause inconsistent digit jumps.
  const rounded = Math.round(value)

  if (format === "raw") {
    return String(rounded)
  }

  if (format === "comma") {
    return rounded.toLocaleString("en-US")
  }

  const sign = rounded < 0 ? "-" : ""
  const abs = Math.abs(rounded)

  if (abs >= 1_000_000_000) {
    return `${sign}${trimAbbrev(abs / 1_000_000_000)}B`
  }

  if (abs >= 1_000_000) {
    return `${sign}${trimAbbrev(abs / 1_000_000)}M`
  }

  if (abs >= 1_000) {
    return `${sign}${trimAbbrev(abs / 1_000)}K`
  }

  return `${sign}${abs}`
}

function trimAbbrev(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "")
}

export function cssFont(font: RaceFont): string {
  const family = /[\s,]/.test(font.family) ? `"${font.family}"` : font.family
  const weight = font.bold ? "bold " : ""
  return `${weight}${font.sizePx}px ${family}`
}

export const CANVAS_FONT_FAMILIES = [
  "system-ui",
  "Geist Variable",
  "Georgia",
  "Arial",
  "ui-monospace",
] as const
