import type { TimelineLabelFormat } from "@/types/race"

export const INVALID_TIMELINE_PATTERN_MESSAGE = "Invalid pattern"

export function isValidTimelineLabelPattern(pattern: string): boolean {
  try {
    void new RegExp(pattern)
    return true
  } catch {
    return false
  }
}

function stripLeadingZeros(group: string): string {
  return group.replace(/^0+(?=\d)/, "")
}

/**
 * Render-only display transform. Never mutates stored keyframe labels.
 * Invalid patterns and non-matches fall back to the raw value.
 */
export function formatTimelineLabel(
  rawValue: string,
  format: TimelineLabelFormat
): string {
  if (!format.enabled) {
    return rawValue
  }

  let regex: RegExp
  try {
    regex = new RegExp(format.pattern)
  } catch {
    return rawValue
  }

  let match = regex.exec(rawValue)

  // A UI pattern copied from a TS string (s(\\d+)_e(\\d+)) does not match
  // s01_e01. Collapse one level of backslashes and retry.
  if (match === null) {
    const unescaped = format.pattern.replaceAll("\\\\", "\\")
    if (unescaped !== format.pattern) {
      try {
        match = new RegExp(unescaped).exec(rawValue)
      } catch {
        match = null
      }
    }
  }

  if (match === null) {
    return rawValue
  }

  const groups = match.slice(1).map((group) => {
    const value = group ?? ""
    return format.stripLeadingZeros ? stripLeadingZeros(value) : value
  })

  const formatted = format.template.replace(/\{(\d+)\}/g, (token, rawIndex) => {
    const index = Number.parseInt(rawIndex, 10)

    if (index < 1 || index > groups.length) {
      return token
    }

    return groups[index - 1]
  })

  return formatted === "" ? rawValue : formatted
}
