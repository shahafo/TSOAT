import * as React from "react"

import { useProjects } from "@/features/projects/ProjectsProvider"
import { EventStreamError, loadEventStream, type EventStreamData } from "@/lib/eventStream"
import {
  computeKeyframeSeries,
  computeRaceBars,
  DuplicateDisplayNameError,
  InvalidValueColumnError,
  type KeyframeSeries,
  type RaceBar,
} from "@/lib/raceCompute"
import {
  getInterpolatedState,
  type RacePlaybackClock,
  type RacePlaybackSession,
} from "@/lib/racePlayback"
import {
  normalizeRaceDesign,
  normalizeRaceInit,
  type RaceInit,
} from "@/types/race"

const RENAME_DEBOUNCE_MS = 300

type PreviewStatus = "idle" | "computing" | "ready" | "error"

interface RacePreviewContextValue {
  /** Full ranking of every group. Top N is applied only when drawing. */
  bars: RaceBar[] | null
  /** Label → color from the final ranking. Rebuilt only when Compute reruns. */
  colorAssignments: Record<string, string>
  keyframeLabels: Record<number, string>
  totalKeyframes: number
  /** Live keyframe playback; null while showing a static snapshot. */
  playback: RacePlaybackSession | null
  playbackClockRef: React.RefObject<RacePlaybackClock>
  status: PreviewStatus
  error: string | null
  validationError: DuplicateDisplayNameError | InvalidValueColumnError | null
  dataWarning: string | null
  stream: EventStreamData | null
  isStreamLoading: boolean
  streamError: string | null
  /** Draft Top N while settings are open; otherwise the saved design value. */
  previewTopN: number | null
  /** Editor overlay only — never persisted, never passed to export. */
  showSafeZoneGuides: boolean
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  exporting: boolean
  exportProgress: { current: number; total: number } | null
  exportError: string | null
  runPreview: () => void
  runExport: () => void
  togglePlayback: () => void
  restartPlayback: () => void
  onPlaybackEnded: () => void
  scheduleCompute: (init: RaceInit, options?: { debounce?: boolean }) => void
  setPreviewTopN: (topN: number | null) => void
  setShowSafeZoneGuides: (show: boolean) => void
  exitLivePreview: (options: { restore: boolean }) => void
}

const RacePreviewContext = React.createContext<RacePreviewContextValue | null>(
  null
)

function skippedRowsWarning(count: number): string | null {
  if (count <= 0) {
    return null
  }

  return count === 1
    ? "1 row skipped — non-numeric value in the selected column."
    : `${count} rows skipped — non-numeric value in the selected column.`
}

function lastBarsFromSeries(series: KeyframeSeries): RaceBar[] {
  return getInterpolatedState(series.totalKeyframes, series)
}

