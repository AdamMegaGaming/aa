import { readFile } from "node:fs/promises"
import { resolveDataPath } from "@/lib/server/paths"

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" }

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const rel = (await ctx.params).path.join("/")
  const ext = rel.split(".").pop()?.toLowerCase() ?? ""
  const full = TYPES[ext] ? resolveDataPath(rel) : null
  if (!full) return new Response("Not found", { status: 404 })
  try {
    const buf = await readFile(full)
    return new Response(new Uint8Array(buf), { headers: { "content-type": TYPES[ext], "cache-control": "no-cache" } })
  } catch {
    return new Response("Not found", { status: 404 })
  }
}
