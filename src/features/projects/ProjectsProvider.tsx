import * as React from "react"

import {
  addProject,
  addRaceConfig,
  getAllProjects,
  getRacesByProject,
  updateRaceConfig,
} from "@/lib/db"
import type { Project } from "@/types/project"
import { normalizeRaceInit, normalizeRaceDesign, type RaceConfig, type RaceDesign, type RaceInit } from "@/types/race"

interface CreateProjectInput {
  name: string
  eventStreamPath: string
}

export type WorkView =
  | "empty"
  | "add-project"
  | "project"
  | "race-settings"
  | "race"

interface ProjectsContextValue {
  projects: Project[]
  races: RaceConfig[]
  isLoading: boolean
  workView: WorkView
  selectedProject: Project | null
  selectedRace: RaceConfig | null
  selectProject: (projectId: string) => void
  openAddProject: () => void
  openNewRace: () => void
  openRace: (raceId: string) => void
  editSelectedRace: () => void
  closeRaceSettings: () => void
  createProject: (input: CreateProjectInput) => Promise<void>
  createRace: (init: RaceInit, design: RaceDesign) => Promise<void>
  updateRace: (
    raceId: string,
    updates: { init?: Partial<RaceInit>; design?: Partial<RaceDesign> }
  ) => Promise<void>
}

const ProjectsContext = React.createContext<ProjectsContextValue | null>(null)

export function ProjectsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [projects, setProjects] = React.useState<Project[]>([])
  const [races, setRaces] = React.useState<RaceConfig[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [selectedProjectId, setSelectedProjectId] = React.useState<
    string | null
  >(null)
  const [selectedRaceId, setSelectedRaceId] = React.useState<string | null>(
    null
  )
  const [workView, setWorkView] = React.useState<WorkView>("empty")

  React.useEffect(() => {
    let cancelled = false

    getAllProjects()
      .then((stored) => {
        if (!cancelled) {
          setProjects(stored)
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to load projects from IndexedDB", error)
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (!selectedProjectId) {
      setRaces([])
      return
    }

    let cancelled = false

    getRacesByProject(selectedProjectId)
      .then((stored) => {
        if (!cancelled) {
          setRaces(stored)
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to load races from IndexedDB", error)
      })

    return () => {
      cancelled = true
    }
  }, [selectedProjectId])

  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? null
  const selectedRace = races.find((race) => race.id === selectedRaceId) ?? null

  const selectProject = React.useCallback((projectId: string) => {
    setSelectedProjectId(projectId)
    setSelectedRaceId(null)
    setWorkView("project")
  }, [])

  const openAddProject = React.useCallback(() => {
    setSelectedProjectId(null)
    setSelectedRaceId(null)
    setWorkView("add-project")
  }, [])

  const openNewRace = React.useCallback(() => {
    setSelectedRaceId(null)
    setWorkView("race-settings")
  }, [])

  const openRace = React.useCallback((raceId: string) => {
    setSelectedRaceId(raceId)
    setWorkView("race")
  }, [])

  const editSelectedRace = React.useCallback(() => {
    setWorkView("race-settings")
  }, [])

  const closeRaceSettings = React.useCallback(() => {
    setWorkView(selectedRaceId ? "race" : "project")
  }, [selectedRaceId])

  const createProject = React.useCallback(
    async ({ name, eventStreamPath }: CreateProjectInput) => {
      const project: Project = {
        id: crypto.randomUUID(),
        name,
        eventStreamPath,
        createdAt: Date.now(),
      }

      await addProject(project)
      setProjects(await getAllProjects())
      setSelectedProjectId(project.id)
      setSelectedRaceId(null)
      setWorkView("project")
    },
    []
  )

  const createRace = React.useCallback(
    async (init: RaceInit, design: RaceDesign) => {
      if (!selectedProjectId) {
        throw new Error("Cannot create a race without a selected project")
      }

      const config: RaceConfig = {
        id: crypto.randomUUID(),
        projectId: selectedProjectId,
        createdAt: Date.now(),
        init: normalizeRaceInit(init),
        design: normalizeRaceDesign(design),
      }

      await addRaceConfig(config)
      setRaces(await getRacesByProject(selectedProjectId))
      setSelectedRaceId(null)
      setWorkView("project")
    },
    [selectedProjectId]
  )

  const updateRace = React.useCallback(
    async (
      raceId: string,
      updates: { init?: Partial<RaceInit>; design?: Partial<RaceDesign> }
    ) => {
      await updateRaceConfig(raceId, updates)

      if (selectedProjectId) {
        setRaces(await getRacesByProject(selectedProjectId))
      }
    },
    [selectedProjectId]
  )

  const value = React.useMemo<ProjectsContextValue>(
    () => ({
      projects,
      races,
      isLoading,
      workView,
      selectedProject,
      selectedRace,
      selectProject,
      openAddProject,
      openNewRace,
      openRace,
      editSelectedRace,
      closeRaceSettings,
      createProject,
      createRace,
      updateRace,
    }),
    [
      projects,
      races,
      isLoading,
      workView,
      selectedProject,
      selectedRace,
      selectProject,
      openAddProject,
      openNewRace,
      openRace,
      editSelectedRace,
      closeRaceSettings,
      createProject,
      createRace,
      updateRace,
    ]
  )

  return (
    <ProjectsContext.Provider value={value}>
      {children}
    </ProjectsContext.Provider>
  )
}

export function useProjects(): ProjectsContextValue {
  const context = React.useContext(ProjectsContext)

  if (!context) {
    throw new Error("useProjects must be used within a ProjectsProvider")
  }

  return context
}
