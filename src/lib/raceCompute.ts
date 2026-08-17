import { KEYFRAME_COLUMN, parseNumericCell } from "@/lib/eventStream"
import { buildColorAssignments } from "@/lib/raceDesign"
import { normalizeRaceInit, type RaceInit } from "@/types/race"

export interface RaceBar {
  label: string
  value: number
  /** 0 = leader. Integer at a keyframe; fractional while interpolating. */
  continuousRank: number
  /**
   * True when this label's value increases from the surrounding lower
   * keyframe to the upper one. Always false on the end freeze.
   */
  isReceivingData: boolean
}

export class DuplicateDisplayNameError extends Error {
  readonly displayName: string
  readonly values: [string, string]

  constructor(displayName: string, values: [string, string]) {
    super(
      `Display name "${displayName}" is used by both "${values[0]}" and "${values[1]}". Give them unique names, or merge them first.`
    )
    this.name = "DuplicateDisplayNameError"
    this.displayName = displayName
    this.values = values
  }
}

export class InvalidValueColumnError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InvalidValueColumnError"
  }
}

export interface RaceComputeResult {
  bars: RaceBar[]
  skippedNonNumericCount: number
  colorAssignments: Record<string, string>
  keyframeLabels: Record<number, string>
  totalKeyframes: number
}

/**
 * Unique bar-dimension values after the row-level filter, before merge.
 * Used to populate the exclude/rename table and merge-rule dropdowns.
 */
export function uniqueFilteredBarValues(
  rows: Record<string, string>[],
  init: Pick<RaceInit, "filter" | "barDimensionColumn">
): string[] {
  const values = new Set<string>()

  for (const row of rows) {
    if (init.filter && row[init.filter.column] !== init.filter.value) {
      continue
    }

    const value = row[init.barDimensionColumn]

    if (value === undefined || value === "") {
      continue
    }

    values.add(value)
  }

  return Array.from(values).sort((a, b) => a.localeCompare(b))
}

export interface FilterConsistencyResult {
  orphanedExcludes: string[]
  orphanedMergeKeys: string[]
  orphanedAliasKeys: string[]
}

/**
 * Compare stored exclude/merge/rename rules against the unique bar-dimension
 * values currently in the file. Orphaned rules are informational only — they
 * do not block compute.
 */
export function validateFilterConsistency(
  uniqueValuesInFile: string[],
  init: RaceInit
): FilterConsistencyResult {
  const { excludedValues, mergeMap, valueAliases } = normalizeRaceInit(init)
  const unique = new Set(uniqueValuesInFile)

  return {
    orphanedExcludes: excludedValues.filter((value) => !unique.has(value)),
    orphanedMergeKeys: Object.keys(mergeMap).filter(
      (source) => !unique.has(source)
    ),
    orphanedAliasKeys: Object.keys(valueAliases).filter(
      (value) => !unique.has(value)
    ),
  }
}

export function hasFilterConsistencyIssue(
  result: FilterConsistencyResult
): boolean {
  return (
    result.orphanedExcludes.length > 0 ||
    result.orphanedMergeKeys.length > 0 ||
    result.orphanedAliasKeys.length > 0
  )
}

/**
 * Drop exclude/merge/rename rules whose source values are no longer in the
 * file.
 */
export function pruneOrphanedFilterRules(
  uniqueValuesInFile: string[],
  init: RaceInit
): RaceInit {
  const normalized = normalizeRaceInit(init)
  const unique = new Set(uniqueValuesInFile)

  return {
    ...normalized,
    excludedValues: normalized.excludedValues.filter((value) =>
      unique.has(value)
    ),
    mergeMap: Object.fromEntries(
      Object.entries(normalized.mergeMap).filter(([source]) =>
        unique.has(source)
      )
    ),
    valueAliases: Object.fromEntries(
      Object.entries(normalized.valueAliases).filter(([value]) =>
        unique.has(value)
      )
    ),
  }
}

