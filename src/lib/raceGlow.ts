/** Radians per second of the sine pulse. Not exposed in the UI. */
export const GLOW_FLICKER_SPEED = 8

/**
 * Flicker envelope in `[0, 1]` from playback time. 0.5 at t=0; pulses
 * as elapsed time advances. Does not depend on bar data.
 */
export function getGlowIntensity(elapsedSeconds: number): number {
  if (!Number.isFinite(elapsedSeconds)) {
    return 0
  }

  return (Math.sin(elapsedSeconds * GLOW_FLICKER_SPEED) + 1) / 2
}
