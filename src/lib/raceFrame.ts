import type { KeyframeSeries, RaceBar } from "@/lib/raceCompute"
import {
  getInterpolatedState,
  mapTimeToKeyframePosition,
  timelineLabelAt,
} from "@/lib/racePlayback"
import { renderRaceFrame } from "@/lib/raceRender"
import type { RaceDesign } from "@/types/race"

/**
 * Draw one playback instant onto `canvas`: map time → interpolate → render.
 * Caller sizes the canvas; render layout is proportional to the bitmap size.
 */
export function renderFrameAt(
  canvas: HTMLCanvasElement,
  timeSeconds: number,
  series: KeyframeSeries,
  durationSeconds: number,
  options: {
    design: RaceDesign
    devicePixelRatio: number
    colorAssignments: Record<string, string>
    showSafeZoneGuides?: boolean
    backgroundImage?: HTMLImageElement | null
  }
): RaceBar[] {
  const clamped = Math.min(Math.max(0, timeSeconds), durationSeconds)
  const position = mapTimeToKeyframePosition(
    clamped,
    series.totalKeyframes,
    durationSeconds
  )
  const bars = getInterpolatedState(position, series)

  renderRaceFrame(
    canvas,
    bars,
    options.design,
    options.devicePixelRatio,
    options.colorAssignments,
    {
      showSafeZoneGuides: options.showSafeZoneGuides ?? false,
      timelineLabel: timelineLabelAt(position, series),
      backgroundImage: options.backgroundImage,
      elapsedSeconds: clamped,
    }
  )

  return bars
}
