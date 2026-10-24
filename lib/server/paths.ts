import "server-only"
import { readdir, stat } from "node:fs/promises"
import path from "node:path"

export const PROJECT_ROOT = process.cwd()
export const DATA_DIR = path.resolve(PROJECT_ROOT, process.env.GAME_DATA_DIR ?? "extracted")
export const TEMPLATE_PDB = path.resolve(PROJECT_ROOT, process.env.GAME_PDB ?? "data.pdb")
export const BUILD_DIR = path.resolve(PROJECT_ROOT, "build")
export const BACKUP_DIR = path.resolve(PROJECT_ROOT, "level-backups")

/** Resolve a game-relative path (e.g. "levels/set1/lev01.txt") inside DATA_DIR, rejecting traversal. */
export function resolveDataPath(rel: string): string | null {
  const clean = rel.replace(/\\/g, "/").replace(/^\/+/, "")
  const full = path.resolve(DATA_DIR, clean)
  if (full !== DATA_DIR && !full.startsWith(DATA_DIR + path.sep)) return null
  return full
}

export async function walkFiles(dir: string, filter: (p: string) => boolean): Promise<string[]> {
  const out: string[] = []
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return out
  }
  for (const n of names) {
    const p = path.join(dir, n)
    const s = await stat(p)
    if (s.isDirectory()) out.push(...(await walkFiles(p, filter)))
    else if (filter(p)) out.push(p)
  }
  return out
}

export function toGamePath(full: string): string {
  return path.relative(DATA_DIR, full).split(path.sep).join("/")
}
