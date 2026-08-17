import { scalePow } from "d3-scale"

import { clampBarScaleExponent } from "@/types/race"

/**
 * Max bar value over the full pre-Top-N ranking. Used as the power-scale
 * domain maximum so changing Top N does not rescale bars already on screen.
 * Lower bound is 0 so exponent 1 matches `width = maxWidth * value / max`.
 */
export function barScaleMaxValue(bars: { value: number }[]): number {
  let max = -Infinity

  for (const bar of bars) {
    if (bar.value > max) {
      max = bar.value
    }
  }

  return Number.isFinite(max) ? max : 0
}

/** Pixel width of one bar. Does not affect rank or displayed numbers. */
export function scaleBarWidthPx(
  value: number,
  maxWidthPx: number,
  exponent: number,
  maxValue: number
): number {
  if (maxWidthPx <= 0 || maxValue <= 0) {
    return 0
  }

  const width = scalePow<number, number>()
    .exponent(clampBarScaleExponent(exponent))
    .domain([0, maxValue])
    .range([0, maxWidthPx])
    .clamp(true)(Math.max(0, value))

  return Number.isFinite(width) ? Math.max(0, width) : 0
}
