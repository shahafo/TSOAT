import { Recorder, isWebCodecsSupported } from "canvas-record"

import { getBackgroundImage } from "@/lib/db"
import type { KeyframeSeries } from "@/lib/raceCompute"
import { renderFrameAt } from "@/lib/raceFrame"
import { PLAYBACK_FPS } from "@/lib/racePlayback"
import { normalizeRaceDesign, type RaceDesign } from "@/types/race"

export class RaceExportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RaceExportError"
  }
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function recordingToBlob(
  data: ArrayBuffer | Uint8Array | Blob[] | undefined | null
): Blob {
  if (data == null) {
    throw new RaceExportError("Export produced no video data.")
  }

  if (Array.isArray(data)) {
    return new Blob(data, { type: "video/mp4" })
  }

  if (data instanceof ArrayBuffer) {
    return new Blob([data], { type: "video/mp4" })
  }

  const bytes = new Uint8Array(data.byteLength)
  bytes.set(data)
  return new Blob([bytes], { type: "video/mp4" })
}

async function loadBackgroundImage(
  design: RaceDesign
): Promise<HTMLImageElement | null> {
  const background = normalizeRaceDesign(design).canvasBackground

  if (!background.image.enabled || !background.image.imageId) {
    return null
  }

  try {
    const blob = await getBackgroundImage(background.image.imageId)

    if (!blob) {
      return null
    }

    const url = URL.createObjectURL(blob)

    try {
      const image = new Image()
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () =>
          reject(new Error("Failed to load canvas background image"))
        image.src = url
      })
      return image
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch (caught: unknown) {
    console.error("Failed to load canvas background image", caught)
    return null
  }
}

export function formatExportError(caught: unknown): string {
  if (caught instanceof RaceExportError) {
    return caught.message
  }

  const detail =
    caught instanceof Error && caught.message.trim() !== ""
      ? caught.message
      : "Unknown error"

  if (
    /webcodecs|VideoEncoder|not supported|Unsupported VideoEncoder/i.test(
      detail
    )
  ) {
    return `Video export is not supported in this browser (${detail}). Try Chrome or Edge.`
  }

  return `Export failed: ${detail}`
}

function canvasLayoutDpr(canvas: HTMLCanvasElement): number {
  const cssWidth = canvas.getBoundingClientRect().width

  if (cssWidth <= 0) {
    return window.devicePixelRatio || 1
  }

  return canvas.width / cssWidth
}

async function waitForLiveCanvas(
  getCanvas: () => HTMLCanvasElement | null
): Promise<HTMLCanvasElement> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const canvas = getCanvas()
    const rect = canvas?.getBoundingClientRect()

    if (
      canvas &&
      rect &&
      rect.width > 0 &&
      rect.height > 0 &&
      canvas.width > 1 &&
      canvas.height > 1
    ) {
      return canvas
    }

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })
  }

  throw new RaceExportError(
    "Canvas is not ready for export. Run Preview first."
  )
}

/** H.264 WebCodecs rejects odd width/height (4:2:0). At most 1px crop. */
function ensureEvenVideoFrameSize(canvas: HTMLCanvasElement): void {
  const width = Math.max(2, canvas.width - (canvas.width % 2))
  const height = Math.max(2, canvas.height - (canvas.height % 2))

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
}

function filenameFor(raceName: string): string {
  const base = (raceName.trim() === "" ? "race" : raceName.trim()).replace(
    /[/\\?%*:|"<>]/g,
    "_"
  )
  return `${base}_${Date.now()}.mp4`
}

export async function exportRaceVideo(options: {
  series: KeyframeSeries
  design: RaceDesign
  durationSeconds: number
  raceName: string
  getCanvas: () => HTMLCanvasElement | null
  onProgress: (current: number, total: number) => void
}): Promise<void> {
  if (!isWebCodecsSupported) {
    throw new RaceExportError(
      "Video export requires WebCodecs, which this browser does not support. Try Chrome or Edge."
    )
  }

  if (document.fonts?.ready) {
    await document.fonts.ready
  }

  const backgroundImage = await loadBackgroundImage(options.design)
  const canvas = await waitForLiveCanvas(options.getCanvas)
  ensureEvenVideoFrameSize(canvas)
  const context = canvas.getContext("2d")

  if (!context) {
    throw new RaceExportError("Could not create a 2D canvas context for export.")
  }

  const dpr = canvasLayoutDpr(canvas)
  const totalDurationSeconds = options.durationSeconds
  const totalFrames = Math.round(totalDurationSeconds * PLAYBACK_FPS)
  options.onProgress(0, totalFrames)

  const recorder = new Recorder(context, {
    extension: "mp4",
    frameRate: PLAYBACK_FPS,
    duration: Number.POSITIVE_INFINITY,
    download: false,
    // canvas-record reads encoderOptions.bitrateMode without a default.
    encoderOptions: {},
  })

  try {
    await recorder.start({ initOnly: true })

    for (let frame = 0; frame < totalFrames; frame++) {
      renderFrameAt(
        canvas,
        frame / PLAYBACK_FPS,
        options.series,
        totalDurationSeconds,
        {
          design: options.design,
          devicePixelRatio: dpr,
          colorAssignments: options.series.colorAssignments,
          showSafeZoneGuides: false,
          backgroundImage,
        }
      )
      await recorder.step()
      options.onProgress(frame + 1, totalFrames)

      if (frame % 4 === 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0)
        })
      }
    }

    const data = await recorder.stop()
    triggerDownload(recordingToBlob(data), filenameFor(options.raceName))
  } finally {
    try {
      await recorder.dispose()
    } catch {
      // Encoder may already be cleaned up after stop().
    }
  }
}
