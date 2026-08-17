import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useProjects } from "@/features/projects/ProjectsProvider"
import type { Project } from "@/types/project"

export function ProjectScreen({ project }: { project: Project }) {
  const { races, openNewRace, openRace } = useProjects()

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-medium">{project.name}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {project.eventStreamPath}
          </p>
        </div>
        <Button type="button" size="sm" onClick={openNewRace}>
          <PlusIcon />
          New Race
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">Races</h3>
        {races.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            No races yet
          </div>
        ) : (
          <ul className="flex flex-col gap-1 overflow-auto">
            {races.map((race) => (
              <li key={race.id}>
                <button
                  type="button"
                  onClick={() => openRace(race.id)}
                  className="w-full truncate rounded-md border px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  {race.init.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
