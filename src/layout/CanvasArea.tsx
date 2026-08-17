import * as React from "react"

import { useProjects } from "@/features/projects/ProjectsProvider"
import { RaceCanvas } from "@/features/races/RaceCanvas"
import { useRacePreview } from "@/features/races/RacePreviewProvider"

/**
 * The canvas keeps a 9:16 frame: height fills the row and width is derived from
 * it, so the wrapper is only as wide as the frame and the leftover horizontal
 * space stays with the work area.
 */
export function CanvasArea() {
  const { workView, selectedRace } = useProjects()
  const {
    bars,
    status,
    previewTopN,
    playback,
    playbackClockRef,
    onPlaybackEnded,
    colorAssignments,
    showSafeZoneGuides,
    keyframeLabels,
    totalKeyframes,
    canvasRef,
    exporting,
  } = useRacePreview()

  const design = React.useMemo(() => {
    if (!selectedRace) {
      return null
    }

    if (previewTopN === null || previewTopN === selectedRace.design.topN) {
      return selectedRace.design
    }

    return { ...selectedRace.design, topN: previewTopN }
  }, [previewTopN, selectedRace])

  const showFrame =
    workView === "race" &&
    selectedRace !== null &&
    (bars !== null || playback !== null)

  return (
    <div className="flex h-full w-fit shrink-0 items-center justify-center border-l p-2">
      <div className="aspect-[9/16] h-full w-auto overflow-hidden border border-neutral-500 bg-black">
        {showFrame && design !== null && (bars !== null || playback !== null) ? (
          <RaceCanvas
            bars={bars ?? []}
            design={design}
            playback={playback}
            playbackClockRef={playbackClockRef}
            onPlaybackEnded={onPlaybackEnded}
            colorAssignments={colorAssignments}
            showSafeZoneGuides={showSafeZoneGuides}
            keyframeLabels={keyframeLabels}
            totalKeyframes={totalKeyframes}
            canvasRef={canvasRef}
            exporting={exporting}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-neutral-400">
            {status === "computing" ? "computing…" : "canvas placeholder"}
          </div>
        )}
      </div>
    </div>
  )
}
