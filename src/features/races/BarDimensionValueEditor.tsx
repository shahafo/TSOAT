import * as React from "react"
import { PlusIcon, XIcon } from "lucide-react"

import { AutocompleteSelect } from "@/components/ui/autocomplete-select"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  getIllegalMergeSourceReason,
  getMergeRuleConflict,
  isIllegalMergeSource,
  isIllegalMergeTarget,
} from "@/lib/raceCompute"

type DimensionRule =
  | { id: string; kind: "exclude"; value: string }
  | { id: string; kind: "rename"; value: string; alias: string }
  | { id: string; kind: "merge"; source: string; target: string }

function rulesFromStored({
  excludedValues,
  valueAliases,
  mergeMap,
}: {
  excludedValues: string[]
  valueAliases: Record<string, string>
  mergeMap: Record<string, string>
}): DimensionRule[] {
  return [
    ...excludedValues.map(
      (value): DimensionRule => ({
        id: crypto.randomUUID(),
        kind: "exclude",
        value,
      })
    ),
    ...Object.entries(valueAliases).map(
      ([value, alias]): DimensionRule => ({
        id: crypto.randomUUID(),
        kind: "rename",
        value,
        alias,
      })
    ),
    ...Object.entries(mergeMap).map(
      ([source, target]): DimensionRule => ({
        id: crypto.randomUUID(),
        kind: "merge",
        source,
        target,
      })
    ),
  ]
}

function deriveFromRules(rules: DimensionRule[]): {
  excludedValues: string[]
  valueAliases: Record<string, string>
  mergeMap: Record<string, string>
  errors: Record<string, string>
} {
  const excludedValues: string[] = []
  const valueAliases: Record<string, string> = {}
  const mergeMap: Record<string, string> = {}
  const errors: Record<string, string> = {}

  for (const rule of rules) {
    if (rule.kind === "exclude") {
      if (rule.value === "") {
        continue
      }

      if (excludedValues.includes(rule.value)) {
        errors[rule.id] = "This value is already excluded."
        continue
      }

      excludedValues.push(rule.value)
      continue
    }

    if (rule.kind === "rename") {
      if (rule.value === "") {
        continue
      }

      if (valueAliases[rule.value] !== undefined) {
        errors[rule.id] = "This value already has a rename rule."
        continue
      }

      if (rule.alias.trim() !== "") {
        valueAliases[rule.value] = rule.alias
      }

      continue
    }

    if (rule.source !== "" && isIllegalMergeSource(mergeMap, rule.source)) {
      errors[rule.id] =
        getIllegalMergeSourceReason(mergeMap, rule.source) ??
        "This value cannot be a merge source."
      continue
    }

    if (rule.source === "" || rule.target === "") {
      continue
    }

    const conflict = getMergeRuleConflict(mergeMap, rule.source, rule.target)

    if (conflict) {
      errors[rule.id] = conflict
      continue
    }

    mergeMap[rule.source] = rule.target
  }

  for (const rule of rules) {
    if (rule.kind === "exclude" && rule.value !== "" && mergeMap[rule.value]) {
      errors[rule.id] =
        `Merged into ${mergeMap[rule.value]}. Exclude is controlled on the target.`
    }

    if (rule.kind === "rename" && rule.value !== "" && mergeMap[rule.value]) {
      errors[rule.id] =
        `Merged into ${mergeMap[rule.value]}. Rename is controlled on the target.`
    }
  }

  return { excludedValues, valueAliases, mergeMap, errors }
}

function sameStringList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function sameStringMap(
  left: Record<string, string>,
  right: Record<string, string>
): boolean {
  const keys = Object.keys(left)

  if (keys.length !== Object.keys(right).length) {
    return false
  }

  return keys.every((key) => left[key] === right[key])
}

function optionsFor(current: string, pool: string[]): string[] {
  if (current !== "" && !pool.includes(current)) {
    return [current, ...pool]
  }

  return pool
}

