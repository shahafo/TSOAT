import Papa from "papaparse"

/** Conventional column that always drives playback order. Never user-selected. */
export const KEYFRAME_COLUMN = "keyframe"

export interface EventStreamData {
  columns: string[]
  /** Columns available for user-facing role pickers (excludes `keyframe`). */
  selectableColumns: string[]
  /**
   * Columns whose first ~50 non-empty values all parse as finite numbers.
   * Includes `keyframe` when it qualifies.
   */
  numericColumns: string[]
  rows: Record<string, string>[]
  uniqueValuesByColumn: Record<string, string[]>
}

export class EventStreamError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EventStreamError"
  }
}

const NUMERIC_SAMPLE_SIZE = 50

/** Empty / non-finite values return null. `Number("")` is not treated as 0. */
export function parseNumericCell(raw: string | undefined): number | null {
  if (raw === undefined) {
    return null
  }

  const trimmed = raw.trim()

  if (trimmed === "") {
    return null
  }

  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

export function detectNumericColumns(
  columns: string[],
  rows: Record<string, string>[]
): string[] {
  const sample = rows.slice(0, NUMERIC_SAMPLE_SIZE)

  return columns.filter((column) => {
    let seen = 0

    for (const row of sample) {
      const raw = row[column]
      const empty = raw === undefined || raw.trim() === ""

      if (empty) {
        continue
      }

      if (parseNumericCell(raw) === null) {
        return false
      }

      seen += 1
    }

    return seen > 0
  })
}

/**
 * Fetches a CSV under `public/` (path relative to public root) and parses it.
 * Requires a `keyframe` header column.
 */
export async function loadEventStream(
  eventStreamPath: string
): Promise<EventStreamData> {
  const response = await fetch(`/${eventStreamPath}`, { cache: "no-store" })

  if (!response.ok) {
    throw new EventStreamError(
      response.status === 404
        ? `Event stream file not found: ${eventStreamPath}`
        : `Failed to load event stream (${response.status}): ${eventStreamPath}`
    )
  }

  const text = await response.text()

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  })

  if (parsed.errors.length > 0) {
    const first = parsed.errors[0]
    throw new EventStreamError(
      `Failed to parse event stream CSV: ${first.message}`
    )
  }

  const columns = parsed.meta.fields?.filter(Boolean) ?? []

  if (!columns.includes(KEYFRAME_COLUMN)) {
    throw new EventStreamError(
      `Event stream is missing the required "${KEYFRAME_COLUMN}" column.`
    )
  }

  const rows = parsed.data
  const selectableColumns = columns.filter((column) => column !== KEYFRAME_COLUMN)
  const uniqueValuesByColumn: Record<string, string[]> = {}

  for (const column of selectableColumns) {
    const values = new Set<string>()

    for (const row of rows) {
      const value = row[column]
      if (value !== undefined && value !== "") {
        values.add(value)
      }
    }

    uniqueValuesByColumn[column] = Array.from(values).sort((a, b) =>
      a.localeCompare(b)
    )
  }

  return {
    columns,
    selectableColumns,
    numericColumns: detectNumericColumns(columns, rows),
    rows,
    uniqueValuesByColumn,
  }
}