export function RacePreviewProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { selectedProject, selectedRace } = useProjects()
  const [bars, setBars] = React.useState<RaceBar[] | null>(null)
  const [colorAssignments, setColorAssignments] = React.useState<
    Record<string, string>
  >({})
  const [keyframeLabels, setKeyframeLabels] = React.useState<
    Record<number, string>
  >({})
  const [totalKeyframes, setTotalKeyframes] = React.useState(0)
  const [playback, setPlayback] = React.useState<RacePlaybackSession | null>(
    null
  )
  const [status, setStatus] = React.useState<PreviewStatus>("idle")
  const [error, setError] = React.useState<string | null>(null)
  const [validationError, setValidationError] = React.useState<
    DuplicateDisplayNameError | InvalidValueColumnError | null
  >(null)
  const [dataWarning, setDataWarning] = React.useState<string | null>(null)
  const [stream, setStream] = React.useState<EventStreamData | null>(null)
  const [isStreamLoading, setIsStreamLoading] = React.useState(false)
  const [streamError, setStreamError] = React.useState<string | null>(null)
  const [previewTopN, setPreviewTopN] = React.useState<number | null>(null)
  const [showSafeZoneGuides, setShowSafeZoneGuides] = React.useState(false)
  const [exporting, setExporting] = React.useState(false)
  const [exportProgress, setExportProgress] = React.useState<{
    current: number
    total: number
  } | null>(null)
  const [exportError, setExportError] = React.useState<string | null>(null)

  const raceId = selectedRace?.id ?? null
  const eventStreamPath = selectedProject?.eventStreamPath ?? null
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const selectedRaceRef = React.useRef(selectedRace)
  const streamRef = React.useRef(stream)
  const seriesRef = React.useRef<KeyframeSeries | null>(null)
  const generationRef = React.useRef(0)
  const playbackClockRef = React.useRef<RacePlaybackClock>({ elapsedSeconds: 0 })
  const exportingRef = React.useRef(false)
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)

  selectedRaceRef.current = selectedRace
  streamRef.current = stream

  const resetPlayback = React.useCallback(() => {
    seriesRef.current = null
    playbackClockRef.current.elapsedSeconds = 0
    setPlayback(null)
  }, [])

  React.useEffect(() => {
    setBars(null)
    setColorAssignments({})
    setKeyframeLabels({})
    setTotalKeyframes(0)
    resetPlayback()
    setStatus("idle")
    setError(null)
    setValidationError(null)
    setDataWarning(null)
    setPreviewTopN(null)
    setShowSafeZoneGuides(false)
    setExportError(null)
    if (!exportingRef.current) {
      setExportProgress(null)
    }
  }, [raceId, resetPlayback])

  React.useEffect(() => {
    if (!eventStreamPath) {
      setStream(null)
      setIsStreamLoading(false)
      setStreamError(null)
      return
    }

    let cancelled = false

    setIsStreamLoading(true)
    setStreamError(null)

    // `raceId` is in the deps so opening a race re-fetches the CSV (no-store)
    // even when the project path has not changed.
    void raceId

    loadEventStream(eventStreamPath)
      .then((data) => {
        if (!cancelled) {
          setStream(data)
        }
      })
      .catch((caught: unknown) => {
        if (cancelled) {
          return
        }

        console.error("Failed to load event stream", caught)
        setStream(null)
        setStreamError(
          caught instanceof EventStreamError
            ? caught.message
            : `Failed to load event stream: ${eventStreamPath}`
        )
      })
      .finally(() => {
        if (!cancelled) {
          setIsStreamLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [eventStreamPath, raceId])

  const clearDebounce = React.useCallback(() => {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
  }, [])

  const applyComputeError = React.useCallback((caught: unknown) => {
    if (
      caught instanceof DuplicateDisplayNameError ||
      caught instanceof InvalidValueColumnError
    ) {
      resetPlayback()
      setColorAssignments({})
      setKeyframeLabels({})
      setTotalKeyframes(0)
      setValidationError(caught)
      setDataWarning(null)
      setStatus("ready")
      return
    }

    console.error("Failed to compute race preview", caught)
    resetPlayback()
    setColorAssignments({})
    setKeyframeLabels({})
    setTotalKeyframes(0)
    setError(
      caught instanceof EventStreamError
        ? caught.message
        : "Failed to compute preview"
    )
    setStatus("error")
  }, [resetPlayback])

  const applyCompute = React.useCallback(
    (init: RaceInit) => {
      const data = streamRef.current

      if (!data) {
        return
      }

      try {
        const result = computeRaceBars(data.rows, normalizeRaceInit(init))
        resetPlayback()
        setBars(result.bars)
        setColorAssignments(result.colorAssignments)
        setKeyframeLabels(result.keyframeLabels)
        setTotalKeyframes(result.totalKeyframes)
        setValidationError(null)
        setError(null)
        setDataWarning(skippedRowsWarning(result.skippedNonNumericCount))
        setStatus("ready")
      } catch (caught: unknown) {
        applyComputeError(caught)
      }
    },
    [applyComputeError, resetPlayback]
  )

  const computeSeries = React.useCallback((): KeyframeSeries | null => {
    const race = selectedRaceRef.current
    const data = streamRef.current

    if (!race || !data) {
      return null
    }

    const result = computeKeyframeSeries(
      data.rows,
      normalizeRaceInit(race.init)
    )
    const lastBars = lastBarsFromSeries(result.series)

    seriesRef.current = result.series
    setBars(lastBars)
    setColorAssignments(result.series.colorAssignments)
    setKeyframeLabels(result.series.keyframeLabels)
    setTotalKeyframes(result.series.totalKeyframes)
    setValidationError(null)
    setError(null)
    setDataWarning(skippedRowsWarning(result.skippedNonNumericCount))
    setStatus("ready")

    return result.series
  }, [])

  const startPlayback = React.useCallback(
    (series: KeyframeSeries, resumeFromSeconds: number) => {
      const race = selectedRaceRef.current
      const durationSeconds = race
        ? normalizeRaceDesign(race.design).animation.durationSeconds
        : series.totalKeyframes

      playbackClockRef.current.elapsedSeconds = resumeFromSeconds
      generationRef.current += 1
      setPlayback({
        series,
        durationSeconds,
        generation: generationRef.current,
        playing: true,
        resumeFromSeconds,
      })
    },
    []
  )

  const scheduleCompute = React.useCallback(
    (init: RaceInit, options?: { debounce?: boolean }) => {
      clearDebounce()

      if (options?.debounce) {
        debounceRef.current = setTimeout(() => {
          debounceRef.current = null
          applyCompute(init)
        }, RENAME_DEBOUNCE_MS)
        return
      }

      applyCompute(init)
    },
    [applyCompute, clearDebounce]
  )

  const runPreview = React.useCallback(() => {
    const race = selectedRaceRef.current
    const data = streamRef.current

    if (!race || !data) {
      return
    }

    setStatus("computing")
    setError(null)
    playbackClockRef.current.elapsedSeconds = 0
    setPlayback(null)

    try {
      computeSeries()
    } catch (caught: unknown) {
      applyComputeError(caught)
    }
  }, [applyComputeError, computeSeries])

  const runExport = React.useCallback(() => {
    if (exportingRef.current) {
      return
    }

    const race = selectedRaceRef.current
    const data = streamRef.current

    if (!race || !data) {
      setExportError("Cannot export without an event stream.")
      return
    }

    exportingRef.current = true
    setExporting(true)
    setExportError(null)
    setExportProgress(null)
    setPlayback((current) =>
      current === null || !current.playing
        ? current
        : { ...current, playing: false }
    )

    void (async () => {
      const { exportRaceVideo, formatExportError } = await import(
        "@/lib/raceExport"
      ).catch(() => ({
        exportRaceVideo: null,
        formatExportError: null,
      }))

      try {
        if (!exportRaceVideo || !formatExportError) {
          throw new Error(
            "Video export failed to load. Try Chrome or Edge, or reload the page."
          )
        }

        let series = seriesRef.current

        if (!series) {
          setStatus("computing")
          setError(null)
          series = computeSeries()
        }

        if (!series) {
          throw new Error("Cannot export without computed race data.")
        }

        const design = normalizeRaceDesign(race.design)

        await exportRaceVideo({
          series,
          design,
          durationSeconds: design.animation.durationSeconds,
          raceName: race.init.name,
          getCanvas: () => canvasRef.current,
          onProgress: (current, total) => {
            setExportProgress({ current, total })
          },
        })
      } catch (caught: unknown) {
        if (
          caught instanceof DuplicateDisplayNameError ||
          caught instanceof InvalidValueColumnError
        ) {
          applyComputeError(caught)
        }
        setExportError(
          formatExportError
            ? formatExportError(caught)
            : caught instanceof Error && caught.message.trim() !== ""
              ? `Export failed: ${caught.message}`
              : "Export failed."
        )
      } finally {
        exportingRef.current = false
        setExporting(false)
        setExportProgress(null)
      }
    })()
  }, [applyComputeError, computeSeries])

  const togglePlayback = React.useCallback(() => {
    const race = selectedRaceRef.current
    const data = streamRef.current

    if (!race || !data) {
      return
    }

    if (playback?.playing) {
      setPlayback({ ...playback, playing: false })
      return
    }

    try {
      let series = seriesRef.current

      if (!series) {
        setStatus("computing")
        setError(null)
        series = computeSeries()
      }

      if (!series) {
        return
      }

      const durationSeconds = normalizeRaceDesign(race.design).animation
        .durationSeconds
      const elapsed = playbackClockRef.current.elapsedSeconds
      const resumeFrom =
        elapsed > 0 && elapsed < durationSeconds ? elapsed : 0

      startPlayback(series, resumeFrom)
    } catch (caught: unknown) {
      applyComputeError(caught)
    }
  }, [applyComputeError, computeSeries, playback, startPlayback])

  const restartPlayback = React.useCallback(() => {
    const race = selectedRaceRef.current
    const data = streamRef.current

    if (!race || !data) {
      return
    }

    try {
      let series = seriesRef.current

      if (!series) {
        setStatus("computing")
        setError(null)
        series = computeSeries()
      }

      if (!series) {
        return
      }

      startPlayback(series, 0)
    } catch (caught: unknown) {
      applyComputeError(caught)
    }
  }, [applyComputeError, computeSeries, startPlayback])

  const onPlaybackEnded = React.useCallback(() => {
    setPlayback((current) =>
      current === null || !current.playing
        ? current
        : { ...current, playing: false }
    )
  }, [])

  const exitLivePreview = React.useCallback(
    (options: { restore: boolean }) => {
      clearDebounce()
      setPreviewTopN(null)
      setValidationError(null)
      setDataWarning(null)
      resetPlayback()

      if (options.restore) {
        const race = selectedRaceRef.current

        if (race) {
          applyCompute(race.init)
        }
      }
    },
    [applyCompute, clearDebounce, resetPlayback]
  )

  const value = React.useMemo<RacePreviewContextValue>(
    () => ({
      bars,
      colorAssignments,
      keyframeLabels,
      totalKeyframes,
      playback,
      playbackClockRef,
      status,
      error,
      validationError,
      dataWarning,
      stream,
      isStreamLoading,
      streamError,
      previewTopN,
      showSafeZoneGuides,
      canvasRef,
      exporting,
      exportProgress,
      exportError,
      runPreview,
      runExport,
      togglePlayback,
      restartPlayback,
      onPlaybackEnded,
      scheduleCompute,
      setPreviewTopN,
      setShowSafeZoneGuides,
      exitLivePreview,
    }),
    [
      bars,
      colorAssignments,
      keyframeLabels,
      totalKeyframes,
      playback,
      status,
      error,
      validationError,
      dataWarning,
      stream,
      isStreamLoading,
      streamError,
      previewTopN,
      showSafeZoneGuides,
      exporting,
      exportProgress,
      exportError,
      runPreview,
      runExport,
      togglePlayback,
      restartPlayback,
      onPlaybackEnded,
      scheduleCompute,
      exitLivePreview,
    ]
  )

  return (
    <RacePreviewContext.Provider value={value}>
      {children}
    </RacePreviewContext.Provider>
  )
}

export function useRacePreview(): RacePreviewContextValue {
  const context = React.useContext(RacePreviewContext)

  if (!context) {
    throw new Error("useRacePreview must be used within a RacePreviewProvider")
  }

  return context
}