/**
 * Returns a blocking message if `source → target` would break the flat
 * merge invariant (self-merge, duplicate source, or chaining).
 * `ignoreSource` is the current rule's source when editing an existing row.
 */
export function getMergeRuleConflict(
  mergeMap: Record<string, string>,
  source: string,
  target: string,
  ignoreSource?: string
): string | null {
  if (source === "" || target === "") {
    return null
  }

  if (source === target) {
    return "A value cannot be merged into itself."
  }

  if (isIllegalMergeSource(mergeMap, source, ignoreSource)) {
    return otherEntries(mergeMap, ignoreSource).some(
      ([, existingTarget]) => existingTarget === source
    )
      ? "This value is already a merge target. Merge rules must be flat — chaining (A→B→C) is not allowed."
      : "This value is already a merge source."
  }

  if (isIllegalMergeTarget(mergeMap, target, ignoreSource)) {
    return "Cannot merge into a value that is already a merge source. Merge rules must be flat — chaining (A→B→C) is not allowed."
  }

  return null
}

function otherEntries(
  mergeMap: Record<string, string>,
  ignoreSource?: string
): [string, string][] {
  return Object.entries(mergeMap).filter(
    ([existingSource]) => existingSource !== ignoreSource
  )
}

/** A source cannot already be a source or a target of another rule. */
export function isIllegalMergeSource(
  mergeMap: Record<string, string>,
  value: string,
  ignoreSource?: string
): boolean {
  return otherEntries(mergeMap, ignoreSource).some(
    ([source, target]) => source === value || target === value
  )
}

export function getIllegalMergeSourceReason(
  mergeMap: Record<string, string>,
  value: string,
  ignoreSource?: string
): string | null {
  if (!isIllegalMergeSource(mergeMap, value, ignoreSource)) {
    return null
  }

  const occupiedAsTarget = otherEntries(mergeMap, ignoreSource).some(
    ([, target]) => target === value
  )

  return occupiedAsTarget
    ? "This value is already a merge target. Merge rules must be flat — chaining (A→B→C) is not allowed."
    : "This value is already a merge source."
}

/** A target cannot already be a source of another rule (that would chain). */
export function isIllegalMergeTarget(
  mergeMap: Record<string, string>,
  value: string,
  ignoreSource?: string
): boolean {
  return otherEntries(mergeMap, ignoreSource).some(
    ([source]) => source === value
  )
}

function displayNameFor(
  resolvedValue: string,
  valueAliases: Record<string, string>
): string {
  const alias = valueAliases[resolvedValue]?.trim()
  return alias !== undefined && alias !== "" ? alias : resolvedValue
}

/**
 * Cumulative state at one integer keyframe. Every label that ever appears in
 * the series is present; labels not yet seen have `value: 0` (never missing).
 * `rank` is 0-based in this snapshot (value desc, label asc tie-break).
 */
export interface KeyframeEntry {
  value: number
  rank: number
}

export type KeyframeSnapshot = Record<string, KeyframeEntry>

export interface KeyframeSeries {
  totalKeyframes: number
  /**
   * 1-based: `snapshots[k]` is the cumulative state at keyframe `k`.
   * `snapshots[0]` is unused. Length is `totalKeyframes + 1`.
   */
  snapshots: KeyframeSnapshot[]
  /** Label → color from the final ranking. Stable across animation frames. */
  colorAssignments: Record<string, string>
  /** Display string per integer keyframe from `init.timelineLabelColumn`. */
  keyframeLabels: Record<number, string>
}

export interface KeyframeSeriesResult {
  series: KeyframeSeries
  skippedNonNumericCount: number
}

interface ResolvedVisitStats {
  skippedNonNumericCount: number
}

/**
 * Shared resolve pipeline: row filter → merge → exclude → value parse.
 * Alias and unique-name validation happen after all hits are collected.
 */
