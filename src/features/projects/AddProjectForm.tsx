import * as React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { EventStreamPicker } from "@/features/projects/EventStreamPicker"
import { useProjects } from "@/features/projects/ProjectsProvider"

export function AddProjectForm() {
  const { createProject } = useProjects()
  const [name, setName] = React.useState("")
  const [eventStreamPath, setEventStreamPath] = React.useState("")
  const [isSaving, setIsSaving] = React.useState(false)

  const canSubmit = name.trim() !== "" && eventStreamPath !== "" && !isSaving

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!canSubmit) {
      return
    }

    setIsSaving(true)

    try {
      await createProject({ name: name.trim(), eventStreamPath })
    } catch (error: unknown) {
      console.error("Failed to save project", error)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h2 className="text-sm font-medium text-muted-foreground">Add Project</h2>

      <div className="flex flex-col gap-2">
        <Label htmlFor="project-name">Project name</Label>
        <Input
          id="project-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Event stream file</Label>
        <EventStreamPicker
          value={eventStreamPath}
          onChange={setEventStreamPath}
        />
      </div>

      <Button type="submit" disabled={!canSubmit} className="self-start">
        OK
      </Button>
    </form>
  )
}
