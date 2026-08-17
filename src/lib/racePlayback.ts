import type { KeyframeEntry, KeyframeSeries, RaceBar } from "@/lib/raceCompute"

/** End-hold after the last keyframe is reached. Not exposed in the UI yet. */
export const FREEZE_SECONDS = 3

export const PLAYBACK_FPS = 30

export interface RacePlaybackClock {
  elapsedSeconds: number
}

export interface RacePlaybackSession {
  series: KeyframeSeries
  durationSeconds: number
  /** Bumped on play/resume/restart so the canvas loop restarts from `resumeFromSeconds`. */
  generation: number
  playing: boolean
  resumeFromSeconds: number
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Maps wall-clock elapsed time onto a (possibly fractional) keyframe position
 * in `[1, totalKeyframes]`. Motion uses `durationSeconds - FREEZE_SECONDS`
 * split across `totalKeyframes - 1` segments; the remaining freeze holds the
 * last keyframe exactly.
 */
export function mapTimeToKeyframePosition(
  elapsedSeconds: number,
  totalKeyframes: number,
  durationSeconds: number
): number {
  if (totalKeyframes <= 1) {
    return Math.max(1, totalKeyframes)
  }

  const activeDuration = durationSeconds - FREEZE_SECONDS

  if (elapsedSeconds >= activeDuration) {
    return totalKeyframes
  }

  const segmentDuration = activeDuration / (totalKeyframes - 1)
  const position = 1 + elapsedSeconds / segmentDuration

  return Math.min(totalKeyframes, Math.max(1, position))
}

function entryValue(entry: KeyframeEntry | undefined): number {
  return entry?.value ?? 0
}

function entryRank(entry: KeyframeEntry | undefined): number {
  return entry?.rank ?? 0
}

/**
 * Whether `label` gains value between the surrounding keyframes.
 * Freeze (`lower === upper === last`): never. First keyframe only:
 * compare against an implicit 0 baseline.
 */
export function isReceivingData(
  lowerKf: number,
  upperKf: number,
  totalKeyframes: number,
  lowerValue: number,
  upperValue: number
): boolean {
  if (lowerKf === upperKf && lowerKf === totalKeyframes) {
    return false
  }

  if (lowerKf === upperKf && lowerKf === 1) {
    return upperValue > 0
  }

  return upperValue > lowerValue
}

/**
 * Linear interpolation of value *and* rank between surrounding integer
 * keyframes. Both stay continuous floats — rounding is render-only.
 * Top N is applied at draw time via `continuousRank`.
 */
export function getInterpolatedState(
  position: number,
  series: KeyframeSeries
): RaceBar[] {
  const { totalKeyframes, snapshots } = series

  if (totalKeyframes < 1) {
    return []
  }

  const clamped = Math.min(totalKeyframes, Math.max(1, position))
  const lowerKf = Math.floor(clamped)
  const upperKf = Math.ceil(clamped)
  const fraction = clamped - lowerKf
  const lower = snapshots[lowerKf]
  const upper = snapshots[upperKf]

  if (!lower || !upper) {
    return []
  }

  return Object.keys(lower).map((label) => {
    const from = entryValue(lower[label])
    const to = entryValue(upper[label])

    return {
      label,
      value: lerp(from, to, fraction),
      continuousRank: lerp(
        entryRank(lower[label]),
        entryRank(upper[label]),
        fraction
      ),
      isReceivingData: isReceivingData(
        lowerKf,
        upperKf,
        totalKeyframes,
        from,
        to
      ),
    }
  })
}

/** Discrete display label for the current integer keyframe. No string lerp. */
export function timelineLabelAt(
  position: number,
  series: Pick<KeyframeSeries, "totalKeyframes" | "keyframeLabels">
): string {
  if (series.totalKeyframes < 1) {
    return ""
  }

  const keyframe = Math.min(
    series.totalKeyframes,
    Math.max(1, Math.floor(position))
  )

  return series.keyframeLabels[keyframe] ?? ""
}
