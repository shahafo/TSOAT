import { AddProjectForm } from "@/features/projects/AddProjectForm"
import { useProjects } from "@/features/projects/ProjectsProvider"
import { ProjectScreen } from "@/features/races/ProjectScreen"
import { RaceScreen } from "@/features/races/RaceScreen"
import { RaceSettingsForm } from "@/features/races/RaceSettingsForm"

export function WorkArea() {
  const { workView, selectedProject, selectedRace } = useProjects()

  return (
    <div className="flex h-full flex-col overflow-auto p-4">
      {workView === "add-project" ? (
        <AddProjectForm />
      ) : workView === "race-settings" && selectedProject ? (
        <RaceSettingsForm project={selectedProject} race={null} />
      ) : workView === "race" && selectedRace ? (
        <RaceScreen race={selectedRace} />
      ) : workView === "project" && selectedProject ? (
        <ProjectScreen project={selectedProject} />
      ) : (
        <>
          <h2 className="mb-4 text-sm font-medium text-muted-foreground">
            Parameters
          </h2>
          <div className="flex flex-1 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            Empty parameters panel
          </div>
        </>
      )}
    </div>
  )
}