function forEachResolvedContribution(
  rows: Record<string, string>[],
  init: RaceInit,
  visit: (
    resolved: string,
    delta: number,
    row: Record<string, string>
  ) => void
): ResolvedVisitStats {
  const {
    filter,
    barDimensionColumn,
    excludedValues,
    mergeMap,
    aggregationMode,
    valueColumn,
  } = init

  if (aggregationMode === "sum" && (valueColumn === null || valueColumn === "")) {
    throw new InvalidValueColumnError("Select a value column to sum.")
  }

  const excluded = new Set(excludedValues)
  let skippedNonNumericCount = 0
  let numericHits = 0

  for (const row of rows) {
    if (filter && row[filter.column] !== filter.value) {
      continue
    }

    const raw = row[barDimensionColumn]

    if (raw === undefined || raw === "") {
      continue
    }

    const resolved = mergeMap[raw] ?? raw

    if (excluded.has(resolved)) {
      continue
    }

    let delta = 1

    if (aggregationMode === "sum" && valueColumn !== null) {
      const parsed = parseNumericCell(row[valueColumn])

      if (parsed === null) {
        skippedNonNumericCount += 1
        continue
      }

      delta = parsed
      numericHits += 1
    }

    visit(resolved, delta, row)
  }

  if (
    aggregationMode === "sum" &&
    numericHits === 0 &&
    skippedNonNumericCount > 0
  ) {
    throw new InvalidValueColumnError(`Column "${valueColumn}" is not numeric.`)
  }

  return { skippedNonNumericCount }
}

function assertUniqueDisplayNames(
  resolvedValues: Iterable<string>,
  valueAliases: Record<string, string>
): void {
  const displayToResolved = new Map<string, string>()

  for (const resolved of resolvedValues) {
    const displayName = displayNameFor(resolved, valueAliases)
    const existing = displayToResolved.get(displayName)

    if (existing !== undefined && existing !== resolved) {
      throw new DuplicateDisplayNameError(displayName, [existing, resolved])
    }

    displayToResolved.set(displayName, resolved)
  }
}

function snapshotFromResolved(
  totalsByResolved: Map<string, number>,
  valueAliases: Record<string, string>
): KeyframeSnapshot {
  const snapshot: KeyframeSnapshot = {}

  for (const [resolved, total] of totalsByResolved) {
    const displayName = displayNameFor(resolved, valueAliases)
    const existing = snapshot[displayName]
    snapshot[displayName] = {
      value: (existing?.value ?? 0) + total,
      rank: 0,
    }
  }

  return snapshot
}

function compareSnapshotLabels(
  snapshot: KeyframeSnapshot,
  a: string,
  b: string
): number {
  const diff = snapshot[b].value - snapshot[a].value

  if (Math.abs(diff) <= 1e-9) {
    return a.localeCompare(b)
  }

  return diff
}

function assignRanks(snapshot: KeyframeSnapshot): void {
  const labels = Object.keys(snapshot).sort((a, b) =>
    compareSnapshotLabels(snapshot, a, b)
  )

  for (let index = 0; index < labels.length; index += 1) {
    snapshot[labels[index]].rank = index
  }
}

function parseKeyframe(row: Record<string, string>): number | null {
  const parsed = parseNumericCell(row[KEYFRAME_COLUMN])

  if (parsed === null || !Number.isInteger(parsed) || parsed < 1) {
    return null
  }

  return parsed
}

function barsFromSnapshot(snapshot: KeyframeSnapshot): RaceBar[] {
  return Object.entries(snapshot)
    .map(([label, entry]) => ({
      label,
      value: entry.value,
      continuousRank: entry.rank,
      isReceivingData: false,
    }))
    .sort((a, b) => a.continuousRank - b.continuousRank)
}

/**
 * Running-sum ranking at every integer keyframe, in numeric keyframe order
 * (not string sort). Gaps copy the previous cumulative state. Labels that
 * have not appeared yet are `0` in earlier snapshots.
 *
 * Same resolve pipeline as `computeRaceBars`: filter → merge → exclude →
 * alias → unique-name validation.
 */
