import * as React from "react"

import { getBackgroundImage } from "@/lib/db"
import type { RaceBar } from "@/lib/raceCompute"
import { renderFrameAt } from "@/lib/raceFrame"
import {
  mapTimeToKeyframePosition,
  PLAYBACK_FPS,
  timelineLabelAt,
  type RacePlaybackClock,
  type RacePlaybackSession,
} from "@/lib/racePlayback"
import { renderRaceFrame, evenBackingStoreSize } from "@/lib/raceRender"
import { normalizeRaceDesign, type RaceDesign } from "@/types/race"

const FRAME_INTERVAL_MS = 1000 / PLAYBACK_FPS

export function RaceCanvas({
  bars,
  design,
  playback,
  playbackClockRef,
  onPlaybackEnded,
  colorAssignments,
  showSafeZoneGuides,
  keyframeLabels,
  totalKeyframes,
  canvasRef,
  exporting,
}: {
  bars: RaceBar[]
  design: RaceDesign
  playback: RacePlaybackSession | null
  playbackClockRef: React.RefObject<RacePlaybackClock>
  onPlaybackEnded: () => void
  colorAssignments: Record<string, string>
  showSafeZoneGuides: boolean
  keyframeLabels: Record<number, string>
  totalKeyframes: number
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  exporting: boolean
}) {
  const designRef = React.useRef(design)
  const playbackRef = React.useRef(playback)
  const frameBarsRef = React.useRef<RaceBar[]>(bars)
  const onEndedRef = React.useRef(onPlaybackEnded)
  const colorAssignmentsRef = React.useRef(colorAssignments)
  const showGuidesRef = React.useRef(showSafeZoneGuides)
  const keyframeLabelsRef = React.useRef(keyframeLabels)
  const totalKeyframesRef = React.useRef(totalKeyframes)
  const hasLaidOutRef = React.useRef(false)
  const exportingRef = React.useRef(exporting)
  const playing = playback?.playing ?? false
  const generation = playback?.generation ?? 0
  const canvasBackground = normalizeRaceDesign(design).canvasBackground
  const overlayEnabled = canvasBackground.image.enabled
  const backgroundImageId = canvasBackground.image.imageId
  const backgroundImageRef = React.useRef<HTMLImageElement | null>(null)
  const [backgroundImageVersion, setBackgroundImageVersion] = React.useState(0)

  designRef.current = design
  playbackRef.current = playback
  onEndedRef.current = onPlaybackEnded
  colorAssignmentsRef.current = colorAssignments
  showGuidesRef.current = showSafeZoneGuides
  keyframeLabelsRef.current = keyframeLabels
  totalKeyframesRef.current = totalKeyframes
  exportingRef.current = exporting

  const resolveTimelineLabel = React.useCallback(() => {
    const session = playbackRef.current

    if (session !== null && session.series.totalKeyframes >= 1) {
      const position = mapTimeToKeyframePosition(
        playbackClockRef.current.elapsedSeconds,
        session.series.totalKeyframes,
        session.durationSeconds
      )
      return timelineLabelAt(position, session.series)
    }

    const total = totalKeyframesRef.current
    if (total < 1) {
      return ""
    }

    return timelineLabelAt(total, {
      totalKeyframes: total,
      keyframeLabels: keyframeLabelsRef.current,
    })
  }, [playbackClockRef])

  const prepareCanvas = React.useCallback(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return null
    }

    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const freezeSize = exportingRef.current && hasLaidOutRef.current

    if (!freezeSize) {
      const size = evenBackingStoreSize(rect.width, rect.height, dpr)
      canvas.width = size.width
      canvas.height = size.height
      hasLaidOutRef.current = true
    }

    return { canvas, dpr }
  }, [canvasRef])

  const draw = React.useCallback((frameBars: RaceBar[]) => {
    const prepared = prepareCanvas()

    if (!prepared) {
      return
    }

    frameBarsRef.current = frameBars

    renderRaceFrame(
      prepared.canvas,
      frameBars,
      designRef.current,
      prepared.dpr,
      colorAssignmentsRef.current,
      {
        showSafeZoneGuides: showGuidesRef.current,
        timelineLabel: resolveTimelineLabel(),
        backgroundImage: backgroundImageRef.current,
        elapsedSeconds: playbackClockRef.current.elapsedSeconds,
      }
    )
  }, [playbackClockRef, prepareCanvas, resolveTimelineLabel])

  React.useEffect(() => {
    if (!overlayEnabled || !backgroundImageId) {
      backgroundImageRef.current = null
      setBackgroundImageVersion((version) => version + 1)
      return
    }

    const imageId = backgroundImageId
    let cancelled = false
    let objectUrl: string | null = null

    getBackgroundImage(imageId)
      .then((blob) => {
        if (cancelled || !blob) {
          if (!cancelled) {
            backgroundImageRef.current = null
            setBackgroundImageVersion((version) => version + 1)
          }
          return
        }

        const url = URL.createObjectURL(blob)
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }

        objectUrl = url
        const image = new Image()
        image.onload = () => {
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl)
            objectUrl = null
          }

          if (cancelled) {
            return
          }

          backgroundImageRef.current = image
          setBackgroundImageVersion((version) => version + 1)
        }
        image.onerror = () => {
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl)
            objectUrl = null
          }

          if (cancelled) {
            return
          }

          backgroundImageRef.current = null
          setBackgroundImageVersion((version) => version + 1)
        }
        image.src = url
      })
      .catch((caught: unknown) => {
        console.error("Failed to load canvas background image", caught)
        if (!cancelled) {
          backgroundImageRef.current = null
          setBackgroundImageVersion((version) => version + 1)
        }
      })

    return () => {
      cancelled = true
      backgroundImageRef.current = null
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [backgroundImageId, overlayEnabled])

  React.useEffect(() => {
    const session = playbackRef.current

    if (session === null || !session.playing) {
      return
    }

    const { series, durationSeconds, resumeFromSeconds } = session
    const startTime = performance.now() - resumeFromSeconds * 1000
    const clock = playbackClockRef.current

    const paint = (elapsedSeconds: number) => {
      const prepared = prepareCanvas()

      if (!prepared) {
        return
      }

      const clamped = Math.min(elapsedSeconds, durationSeconds)
      clock.elapsedSeconds = clamped
      frameBarsRef.current = renderFrameAt(
        prepared.canvas,
        clamped,
        series,
        durationSeconds,
        {
          design: designRef.current,
          devicePixelRatio: prepared.dpr,
          colorAssignments: colorAssignmentsRef.current,
          showSafeZoneGuides: showGuidesRef.current,
          backgroundImage: backgroundImageRef.current,
        }
      )
    }

    paint(resumeFromSeconds)

    let raf = 0
    let cancelled = false
    let lastDrawAt = 0

    const tick = (now: number) => {
      if (cancelled) {
        return
      }

      const elapsed = (now - startTime) / 1000
      const due =
        lastDrawAt === 0 ||
        now - lastDrawAt >= FRAME_INTERVAL_MS ||
        elapsed >= durationSeconds

      if (due) {
        lastDrawAt = now
        paint(elapsed)
      }

      if (elapsed >= durationSeconds) {
        onEndedRef.current()
        return
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [generation, playbackClockRef, playing, prepareCanvas])

  React.useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const observer = new ResizeObserver(() => {
      if (exportingRef.current && hasLaidOutRef.current) {
        return
      }

      draw(frameBarsRef.current)
    })

    observer.observe(canvas)

    return () => observer.disconnect()
  }, [canvasRef, draw])

  React.useEffect(() => {
    if (exporting && hasLaidOutRef.current) {
      return
    }

    if (playing) {
      draw(frameBarsRef.current)
      return
    }

    if (playback !== null) {
      draw(frameBarsRef.current)
      return
    }

    draw(bars)
  }, [bars, backgroundImageVersion, colorAssignments, design, draw, exporting, playback, playing, showSafeZoneGuides, keyframeLabels, totalKeyframes])

  return <canvas ref={canvasRef} className="block h-full w-full" />
}
