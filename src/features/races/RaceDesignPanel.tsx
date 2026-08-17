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
import { useRacePreview } from "@/features/races/RacePreviewProvider"
import { addBackgroundImage, getBackgroundImage } from "@/lib/db"
import {
  CANVAS_FONT_FAMILIES,
  COLOR_TOO_DARK_MESSAGE,
  isColorTooDark,
  toColorInputValue,
} from "@/lib/raceDesign"
import {
  INVALID_TIMELINE_PATTERN_MESSAGE,
  isValidTimelineLabelPattern,
} from "@/lib/timelineLabelFormat"
import {
  clampCanvasBackgroundOpacity,
  MIN_BAR_SCALE_EXPONENT,
  normalizeRaceDesign,
  type CanvasBackground,
  type CanvasBackgroundImage,
  type LabelPosition,
  type NumberFormat,
  type RaceConfig,
  type RaceDesign,
  type RaceFont,
  type TimelineLabelFormat,
} from "@/types/race"

function DesignNumberField({
  id,
  label,
  value,
  min = 0,
  onCommit,
}: {
  id: string
  label: string
  value: number
  min?: number
  onCommit: (next: number) => void
}) {
  const [draft, setDraft] = React.useState(String(value))

  React.useEffect(() => {
    setDraft(String(value))
  }, [value])

  function handleChange(next: string) {
    setDraft(next)

    const parsed = Number.parseInt(next, 10)

    if (!Number.isInteger(parsed) || parsed < min || parsed === value) {
      return
    }

    onCommit(parsed)
  }

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        min={min}
        step={1}
        value={draft}
        onChange={(event) => handleChange(event.target.value)}
      />
    </div>
  )
}

function BarScaleExponentField({
  value,
  onCommit,
}: {
  value: number
  onCommit: (next: number) => void
}) {
  const [draft, setDraft] = React.useState(String(value))

  React.useEffect(() => {
    setDraft(String(value))
  }, [value])

  function parsedExponent(raw: string): number | null {
    const parsed = Number.parseFloat(raw)

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null
    }

    return parsed
  }

  function handleDraftChange(raw: string) {
    setDraft(raw)

    const parsed = parsedExponent(raw)

    if (parsed === null || parsed < MIN_BAR_SCALE_EXPONENT || parsed === value) {
      return
    }

    onCommit(parsed)
  }

  function handleBlur() {
    const parsed = parsedExponent(draft)

    if (parsed === null) {
      setDraft(String(value))
      return
    }

    const next =
      parsed < MIN_BAR_SCALE_EXPONENT ? MIN_BAR_SCALE_EXPONENT : parsed

    setDraft(String(next))

    if (next !== value) {
      onCommit(next)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="race-bar-scale-exponent" className="text-xs">
        Bar Scale Exponent
      </Label>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={MIN_BAR_SCALE_EXPONENT}
          max={2}
          step={0.01}
          value={Math.min(2, Math.max(MIN_BAR_SCALE_EXPONENT, value))}
          onChange={(event) =>
            onCommit(Number.parseFloat(event.target.value))
          }
          className="min-w-0 flex-1"
          aria-label="Bar scale exponent"
        />
        <Input
          id="race-bar-scale-exponent"
          type="number"
          min={MIN_BAR_SCALE_EXPONENT}
          step={0.05}
          className="w-20"
          value={draft}
          onChange={(event) => handleDraftChange(event.target.value)}
          onBlur={handleBlur}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        0.3–0.6 = moderate compression, below 0.2 = aggressive
      </p>
    </div>
  )
}