export function computeKeyframeSeries(
  rows: Record<string, string>[],
  init: RaceInit
): KeyframeSeriesResult {
  const normalized = normalizeRaceInit(init)
  const totalsByResolved = new Map<string, number>()
  const deltaByKeyframe = new Map<number, Map<string, number>>()
  const rawLabelByKeyframe = new Map<number, string>()
  const timelineColumn = normalized.timelineLabelColumn

  const { skippedNonNumericCount } = forEachResolvedContribution(
    rows,
    normalized,
    (resolved, delta, row) => {
      const keyframe = parseKeyframe(row)

      if (keyframe === null) {
        return
      }

      totalsByResolved.set(
        resolved,
        (totalsByResolved.get(resolved) ?? 0) + delta
      )

      let bucket = deltaByKeyframe.get(keyframe)

      if (!bucket) {
        bucket = new Map()
        deltaByKeyframe.set(keyframe, bucket)
      }

      bucket.set(resolved, (bucket.get(resolved) ?? 0) + delta)

      if (timelineColumn !== "" && !rawLabelByKeyframe.has(keyframe)) {
        const raw = row[timelineColumn]
        if (raw !== undefined && raw !== "") {
          rawLabelByKeyframe.set(keyframe, raw)
        }
      }
    }
  )

  assertUniqueDisplayNames(totalsByResolved.keys(), normalized.valueAliases)

  const maxKeyframe =
    deltaByKeyframe.size === 0 ? 0 : Math.max(...deltaByKeyframe.keys())
  const runningByResolved = new Map<string, number>()
  const snapshots: KeyframeSnapshot[] = new Array(maxKeyframe + 1)

  for (let keyframe = 1; keyframe <= maxKeyframe; keyframe += 1) {
    const bucket = deltaByKeyframe.get(keyframe)

    if (bucket) {
      for (const [resolved, delta] of bucket) {
        runningByResolved.set(
          resolved,
          (runningByResolved.get(resolved) ?? 0) + delta
        )
      }
    }

    snapshots[keyframe] = snapshotFromResolved(
      runningByResolved,
      normalized.valueAliases
    )
  }

  if (maxKeyframe >= 1) {
    const allLabels = Object.keys(snapshots[maxKeyframe])

    for (let keyframe = 1; keyframe <= maxKeyframe; keyframe += 1) {
      const snapshot = snapshots[keyframe]

      for (const label of allLabels) {
        if (snapshot[label] === undefined) {
          snapshot[label] = { value: 0, rank: 0 }
        }
      }

      assignRanks(snapshot)
    }
  }

  const colorAssignments =
    maxKeyframe < 1
      ? {}
      : buildColorAssignments(barsFromSnapshot(snapshots[maxKeyframe]))

  const keyframeLabels: Record<number, string> = {}
  let carried = ""

  for (let keyframe = 1; keyframe <= maxKeyframe; keyframe += 1) {
    const found = rawLabelByKeyframe.get(keyframe)
    if (found !== undefined && found !== "") {
      carried = found
    }
    keyframeLabels[keyframe] = carried
  }

  return {
    series: {
      totalKeyframes: maxKeyframe,
      snapshots,
      colorAssignments,
      keyframeLabels,
    },
    skippedNonNumericCount,
  }
}

/**
 * Last snapshot of `computeKeyframeSeries`. Ranking is computed over every
 * group; Top N is applied at render time only.
 *
 * Order: row filter → merge → exclude → alias → unique-name validation → groupBy.
 */
export function computeRaceBars(
  rows: Record<string, string>[],
  init: RaceInit
): RaceComputeResult {
  const { series, skippedNonNumericCount } = computeKeyframeSeries(rows, init)

  if (series.totalKeyframes < 1) {
    return {
      bars: [],
      skippedNonNumericCount,
      colorAssignments: {},
      keyframeLabels: {},
      totalKeyframes: 0,
    }
  }

  return {
    bars: barsFromSnapshot(series.snapshots[series.totalKeyframes]),
    skippedNonNumericCount,
    colorAssignments: series.colorAssignments,
    keyframeLabels: series.keyframeLabels,
    totalKeyframes: series.totalKeyframes,
  }
}
