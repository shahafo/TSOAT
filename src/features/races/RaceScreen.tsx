import * as React from "react"

import { PauseIcon, PlayIcon, RotateCcwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useProjects } from "@/features/projects/ProjectsProvider"
import { FilterConsistencyBanner } from "@/features/races/FilterConsistencyBanner"
import { RaceDesignPanel } from "@/features/races/RaceDesignPanel"
import { RaceSettingsForm } from "@/features/races/RaceSettingsForm"
import { useRacePreview } from "@/features/races/RacePreviewProvider"
import {
  pruneOrphanedFilterRules,
  uniqueFilteredBarValues,
  validateFilterConsistency,
} from "@/lib/raceCompute"
import type { RaceConfig } from "@/types/race"

export function RaceScreen({ race }: { race: RaceConfig }) {
  const { selectedProject, updateRace } = useProjects()
  const {
    status,
    error,
    validationError,
    dataWarning,
    runPreview,
    runExport,
    togglePlayback,
    restartPlayback,
    playback,
    stream,
    exporting,
    exportProgress,
    exportError,
  } = useRacePreview()
  const [topNInput, setTopNInput] = React.useState(String(race.design.topN))
  const [editing, setEditing] = React.useState(false)

  const filterConsistency = React.useMemo(() => {
    if (!stream) {
      return null
    }

    const uniqueValues = uniqueFilteredBarValues(stream.rows, race.init)
    return validateFilterConsistency(uniqueValues, race.init)
  }, [race.init, stream])

  React.useEffect(() => {
    setTopNInput(String(race.design.topN))
  }, [race.id, race.design.topN])

  React.useEffect(() => {
    setEditing(false)
  }, [race.id])

  function handleTopNChange(next: string) {
    setTopNInput(next)

    const topN = Number.parseInt(next, 10)

    if (!Number.isInteger(topN) || topN < 1 || topN === race.design.topN) {
      return
    }

    // Top N is presentation only, so this never triggers a recompute.
    updateRace(race.id, { design: { topN } }).catch((caught: unknown) => {
      console.error("Failed to save Top N", caught)
    })
  }

  function handlePruneOrphaned() {
    if (!stream) {
      return
    }

    const uniqueValues = uniqueFilteredBarValues(stream.rows, race.init)
    const next = pruneOrphanedFilterRules(uniqueValues, race.init)

    updateRace(race.id, {
      init: {
        excludedValues: next.excludedValues,
        valueAliases: next.valueAliases,
        mergeMap: next.mergeMap,
      },
    }).catch((caught: unknown) => {
      console.error("Failed to remove unused filter rules", caught)
    })
  }

  if (editing && selectedProject) {
    return (
      <RaceSettingsForm
        project={selectedProject}
        race={race}
        onClose={() => setEditing(false)}
      />
    )
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <h2 className="min-w-0 truncate text-base font-medium">
          {race.init.name}
        </h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setEditing(true)}
        >
          Edit Settings
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Button
          type="button"
          size="sm"
          onClick={() => void runPreview()}
          disabled={status === "computing" || exporting}
        >
          {status === "computing" ? "Computing…" : "Preview"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void runExport()}
          disabled={status === "computing" || exporting}
        >
          Export
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void togglePlayback()}
          disabled={status === "computing" || exporting}
          aria-pressed={playback?.playing === true}
        >
          {playback?.playing ? (
            <PauseIcon data-icon="inline-start" />
          ) : (
            <PlayIcon data-icon="inline-start" />
          )}
          {playback?.playing ? "Pause" : "Play"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void restartPlayback()}
          disabled={status === "computing" || exporting}
        >
          <RotateCcwIcon data-icon="inline-start" />
          Restart
        </Button>

        {exporting && exportProgress !== null && exportProgress.total > 0 ? (
          <div className="flex min-w-48 flex-col gap-1">
            <p className="text-xs text-muted-foreground">
              Rendering frame {exportProgress.current} / {exportProgress.total}
            </p>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={exportProgress.total}
              aria-valuenow={exportProgress.current}
              aria-label={`Rendering frame ${exportProgress.current} of ${exportProgress.total}`}
            >
              <div
                className="h-full bg-primary"
                style={{
                  width: `${Math.min(
                    100,
                    (exportProgress.current / exportProgress.total) * 100
                  )}%`,
                }}
              />
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-1">
          <Label htmlFor="race-screen-top-n" className="text-xs">
            Top N
          </Label>
          <Input
            id="race-screen-top-n"
            type="number"
            min={1}
            step={1}
            className="w-24"
            value={topNInput}
            onChange={(event) => handleTopNChange(event.target.value)}
          />
        </div>
      </div>

      <RaceDesignPanel
        race={race}
        onPatch={(design) => updateRace(race.id, { design })}
      />

      {exportError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {exportError}
        </p>
      )}

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {validationError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {validationError.message}
        </p>
      )}

      {dataWarning && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
          {dataWarning}
        </p>
      )}

      {filterConsistency ? (
        <FilterConsistencyBanner
          result={filterConsistency}
          onPruneOrphaned={handlePruneOrphaned}
        />
      ) : null}

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <dt>Bar dimension</dt>
        <dd className="font-mono">{race.init.barDimensionColumn}</dd>
        <dt>Filter</dt>
        <dd className="font-mono">
          {race.init.filter
            ? `${race.init.filter.column} = ${race.init.filter.value}`
            : "none"}
        </dd>
        <dt>Aggregation</dt>
        <dd className="font-mono">
          {race.init.aggregationMode === "sum"
            ? `sum(${race.init.valueColumn ?? "?"})`
            : "count"}
        </dd>
        <dt>Timeline label</dt>
        <dd className="font-mono">{race.init.timelineLabelColumn}</dd>
      </dl>
    </div>
  )
}
