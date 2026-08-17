import { openDB, type DBSchema, type IDBPDatabase } from "idb"

import type { Project } from "@/types/project"
import { normalizeRaceInit, normalizeRaceDesign, normalizeCanvasBackground, type RaceConfig, type RaceDesign, type RaceInit } from "@/types/race"

const DB_NAME = "tsoat"
const DB_VERSION = 4
const PROJECTS_STORE = "projects"
const RACES_STORE = "raceConfigs"
const BACKGROUND_IMAGES_STORE = "backgroundImages"

interface BackgroundImageRecord {
  id: string
  blob: Blob
  createdAt: number
}

interface TsoatDB extends DBSchema {
  projects: {
    key: string
    value: Project
    indexes: { "by-created-at": number }
  }
  raceConfigs: {
    key: string
    value: RaceConfig
    indexes: { "by-project-id": string }
  }
  backgroundImages: {
    key: string
    value: BackgroundImageRecord
  }
}

let dbPromise: Promise<IDBPDatabase<TsoatDB>> | undefined

function getDb() {
  dbPromise ??= openDB<TsoatDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
        const projects = db.createObjectStore(PROJECTS_STORE, { keyPath: "id" })
        projects.createIndex("by-created-at", "createdAt")
      }

      // v3: Race configs moved from a flat shape to nested init/design.
      // Development data only, so the store is recreated instead of migrated.
      if (oldVersion < 3) {
        if (db.objectStoreNames.contains(RACES_STORE)) {
          db.deleteObjectStore(RACES_STORE)
        }

        const races = db.createObjectStore(RACES_STORE, { keyPath: "id" })
        races.createIndex("by-project-id", "projectId")
      }

      if (oldVersion < 4 && !db.objectStoreNames.contains(BACKGROUND_IMAGES_STORE)) {
        db.createObjectStore(BACKGROUND_IMAGES_STORE, { keyPath: "id" })
      }
    },
    blocked() {
      console.warn(
        "IndexedDB upgrade is blocked by another open tab. Close it to continue."
      )
    },
    // Another tab wants to upgrade or delete the database: release our
    // connection so it can proceed instead of deadlocking.
    blocking() {
      void dbPromise?.then((db) => db.close())
      dbPromise = undefined
    },
  })

  return dbPromise
}

export async function getAllProjects(): Promise<Project[]> {
  const db = await getDb()
  return db.getAllFromIndex(PROJECTS_STORE, "by-created-at")
}

export async function addProject(project: Project): Promise<void> {
  const db = await getDb()
  await db.add(PROJECTS_STORE, project)
}

export async function getRacesByProject(
  projectId: string
): Promise<RaceConfig[]> {
  const db = await getDb()
  const races = await db.getAllFromIndex(
    RACES_STORE,
    "by-project-id",
    projectId
  )
  return races
    .map((race) => ({
      ...race,
      init: normalizeRaceInit(race.init),
      design: normalizeRaceDesign(race.design),
    }))
    .sort((a, b) => a.createdAt - b.createdAt)
}

export async function addRaceConfig(config: RaceConfig): Promise<void> {
  const db = await getDb()
  await db.add(RACES_STORE, {
    ...config,
    init: normalizeRaceInit(config.init),
    design: normalizeRaceDesign(config.design),
  })
}

export async function updateRaceConfig(
  id: string,
  updates: { init?: Partial<RaceInit>; design?: Partial<RaceDesign> }
): Promise<RaceConfig> {
  const db = await getDb()
  const tx = db.transaction(RACES_STORE, "readwrite")
  const existing = await tx.store.get(id)

  if (!existing) {
    throw new Error(`Race config not found: ${id}`)
  }

  const existingDesign = normalizeRaceDesign(existing.design)
  const designPatch = updates.design
  const next: RaceConfig = {
    ...existing,
    init: normalizeRaceInit({ ...existing.init, ...updates.init }),
    design: designPatch
      ? normalizeRaceDesign({
          ...existingDesign,
          ...designPatch,
          labelFont: {
            ...existingDesign.labelFont,
            ...designPatch.labelFont,
          },
          valueFont: {
            ...existingDesign.valueFont,
            ...designPatch.valueFont,
          },
          timelineFont: {
            ...existingDesign.timelineFont,
            ...designPatch.timelineFont,
          },
          timelineLabelFormat: {
            ...existingDesign.timelineLabelFormat,
            ...designPatch.timelineLabelFormat,
          },
          animation: {
            ...existingDesign.animation,
            ...designPatch.animation,
          },
          canvasBackground: normalizeCanvasBackground({
            ...existingDesign.canvasBackground,
            ...designPatch.canvasBackground,
            image: {
              ...existingDesign.canvasBackground.image,
              ...designPatch.canvasBackground?.image,
            },
          }),
          glowEffect: {
            ...existingDesign.glowEffect,
            ...designPatch.glowEffect,
          },
        })
      : existingDesign,
  }

  await tx.store.put(next)
  await tx.done

  return next
}

export async function addBackgroundImage(blob: Blob): Promise<string> {
  const db = await getDb()
  const id = crypto.randomUUID()
  await db.add(BACKGROUND_IMAGES_STORE, {
    id,
    blob,
    createdAt: Date.now(),
  })
  return id
}

export async function getBackgroundImage(id: string): Promise<Blob | undefined> {
  const db = await getDb()
  const record = await db.get(BACKGROUND_IMAGES_STORE, id)
  return record?.blob
}
