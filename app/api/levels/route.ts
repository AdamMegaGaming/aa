import { stat } from "node:fs/promises"
import path from "node:path"
import { NextResponse } from "next/server"
import { DATA_DIR, toGamePath, walkFiles } from "@/lib/server/paths"
import type { LevelListItem } from "@/lib/types"

export const dynamic = "force-dynamic"

export async function GET() {
  const files = await walkFiles(path.join(DATA_DIR, "levels"), (p) => p.endsWith(".txt"))
  const items: LevelListItem[] = await Promise.all(
    files.map(async (f) => {
      const rel = toGamePath(f)
      const parts = rel.split("/")
      return { path: rel, set: parts.slice(1, -1).join("/") || "levels", file: parts[parts.length - 1], size: (await stat(f)).size }
    }),
  )
  items.sort((a, b) => a.set.localeCompare(b.set, undefined, { numeric: true }) || a.file.localeCompare(b.file, undefined, { numeric: true }))
  return NextResponse.json(items)
}
