import { readFile } from "node:fs/promises"
import path from "node:path"
import { BUILD_DIR } from "@/lib/server/paths"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const buf = await readFile(path.join(BUILD_DIR, "data.pdb"))
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": 'attachment; filename="data.pdb"',
        "cache-control": "no-store",
      },
    })
  } catch {
    return new Response("Pack the game first", { status: 404 })
  }
}
