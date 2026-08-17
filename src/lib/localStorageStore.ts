/**
 * Reserved home for UI-only state (panel sizes, last selected project, ...).
 * IndexedDB (`@/lib/db`) stays the source of truth for project data.
 * Nothing is persisted yet — only the shape and location are fixed.
 */

export const UI_STATE_KEY = "tsoat:ui-state"

export interface UIState {
  lastSelectedProjectId?: string
  panelSizes?: number[]
}

export function saveUIState(_state: UIState): void {
  // TODO: serialize and write to localStorage under UI_STATE_KEY.
}

export function loadUIState(): UIState | null {
  // TODO: read and parse from localStorage under UI_STATE_KEY.
  return null
}
