import * as React from "react"
import { ChevronDownIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  hasFilterConsistencyIssue,
  type FilterConsistencyResult,
} from "@/lib/raceCompute"

function ValueList({
  label,
  values,
  action,
}: {
  label: string
  values: string[]
  action?: React.ReactNode
}) {
  if (values.length === 0) {
    return null
  }

  return (
    <Collapsible>
      <div className="flex items-start gap-1">
        <p className="min-w-0 flex-1">{label}</p>
        {action}
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="shrink-0"
          >
            Details
            <ChevronDownIcon className="size-3" />
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <ul className="mt-1 flex flex-col gap-0.5 font-mono text-xs">
          {values.map((value) => (
            <li key={value} className="truncate">
              {value}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function FilterConsistencyBanner({
  result,
  onPruneOrphaned,
}: {
  result: FilterConsistencyResult
  onPruneOrphaned?: () => void
}) {
  const [dismissed, setDismissed] = React.useState(false)
  const signature = JSON.stringify(result)

  React.useEffect(() => {
    setDismissed(false)
  }, [signature])

  if (dismissed || !hasFilterConsistencyIssue(result)) {
    return null
  }

  const orphanedItems = [
    ...result.orphanedExcludes.map((value) => `${value} (exclude)`),
    ...result.orphanedMergeKeys.map((value) => `${value} (merge)`),
    ...result.orphanedAliasKeys.map((value) => `${value} (rename)`),
  ]
  const orphanedCount = orphanedItems.length

  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <ValueList
            label={
              orphanedCount === 1
                ? "1 exclude/merge/rename rule points to a value that no longer exists in the file."
                : `${orphanedCount} exclude/merge/rename rules point to values that no longer exist in the file.`
            }
            values={orphanedItems}
            action={
              onPruneOrphaned ? (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="shrink-0"
                  onClick={onPruneOrphaned}
                >
                  Clean up
                </Button>
              ) : null
            }
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Dismiss filter consistency warning"
          onClick={() => setDismissed(true)}
        >
          <XIcon />
        </Button>
      </div>
    </div>
  )
}
