import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { NextResponse } from "next/server"
import { parseLevel, serializeLevel } from "@/lib/level-format"
import { BACKUP_DIR, resolveDataPath } from "@/lib/server/paths"

export const dynamic = "force-dynamic"

function levelPath(segments: string[]) {
  // This route lives under /api/levels/, so the "levels" segment is already consumed.
  const joined = segments.map((s) => decodeURIComponent(s)).join("/")
  const rel = joined.startsWith("levels/") ? joined : `levels/${joined}`
  if (!rel.endsWith(".txt")) return null
  const full = resolveDataPath(rel)
  return full ? { rel, full } : null
}

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const p = levelPath((await ctx.params).path)
  if (!p) return NextResponse.json({ error: "Invalid level path" }, { status: 400 })
  try {
    const text = await readFile(p.full, "latin1")
    return new NextResponse(text, { headers: { "content-type": "text/plain; charset=latin1", "cache-control": "no-store" } })
  } catch {
    return NextResponse.json({ error: "Level not found" }, { status: 404 })
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const p = levelPath((await ctx.params).path)
  if (!p) return NextResponse.json({ error: "Invalid level path" }, { status: 400 })
  const text = await req.text()
  if (text.length > 5_000_000) return NextResponse.json({ error: "Level too large" }, { status: 413 })

  // Sanity check: the payload must parse and keep its layer structure.
  const parsed = parseLevel(text)
  if (parsed.layers.length === 0 || serializeLevel(parsed) !== text) {
    return NextResponse.json({ error: "Level text failed validation" }, { status: 422 })
  }

  // Keep a pristine copy of the original the first time a level is overwritten.
  const backup = path.join(BACKUP_DIR, p.rel)
  try {
    await access(backup)
  } catch {
    await mkdir(path.dirname(backup), { recursive: true })
    await copyFile(p.full, backup).catch(() => {})
  }
  await writeFile(p.full, text, "latin1")
  return NextResponse.json({ ok: true, bytes: Buffer.byteLength(text, "latin1") })
}