function CanvasBackgroundFields({
  value,
  onChange,
}: {
  value: CanvasBackground
  onChange: (next: {
    baseColor?: CanvasBackground["baseColor"]
    image?: Partial<CanvasBackgroundImage>
  }) => void
}) {
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)
  const overlay = value.image
  const opacityPercent = Math.round(
    clampCanvasBackgroundOpacity(overlay.opacity) * 100
  )
  const [opacityDraft, setOpacityDraft] = React.useState(String(opacityPercent))

  React.useEffect(() => {
    setOpacityDraft(String(opacityPercent))
  }, [opacityPercent])

  React.useEffect(() => {
    if (!overlay.enabled || !overlay.imageId) {
      setPreviewUrl(null)
      return
    }

    const imageId = overlay.imageId
    let cancelled = false
    let objectUrl: string | null = null

    getBackgroundImage(imageId)
      .then((blob) => {
        if (!blob) {
          return
        }

        const url = URL.createObjectURL(blob)
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }

        objectUrl = url
        setPreviewUrl(url)
      })
      .catch((caught: unknown) => {
        console.error("Failed to load background image preview", caught)
      })

    return () => {
      cancelled = true
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [overlay.enabled, overlay.imageId])

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""

    if (!file) {
      return
    }

    addBackgroundImage(file)
      .then((imageId) => {
        onChange({ image: { enabled: true, imageId } })
      })
      .catch((caught: unknown) => {
        console.error("Failed to save background image", caught)
      })
  }

  function parsedOpacityPercent(raw: string): number | null {
    const parsed = Number.parseFloat(raw)

    if (!Number.isFinite(parsed)) {
      return null
    }

    return parsed
  }

  function commitOpacityPercent(nextPercent: number) {
    const clamped = Math.min(100, Math.max(0, nextPercent))
    onChange({ image: { opacity: clamped / 100 } })
  }

  function handleOpacityDraftChange(raw: string) {
    setOpacityDraft(raw)

    const parsed = parsedOpacityPercent(raw)

    if (parsed === null || parsed < 0 || parsed > 100) {
      return
    }

    const next = parsed / 100

    if (next === overlay.opacity) {
      return
    }

    onChange({ image: { opacity: next } })
  }

  function handleOpacityBlur() {
    const parsed = parsedOpacityPercent(opacityDraft)

    if (parsed === null) {
      setOpacityDraft(String(opacityPercent))
      return
    }

    const clamped = Math.min(100, Math.max(0, parsed))
    setOpacityDraft(String(clamped))

    if (clamped / 100 !== overlay.opacity) {
      commitOpacityPercent(clamped)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs">Base Color</Label>
      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          size="sm"
          variant={value.baseColor === "black" ? "default" : "outline"}
          onClick={() => onChange({ baseColor: "black" })}
        >
          Black
        </Button>
        <Button
          type="button"
          size="sm"
          variant={value.baseColor === "white" ? "default" : "outline"}
          onClick={() => onChange({ baseColor: "white" })}
        >
          White
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        <Label className="text-xs">Overlay Image</Label>
        <Button
          type="button"
          size="sm"
          variant={overlay.enabled ? "default" : "outline"}
          aria-pressed={overlay.enabled}
          onClick={() => onChange({ image: { enabled: !overlay.enabled } })}
        >
          {overlay.enabled ? "On" : "Off"}
        </Button>
      </div>
      {overlay.enabled && (
        <>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handleFileChange}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              Upload Image
            </Button>
            {previewUrl !== null && (
              <img
                src={previewUrl}
                alt="Selected canvas background"
                className="h-10 w-10 rounded-md border border-input object-cover"
              />
            )}
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Image fit</Label>
            <div className="flex flex-wrap gap-1">
              <Button
                type="button"
                size="sm"
                variant={overlay.fit === "cover" ? "default" : "outline"}
                onClick={() => onChange({ image: { fit: "cover" } })}
              >
                Cover
              </Button>
              <Button
                type="button"
                size="sm"
                variant={overlay.fit === "contain" ? "default" : "outline"}
                onClick={() => onChange({ image: { fit: "contain" } })}
              >
                Contain
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="race-canvas-image-opacity" className="text-xs">
              Image Opacity
            </Label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={opacityPercent}
                onChange={(event) =>
                  commitOpacityPercent(Number.parseFloat(event.target.value))
                }
                className="min-w-0 flex-1"
                aria-label="Image opacity"
              />
              <Input
                id="race-canvas-image-opacity"
                type="number"
                min={0}
                max={100}
                step={1}
                className="w-20"
                value={opacityDraft}
                onChange={(event) => handleOpacityDraftChange(event.target.value)}
                onBlur={handleOpacityBlur}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function FontFields({
  idPrefix,
  label,
  font,
  onChange,
}: {
  idPrefix: string
  label: string
  font: RaceFont
  onChange: (next: RaceFont) => void
}) {
  const families = CANVAS_FONT_FAMILIES.includes(
    font.family as (typeof CANVAS_FONT_FAMILIES)[number]
  )
    ? CANVAS_FONT_FAMILIES
    : [font.family, ...CANVAS_FONT_FAMILIES]

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium">{label}</p>
      <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_auto_auto] items-end gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <Label className="text-xs">Family</Label>
          <Select
            value={font.family}
            onValueChange={(family) => onChange({ ...font, family })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {families.map((family) => (
                <SelectItem key={family} value={family}>
                  {family}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DesignNumberField
          id={`${idPrefix}-size`}
          label="Size"
          value={font.sizePx}
          min={8}
          onCommit={(sizePx) => onChange({ ...font, sizePx })}
        />
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${idPrefix}-color`} className="text-xs">
            Color
          </Label>
          <input
            id={`${idPrefix}-color`}
            type="color"
            value={toColorInputValue(font.color)}
            onChange={(event) => onChange({ ...font, color: event.target.value })}
            className="h-8 w-10 cursor-pointer rounded-lg border border-input bg-transparent p-0.5"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Bold</Label>
          <Button
            type="button"
            size="sm"
            variant={font.bold ? "default" : "outline"}
            aria-pressed={font.bold}
            onClick={() => onChange({ ...font, bold: !font.bold })}
          >
            {font.bold ? "On" : "Off"}
          </Button>
        </div>
      </div>
    </div>
  )
}

function TimelineLabelFormatFields({
  format,
  onChange,
}: {
  format: TimelineLabelFormat
  onChange: (next: TimelineLabelFormat) => void
}) {
  const patternError =
    format.enabled && !isValidTimelineLabelPattern(format.pattern)
      ? INVALID_TIMELINE_PATTERN_MESSAGE
      : null

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs">Format Timeline Label</Label>
      <Button
        type="button"
        size="sm"
        variant={format.enabled ? "default" : "outline"}
        aria-pressed={format.enabled}
        onClick={() => onChange({ ...format, enabled: !format.enabled })}
      >
        {format.enabled ? "On" : "Off"}
      </Button>
      {format.enabled && (
        <>
          <div className="flex flex-col gap-1">
            <Label htmlFor="race-timeline-pattern" className="text-xs">
              Pattern (regex)
            </Label>
            <Input
              id="race-timeline-pattern"
              value={format.pattern}
              placeholder={'s(\\d+)_e(\\d+)'}
              aria-invalid={patternError !== null}
              onChange={(event) =>
                onChange({ ...format, pattern: event.target.value })
              }
            />
            {patternError !== null && (
              <p className="text-xs text-destructive">{patternError}</p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="race-timeline-template" className="text-xs">
              Template
            </Label>
            <Input
              id="race-timeline-template"
              value={format.template}
              placeholder="Season {1} Episode {2}"
              onChange={(event) =>
                onChange({ ...format, template: event.target.value })
              }
            />
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={format.stripLeadingZeros}
              onChange={(event) =>
                onChange({
                  ...format,
                  stripLeadingZeros: event.target.checked,
                })
              }
            />
            Strip leading zeros
          </label>
        </>
      )}
    </div>
  )
}

export function RaceDesignPanel({
  race,
  onPatch,
}: {
  race: RaceConfig
  onPatch: (patch: Partial<RaceDesign>) => Promise<void>
}) {
  const design = normalizeRaceDesign(race.design)
  const [colorError, setColorError] = React.useState<string | null>(null)
  const { showSafeZoneGuides, setShowSafeZoneGuides } = useRacePreview()

  function validate(next: RaceDesign): boolean {
    if (
      isColorTooDark(next.labelFont.color) ||
      isColorTooDark(next.valueFont.color) ||
      isColorTooDark(next.timelineFont.color) ||
      (next.colorMode === "uniform" && isColorTooDark(next.uniformColor))
    ) {
      setColorError(COLOR_TOO_DARK_MESSAGE)
      return false
    }

    setColorError(null)
    return true
  }

  function patch(partial: Partial<RaceDesign>) {
    const next = normalizeRaceDesign({
      ...design,
      ...partial,
      labelFont: { ...design.labelFont, ...partial.labelFont },
      valueFont: { ...design.valueFont, ...partial.valueFont },
      timelineFont: { ...design.timelineFont, ...partial.timelineFont },
      timelineLabelFormat: {
        ...design.timelineLabelFormat,
        ...partial.timelineLabelFormat,
      },
      animation: { ...design.animation, ...partial.animation },
      canvasBackground: {
        ...design.canvasBackground,
        ...partial.canvasBackground,
        image: {
          ...design.canvasBackground.image,
          ...partial.canvasBackground?.image,
        },
      },
      glowEffect: { ...design.glowEffect, ...partial.glowEffect },
    })

    if (!validate(next)) {
      return
    }

    onPatch(partial).catch((caught: unknown) => {
      console.error("Failed to save design", caught)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs font-medium text-muted-foreground">Design</p>

      <CanvasBackgroundFields
        value={design.canvasBackground}
        onChange={(partial) =>
          patch({
            canvasBackground: {
              ...design.canvasBackground,
              ...partial,
              image: {
                ...design.canvasBackground.image,
                ...partial.image,
              },
            },
          })
        }
      />

      <BarScaleExponentField
        value={design.barScaleExponent}
        onCommit={(barScaleExponent) => patch({ barScaleExponent })}
      />

      <div className="flex flex-col gap-2">
        <Label className="text-xs">Bar color</Label>
        <div className="flex flex-wrap gap-1">
          <Button
            type="button"
            size="sm"
            variant={design.colorMode === "auto" ? "default" : "outline"}
            onClick={() => patch({ colorMode: "auto" })}
          >
            Auto
          </Button>
          <Button
            type="button"
            size="sm"
            variant={design.colorMode === "uniform" ? "default" : "outline"}
            onClick={() => patch({ colorMode: "uniform" })}
          >
            Uniform
          </Button>
        </div>
        {design.colorMode === "uniform" && (
          <div className="flex items-center gap-2">
            <Label htmlFor="race-uniform-color" className="text-xs">
              Color
            </Label>
            <input
              id="race-uniform-color"
              type="color"
              value={toColorInputValue(design.uniformColor)}
              onChange={(event) =>
                patch({ uniformColor: event.target.value })
              }
              className="h-8 w-10 cursor-pointer rounded-lg border border-input bg-transparent p-0.5"
            />
          </div>
        )}
      </div>

      <FontFields
        idPrefix="race-label-font"
        label="Label"
        font={design.labelFont}
        onChange={(labelFont) => patch({ labelFont })}
      />

      <FontFields
        idPrefix="race-value-font"
        label="Value"
        font={design.valueFont}
        onChange={(valueFont) => patch({ valueFont })}
      />

      <FontFields
        idPrefix="race-timeline-font"
        label="Timeline"
        font={design.timelineFont}
        onChange={(timelineFont) => patch({ timelineFont })}
      />

      <TimelineLabelFormatFields
        format={design.timelineLabelFormat}
        onChange={(timelineLabelFormat) => patch({ timelineLabelFormat })}
      />

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Label position</Label>
          <Select
            value={design.labelPosition}
            onValueChange={(labelPosition) =>
              patch({ labelPosition: labelPosition as LabelPosition })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inside">Inside</SelectItem>
              <SelectItem value="outside">Outside</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Number format</Label>
          <Select
            value={design.numberFormat}
            onValueChange={(numberFormat) =>
              patch({ numberFormat: numberFormat as NumberFormat })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="raw">Raw</SelectItem>
              <SelectItem value="comma">Comma</SelectItem>
              <SelectItem value="abbreviated">Abbreviated</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <DesignNumberField
          id="race-canvas-padding"
          label="Padding"
          value={design.canvasPaddingPx}
          min={0}
          onCommit={(canvasPaddingPx) => patch({ canvasPaddingPx })}
        />
        <DesignNumberField
          id="race-row-height"
          label="Row height"
          value={design.rowHeightPx}
          min={1}
          onCommit={(rowHeightPx) => patch({ rowHeightPx })}
        />
        <DesignNumberField
          id="race-row-gap"
          label="Row gap"
          value={design.rowGapPx}
          min={0}
          onCommit={(rowGapPx) => patch({ rowGapPx })}
        />
        <DesignNumberField
          id="race-bar-radius"
          label="Bar radius"
          value={design.barCornerRadiusPx}
          min={0}
          onCommit={(barCornerRadiusPx) => patch({ barCornerRadiusPx })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          Animation Settings
        </p>
        <DesignNumberField
          id="race-duration-seconds"
          label="Duration (seconds)"
          value={design.animation.durationSeconds}
          min={1}
          onCommit={(durationSeconds) =>
            patch({ animation: { durationSeconds } })
          }
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-xs">Glow on Active Bars</Label>
        <Button
          type="button"
          size="sm"
          variant={design.glowEffect.enabled ? "default" : "outline"}
          aria-pressed={design.glowEffect.enabled}
          onClick={() =>
            patch({ glowEffect: { enabled: !design.glowEffect.enabled } })
          }
        >
          {design.glowEffect.enabled ? "On" : "Off"}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-xs">Show Safe Zone Guides</Label>
        <Button
          type="button"
          size="sm"
          variant={showSafeZoneGuides ? "default" : "outline"}
          aria-pressed={showSafeZoneGuides}
          onClick={() => setShowSafeZoneGuides(!showSafeZoneGuides)}
        >
          {showSafeZoneGuides ? "On" : "Off"}
        </Button>
      </div>

      {colorError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {colorError}
        </p>
      )}
    </div>
  )
}