export function BarDimensionValueEditor({
  values,
  excludedValues,
  valueAliases,
  mergeMap,
  onExcludedChange,
  onAliasChange,
  onMergeMapChange,
  onConflictChange,
}: {
  values: string[]
  excludedValues: string[]
  valueAliases: Record<string, string>
  mergeMap: Record<string, string>
  onExcludedChange: (next: string[]) => void
  onAliasChange: (next: Record<string, string>) => void
  onMergeMapChange: (next: Record<string, string>) => void
  onConflictChange: (hasConflict: boolean) => void
}) {
  const [rules, setRules] = React.useState<DimensionRule[]>(() =>
    rulesFromStored({ excludedValues, valueAliases, mergeMap })
  )

  const derived = React.useMemo(() => deriveFromRules(rules), [rules])

  React.useEffect(() => {
    if (!sameStringList(derived.excludedValues, excludedValues)) {
      onExcludedChange(derived.excludedValues)
    }

    if (!sameStringMap(derived.valueAliases, valueAliases)) {
      onAliasChange(derived.valueAliases)
    }

    if (!sameStringMap(derived.mergeMap, mergeMap)) {
      onMergeMapChange(derived.mergeMap)
    }

    onConflictChange(Object.keys(derived.errors).length > 0)
  }, [
    derived,
    excludedValues,
    mergeMap,
    onAliasChange,
    onConflictChange,
    onExcludedChange,
    onMergeMapChange,
    valueAliases,
  ])

  const mergeSources = React.useMemo(
    () => new Set(Object.keys(derived.mergeMap)),
    [derived.mergeMap]
  )
  const excludedSet = React.useMemo(
    () => new Set(derived.excludedValues),
    [derived.excludedValues]
  )
  const renamedSet = React.useMemo(
    () => new Set(Object.keys(derived.valueAliases)),
    [derived.valueAliases]
  )
  const mergeableValues = React.useMemo(
    () => values.filter((value) => !excludedSet.has(value)),
    [excludedSet, values]
  )

  function addRule(kind: DimensionRule["kind"]) {
    setRules((prev) => {
      if (kind === "exclude") {
        return [...prev, { id: crypto.randomUUID(), kind, value: "" }]
      }

      if (kind === "rename") {
        return [...prev, { id: crypto.randomUUID(), kind, value: "", alias: "" }]
      }

      return [...prev, { id: crypto.randomUUID(), kind, source: "", target: "" }]
    })
  }

  function removeRule(id: string) {
    setRules((prev) => prev.filter((rule) => rule.id !== id))
  }

  function patchRule(
    id: string,
    patch: { value?: string; alias?: string; source?: string; target?: string }
  ) {
    setRules((prev) =>
      prev.map((rule) =>
        rule.id === id ? ({ ...rule, ...patch } as DimensionRule) : rule
      )
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label>Value rules</Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={values.length === 0}
            >
              <PlusIcon />
              Add rule
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onSelect={() => addRule("exclude")}>
              Exclude
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => addRule("rename")}>
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => addRule("merge")}>
              Merge
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="text-xs text-muted-foreground">
        Merge rules are flat: a value cannot be both a source and a target, so
        chaining (A→B then B→C) is blocked.
      </p>

      {values.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Unique bar-dimension values will appear here once a column (and
          optional filter) is selected.
        </p>
      ) : null}

      {rules.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rules.map((rule) => {
            const error = derived.errors[rule.id]

            if (rule.kind === "exclude") {
              const disabledValues = new Set(
                [...excludedSet, ...mergeSources].filter(
                  (value) => value !== rule.value
                )
              )

              return (
                <li key={rule.id} className="flex flex-col gap-1">
                  <div className="flex items-start gap-2">
                    <span className="mt-2 w-16 shrink-0 text-xs text-muted-foreground">
                      Exclude
                    </span>
                    <AutocompleteSelect
                      className="min-w-0 flex-1"
                      value={rule.value}
                      onValueChange={(value) => patchRule(rule.id, { value })}
                      options={optionsFor(rule.value, values)}
                      placeholder="Select a value"
                      invalid={Boolean(error)}
                      disabledValues={disabledValues}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove exclude rule"
                      onClick={() => removeRule(rule.id)}
                    >
                      <XIcon />
                    </Button>
                  </div>
                  {error && <p className="pl-[4.5rem] text-xs text-destructive">{error}</p>}
                </li>
              )
            }

            if (rule.kind === "rename") {
              const disabledValues = new Set(
                [...renamedSet, ...mergeSources].filter(
                  (value) => value !== rule.value
                )
              )

              return (
                <li key={rule.id} className="flex flex-col gap-1">
                  <div className="flex items-start gap-2">
                    <span className="mt-2 w-16 shrink-0 text-xs text-muted-foreground">
                      Rename
                    </span>
                    <AutocompleteSelect
                      className="min-w-0 flex-1"
                      value={rule.value}
                      onValueChange={(value) => patchRule(rule.id, { value })}
                      options={optionsFor(rule.value, values)}
                      placeholder="Select a value"
                      invalid={Boolean(error)}
                      disabledValues={disabledValues}
                    />
                    <Input
                      className="min-w-0 flex-1"
                      aria-label="Rename to"
                      placeholder="New name"
                      value={rule.alias}
                      onChange={(event) =>
                        patchRule(rule.id, { alias: event.target.value })
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove rename rule"
                      onClick={() => removeRule(rule.id)}
                    >
                      <XIcon />
                    </Button>
                  </div>
                  {error && <p className="pl-[4.5rem] text-xs text-destructive">{error}</p>}
                </li>
              )
            }

            const sourceDisabled = new Set(
              mergeableValues.filter(
                (option) =>
                  option !== rule.source &&
                  (isIllegalMergeSource(
                    derived.mergeMap,
                    option,
                    rule.source
                  ) ||
                    option === rule.target)
              )
            )
            const targetDisabled = new Set(
              mergeableValues.filter(
                (option) =>
                  option !== rule.target &&
                  (isIllegalMergeTarget(
                    derived.mergeMap,
                    option,
                    rule.source
                  ) ||
                    option === rule.source)
              )
            )

            return (
              <li key={rule.id} className="flex flex-col gap-1">
                <div className="flex items-start gap-2">
                  <span className="mt-2 w-16 shrink-0 text-xs text-muted-foreground">
                    Merge
                  </span>
                  <AutocompleteSelect
                    className="min-w-0 flex-1"
                    value={rule.source}
                    onValueChange={(source) => patchRule(rule.id, { source })}
                    options={optionsFor(rule.source, mergeableValues)}
                    placeholder="Merge this value"
                    invalid={Boolean(error)}
                    disabledValues={sourceDisabled}
                  />
                  <AutocompleteSelect
                    className="min-w-0 flex-1"
                    value={rule.target}
                    onValueChange={(target) => patchRule(rule.id, { target })}
                    options={optionsFor(rule.target, mergeableValues)}
                    placeholder="Into this value"
                    invalid={Boolean(error)}
                    disabledValues={targetDisabled}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove merge rule"
                    onClick={() => removeRule(rule.id)}
                  >
                    <XIcon />
                  </Button>
                </div>
                {error && <p className="pl-[4.5rem] text-xs text-destructive">{error}</p>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
