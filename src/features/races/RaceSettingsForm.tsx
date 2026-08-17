import * as React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useProjects } from "@/features/projects/ProjectsProvider"
import { BarDimensionValueEditor } from "@/features/races/BarDimensionValueEditor"
import { FilterConsistencyBanner } from "@/features/races/FilterConsistencyBanner"
import { useRacePreview } from "@/features/races/RacePreviewProvider"
import { KEYFRAME_COLUMN } from "@/lib/eventStream"
import {
  computeRaceBars,
  DuplicateDisplayNameError,
  InvalidValueColumnError,
  pruneOrphanedFilterRules,
  uniqueFilteredBarValues,
  validateFilterConsistency,
} from "@/lib/raceCompute"
import type { Project } from "@/types/project"
import {
  DEFAULT_RACE_DESIGN,
  DEFAULT_TOP_N,
  normalizeRaceInit,
  type AggregationMode,
  type RaceConfig,
  type RaceFilter,
  type RaceInit,
} from "@/types/race"

const FILTER_NONE = "__none__"
const DEFAULT_FILTER_COLUMN = "item_type"
const DEFAULT_FILTER_VALUE = "word"

export function RaceSettingsForm({
  project,
  race,
  onClose,
}: {
  project: Project
  race: RaceConfig | null
  onClose?: () => void
}) {
  const { createRace, updateRace, closeRaceSettings } = useProjects()
  const {
    stream,
    isStreamLoading,
    streamError,
    validationError,
    dataWarning,
    scheduleCompute,
    setPreviewTopN,
    exitLivePreview,
  } = useRacePreview()
  const isEditing = race !== null
  const isLive = isEditing

  const storedInit = race ? normalizeRaceInit(race.init) : null

  const [name, setName] = React.useState(storedInit?.name ?? "")
  const [filterColumn, setFilterColumn] = React.useState(
    storedInit?.filter?.column ?? FILTER_NONE
  )
  const [filterValue, setFilterValue] = React.useState(
    storedInit?.filter?.value ?? ""
  )
  const [barDimensionColumn, setBarDimensionColumn] = React.useState(
    storedInit?.barDimensionColumn ?? ""
  )
  const [aggregationMode, setAggregationMode] = React.useState<
    AggregationMode | ""
  >(storedInit?.aggregationMode ?? "")
  const [valueColumn, setValueColumn] = React.useState(
    storedInit?.valueColumn ?? ""
  )
  const [timelineLabelColumn, setTimelineLabelColumn] = React.useState(
    storedInit?.timelineLabelColumn ?? ""
  )
  const [excludedValues, setExcludedValues] = React.useState<string[]>(
    storedInit?.excludedValues ?? []
  )
  const [valueAliases, setValueAliases] = React.useState<Record<string, string>>(
    storedInit?.valueAliases ?? {}
  )
  const [mergeMap, setMergeMap] = React.useState<Record<string, string>>(
    storedInit?.mergeMap ?? {}
  )
  const [hasMergeConflict, setHasMergeConflict] = React.useState(false)
  const [topNInput, setTopNInput] = React.useState(
    String(race?.design.topN ?? DEFAULT_TOP_N)
  )
  const [isSaving, setIsSaving] = React.useState(false)
  const [rulesEditorEpoch, setRulesEditorEpoch] = React.useState(0)

  const persistLiveRef = React.useRef(false)
  const appliedNewRaceDefaults = React.useRef(isEditing)

  const filter = React.useMemo(
    () =>
      filterColumn !== FILTER_NONE && filterValue !== ""
        ? { column: filterColumn, value: filterValue }
        : null,
    [filterColumn, filterValue]
  )

  const draftInit = React.useMemo((): RaceInit | null => {
    if (barDimensionColumn === "") {
      return null
    }

    if (aggregationMode !== "count" && aggregationMode !== "sum") {
      return null
    }

    if (aggregationMode === "sum" && valueColumn === "") {
      return null
    }

    return {
      name: name.trim(),
      filter,
      barDimensionColumn,
      aggregationMode,
      valueColumn: valueColumn === "" ? null : valueColumn,
      timelineLabelColumn,
      excludedValues,
      valueAliases,
      mergeMap,
    }
  }, [
    aggregationMode,
    barDimensionColumn,
    excludedValues,
    filter,
    mergeMap,
    name,
    timelineLabelColumn,
    valueAliases,
    valueColumn,
  ])

  const draftInitRef = React.useRef(draftInit)
  draftInitRef.current = draftInit

  const uniqueValues = React.useMemo(() => {
    if (!stream || barDimensionColumn === "") {
      return []
    }

    return uniqueFilteredBarValues(stream.rows, {
      filter,
      barDimensionColumn,
    })
  }, [stream, filter, barDimensionColumn])

  const filterConsistency = React.useMemo(() => {
    if (!isEditing || !draftInit) {
      return null
    }

    return validateFilterConsistency(uniqueValues, draftInit)
  }, [draftInit, isEditing, uniqueValues])

  function handlePruneOrphaned() {
    if (!draftInit || !race) {
      return
    }

    const next = pruneOrphanedFilterRules(uniqueValues, draftInit)
    setExcludedValues(next.excludedValues)
    setValueAliases(next.valueAliases)
    setMergeMap(next.mergeMap)
    setRulesEditorEpoch((epoch) => epoch + 1)

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

  function pruneDimensionRules(
    nextFilter: RaceFilter | null,
    nextBarDimensionColumn: string
  ) {
    if (!stream || nextBarDimensionColumn === "") {
      return
    }

    const allowed = new Set(
      uniqueFilteredBarValues(stream.rows, {
        filter: nextFilter,
        barDimensionColumn: nextBarDimensionColumn,
      })
    )

    setExcludedValues((prev) => {
      const next = prev.filter((value) => allowed.has(value))
      return next.length === prev.length ? prev : next
    })
    setValueAliases((prev) => {
      const next = { ...prev }
      let changed = false

      for (const key of Object.keys(next)) {
        if (!allowed.has(key)) {
          delete next[key]
          changed = true
        }
      }

      return changed ? next : prev
    })
    setMergeMap((prev) => {
      const next = { ...prev }
      let changed = false

      for (const [source, target] of Object.entries(next)) {
        if (!allowed.has(source) || !allowed.has(target)) {
          delete next[source]
          changed = true
        }
      }

      return changed ? next : prev
    })
  }

  React.useEffect(() => {
    if (isEditing || !stream || appliedNewRaceDefaults.current) {
      return
    }

    appliedNewRaceDefaults.current = true

    if (stream.selectableColumns.includes(DEFAULT_FILTER_COLUMN)) {
      const values = stream.uniqueValuesByColumn[DEFAULT_FILTER_COLUMN] ?? []
      if (values.includes(DEFAULT_FILTER_VALUE)) {
        setFilterColumn(DEFAULT_FILTER_COLUMN)
        setFilterValue(DEFAULT_FILTER_VALUE)
      }
    }
  }, [stream, isEditing])

  React.useEffect(() => {
    if (!isLive) {
      return
    }

    persistLiveRef.current = false

    return () => {
      exitLivePreview({ restore: !persistLiveRef.current })
    }
  }, [isLive, race?.id, exitLivePreview])

  const computeSignature = React.useMemo(
    () =>
      JSON.stringify({
        filterColumn,
        filterValue,
        barDimensionColumn,
        excludedValues,
        mergeMap,
        aggregationMode,
        valueColumn,
      }),
    [
      aggregationMode,
      filterColumn,
      filterValue,
      barDimensionColumn,
      excludedValues,
      mergeMap,
      valueColumn,
    ]
  )
  const aliasesSignature = React.useMemo(
    () => JSON.stringify(valueAliases),
    [valueAliases]
  )
  const prevComputeRef = React.useRef("")
  const prevAliasesRef = React.useRef("")

  React.useEffect(() => {
    if (!isLive || !stream) {
      return
    }

    const init = draftInitRef.current

    if (!init) {
      return
    }

    const othersChanged = prevComputeRef.current !== computeSignature
    const aliasesChanged = prevAliasesRef.current !== aliasesSignature
    prevComputeRef.current = computeSignature
    prevAliasesRef.current = aliasesSignature

    if (!othersChanged && !aliasesChanged) {
      return
    }

    scheduleCompute(init, {
      debounce: aliasesChanged && !othersChanged,
    })
  }, [
    aliasesSignature,
    computeSignature,
    isLive,
    scheduleCompute,
    stream,
  ])

  React.useEffect(() => {
    if (!isLive) {
      return
    }

    const parsed = Number.parseInt(topNInput, 10)

    if (Number.isInteger(parsed) && parsed >= 1) {
      setPreviewTopN(parsed)
    }
  }, [isLive, setPreviewTopN, topNInput])

  const filterValues =
    filterColumn !== FILTER_NONE
      ? (stream?.uniqueValuesByColumn[filterColumn] ?? [])
      : []

  const topN = Number.parseInt(topNInput, 10)
  const isTopNValid = Number.isInteger(topN) && topN >= 1

  const canSubmit =
    !isSaving &&
    !streamError &&
    stream !== null &&
    name.trim() !== "" &&
    barDimensionColumn !== "" &&
    (aggregationMode === "count" ||
      (aggregationMode === "sum" && valueColumn !== "")) &&
    timelineLabelColumn !== "" &&
    isTopNValid &&
    !hasMergeConflict &&
    validationError === null

  function handleClose() {
    if (onClose) {
      onClose()
      return
    }

    closeRaceSettings()
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!canSubmit || !stream) {
      return
    }

    if (aggregationMode !== "count" && aggregationMode !== "sum") {
      return
    }

    const init: RaceInit = {
      name: name.trim(),
      filter,
      barDimensionColumn,
      aggregationMode,
      valueColumn: valueColumn === "" ? null : valueColumn,
      timelineLabelColumn,
      excludedValues,
      valueAliases,
      mergeMap,
    }

    try {
      computeRaceBars(stream.rows, init)
    } catch (caught: unknown) {
      if (
        caught instanceof DuplicateDisplayNameError ||
        caught instanceof InvalidValueColumnError
      ) {
        scheduleCompute(init)
        return
      }

      console.error("Failed to validate race settings", caught)
      return
    }

    setIsSaving(true)

    try {
      if (race) {
        persistLiveRef.current = true
        await updateRace(race.id, { init, design: { topN } })
        handleClose()
      } else {
        await createRace(init, { ...DEFAULT_RACE_DESIGN, topN })
      }
    } catch (error: unknown) {
      persistLiveRef.current = false
      console.error("Failed to save race", error)
    } finally {
      setIsSaving(false)
    }
  }

  const heading = isEditing ? "Edit Race" : "New Race"

  if (isStreamLoading && stream === null) {
    return (
      <div className="text-sm text-muted-foreground">
        Loading event stream {project.eventStreamPath}…
      </div>
    )
  }

  if (streamError) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-muted-foreground">{heading}</h2>
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {streamError}
        </p>
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={handleClose}
        >
          Back
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{heading}</h2>
        <Button type="button" variant="ghost" size="sm" onClick={handleClose}>
          Cancel
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="race-name">Name</Label>
        <Input
          id="race-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Filter (optional)</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          <Select
            value={filterColumn}
            onValueChange={(column) => {
              setFilterColumn(column)
              setFilterValue("")
              pruneDimensionRules(null, barDimensionColumn)
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Column" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_NONE}>No filter</SelectItem>
              {stream?.selectableColumns.map((column) => (
                <SelectItem key={column} value={column}>
                  {column}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filterValue}
            onValueChange={(value) => {
              setFilterValue(value)
              pruneDimensionRules(
                filterColumn !== FILTER_NONE && value !== ""
                  ? { column: filterColumn, value }
                  : null,
                barDimensionColumn
              )
            }}
            disabled={filterColumn === FILTER_NONE}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Value" />
            </SelectTrigger>
            <SelectContent>
              {filterValues.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Bar dimension</Label>
        <Select
          value={barDimensionColumn}
          onValueChange={(column) => {
            setBarDimensionColumn(column)
            pruneDimensionRules(filter, column)
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a column" />
          </SelectTrigger>
          <SelectContent>
            {stream?.selectableColumns.map((column) => (
              <SelectItem key={column} value={column}>
                {column}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {validationError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {validationError.message}
        </p>
      )}

      {filterConsistency ? (
        <FilterConsistencyBanner
          result={filterConsistency}
          onPruneOrphaned={handlePruneOrphaned}
        />
      ) : null}

      <BarDimensionValueEditor
        key={`${barDimensionColumn}:${filterColumn}:${filterValue}:${rulesEditorEpoch}`}
        values={uniqueValues}
        excludedValues={excludedValues}
        valueAliases={valueAliases}
        mergeMap={mergeMap}
        onExcludedChange={setExcludedValues}
        onAliasChange={setValueAliases}
        onMergeMapChange={setMergeMap}
        onConflictChange={setHasMergeConflict}
      />

      <div className="flex flex-col gap-2">
        <Label>Aggregation mode</Label>
        <Select
          value={aggregationMode}
          onValueChange={(value) => setAggregationMode(value as AggregationMode)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select aggregation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="count">Count rows</SelectItem>
            <SelectItem value="sum">Sum column</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {aggregationMode === "sum" && (
        <div className="flex flex-col gap-2">
          <Label>Value column</Label>
          <Select
            value={valueColumn || undefined}
            onValueChange={setValueColumn}
          >
            <SelectTrigger
              className="w-full"
              aria-invalid={valueColumn === "" ? true : undefined}
            >
              <SelectValue placeholder="Select a numeric column" />
            </SelectTrigger>
            <SelectContent>
              {(stream?.numericColumns.includes(valueColumn) ||
              valueColumn === ""
                ? (stream?.numericColumns ?? [])
                : [valueColumn, ...(stream?.numericColumns ?? [])]
              ).map((column) => (
                <SelectItem key={column} value={column}>
                  {column}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {valueColumn === "" && (
            <p className="text-xs text-destructive">
              Select a value column to sum.
            </p>
          )}
        </div>
      )}

      {dataWarning && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
          {dataWarning}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Label>Timeline label</Label>
        <Select
          value={timelineLabelColumn}
          onValueChange={setTimelineLabelColumn}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a column" />
          </SelectTrigger>
          <SelectContent>
            {stream?.selectableColumns.map((column) => (
              <SelectItem key={column} value={column}>
                {column}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Playback order always follows the internal{" "}
          <code className="font-mono">{KEYFRAME_COLUMN}</code> column. This
          field only chooses the label shown to the user.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="race-top-n">Top N</Label>
        <Input
          id="race-top-n"
          type="number"
          min={1}
          step={1}
          value={topNInput}
          onChange={(event) => setTopNInput(event.target.value)}
        />
      </div>

      <Button type="submit" disabled={!canSubmit} className="self-start">
        {isEditing ? "Done" : "Save"}
      </Button>
    </form>
  )
}
