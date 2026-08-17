import * as React from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const STREAMS_ENDPOINT = "/api/streams"

export function EventStreamPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (path: string) => void
}) {
  const [paths, setPaths] = React.useState<string[]>([])
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">(
    "loading"
  )

  React.useEffect(() => {
    let cancelled = false

    fetch(STREAMS_ENDPOINT, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`${STREAMS_ENDPOINT} responded ${response.status}`)
        }
        return response.json() as Promise<string[]>
      })
      .then((found) => {
        if (!cancelled) {
          setPaths(found)
          setStatus("ready")
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to list event stream files", error)
        if (!cancelled) {
          setStatus("error")
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const hint = {
    loading: "Loading files from public/streams…",
    error: `Could not read the file list from ${STREAMS_ENDPOINT}.`,
    ready:
      paths.length === 0
        ? "No .csv files found in public/streams."
        : "Files are read from public/streams.",
  }[status]

  return (
    <div className="flex flex-col gap-2">
      <Select
        value={value}
        onValueChange={onChange}
        disabled={paths.length === 0}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select an event stream file" />
        </SelectTrigger>
        <SelectContent>
          {paths.map((path) => (
            <SelectItem key={path} value={path}>
              {path}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}
