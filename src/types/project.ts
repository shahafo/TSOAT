export interface Project {
  id: string
  name: string
  /** Path relative to `public/`, e.g. `streams/friends_words.csv`. */
  eventStreamPath: string
  createdAt: number
}
