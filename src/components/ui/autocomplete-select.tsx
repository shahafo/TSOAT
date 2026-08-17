import * as React from "react"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export function AutocompleteSelect({
  value,
  onValueChange,
  options,
  placeholder = "Search…",
  disabled = false,
  invalid = false,
  disabledValues,
  className,
}: {
  value: string
  onValueChange: (value: string) => void
  options: string[]
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
  disabledValues?: Set<string>
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState<string | null>(null)
  const [highlight, setHighlight] = React.useState(0)
  const [width, setWidth] = React.useState<number>()
  const boxRef = React.useRef<HTMLDivElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)

  const filtered = React.useMemo(() => {
    const needle = (query ?? "").trim().toLowerCase()

    if (query === null || needle === "") {
      return options
    }

    return options.filter((option) => option.toLowerCase().includes(needle))
  }, [options, query])

  const selectable = React.useMemo(
    () => filtered.filter((option) => !disabledValues?.has(option)),
    [disabledValues, filtered]
  )

  React.useEffect(() => {
    setHighlight(0)
  }, [query, open])

  React.useEffect(() => {
    const item = listRef.current?.querySelector<HTMLElement>(
      `[data-combo-index="${highlight}"]`
    )
    item?.scrollIntoView({ block: "nearest" })
  }, [highlight])

  function openList() {
    setWidth(boxRef.current?.offsetWidth)
    setOpen(true)
  }

  function closeList() {
    setOpen(false)
    setQuery(null)
  }

  function select(option: string) {
    if (disabledValues?.has(option)) {
      return
    }

    onValueChange(option)
    closeList()
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      if (!open) {
        openList()
        return
      }

      setHighlight((current) =>
        selectable.length === 0 ? 0 : (current + 1) % selectable.length
      )
      return
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      if (!open) {
        openList()
        return
      }

      setHighlight((current) =>
        selectable.length === 0
          ? 0
          : (current - 1 + selectable.length) % selectable.length
      )
      return
    }

    if (event.key === "Enter") {
      if (!open) {
        return
      }

      event.preventDefault()
      const option = selectable[highlight]
      if (option !== undefined) {
        select(option)
      }
      return
    }

    if (event.key === "Escape") {
      event.preventDefault()
      closeList()
    }
  }

  const display = query ?? value

  return (
    <Popover
      modal={false}
      open={open}
      onOpenChange={(next) => {
        if (next) {
          openList()
          return
        }

        closeList()
      }}
    >
      <PopoverAnchor asChild>
        <div ref={boxRef} className={cn("relative w-full", className)}>
          <Input
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            aria-invalid={invalid || undefined}
            disabled={disabled}
            placeholder={placeholder}
            value={display}
            onFocus={(event) => {
              openList()
              event.target.select()
            }}
            onChange={(event) => {
              setQuery(event.target.value)
              openList()
            }}
            onKeyDown={handleKeyDown}
            className="pr-7"
          />
          <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground" />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        style={width ? { width } : undefined}
        className="p-1"
      >
        <div ref={listRef} role="listbox" className="max-h-56 overflow-auto">
          {filtered.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              No matches
            </p>
          ) : (
            filtered.map((option) => {
              const isDisabled = disabledValues?.has(option) ?? false
              const selectableIndex = selectable.indexOf(option)
              const isActive =
                !isDisabled && selectableIndex === highlight

              return (
                <button
                  key={option}
                  type="button"
                  role="option"
                  data-combo-index={
                    selectableIndex >= 0 ? selectableIndex : undefined
                  }
                  aria-selected={option === value}
                  disabled={isDisabled}
                  className={cn(
                    "relative flex w-full cursor-default items-center rounded-md py-1 pr-8 pl-1.5 text-left text-sm outline-hidden select-none",
                    isActive && "bg-accent text-accent-foreground",
                    isDisabled && "pointer-events-none opacity-50"
                  )}
                  onMouseEnter={() => {
                    if (!isDisabled && selectableIndex >= 0) {
                      setHighlight(selectableIndex)
                    }
                  }}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => select(option)}
                >
                  <span className="min-w-0 truncate">{option}</span>
                  {option === value && (
                    <CheckIcon className="pointer-events-none absolute right-2 size-4" />
                  )}
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
