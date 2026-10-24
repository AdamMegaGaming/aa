import { spawn } from "node:child_process"
import { copyFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { NextResponse } from "next/server"
import { BUILD_DIR, DATA_DIR, PROJECT_ROOT, TEMPLATE_PDB } from "@/lib/server/paths"

export const dynamic = "force-dynamic"

function run(cmd: string, args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: PROJECT_ROOT })
    let out = ""
    child.stdout.on("data", (d) => (out += d))
    child.stderr.on("data", (d) => (out += d))
    child.on("error", (e) => resolve({ code: -1, out: String(e) }))
    child.on("close", (code) => resolve({ code: code ?? -1, out }))
  })
}

export async function GET() {
  return NextResponse.json({
    installDir: process.env.GAME_INSTALL_DIR ?? null,
    exe: process.env.GAME_EXE ?? null,
  })
}

export async function POST(req: Request) {
  const { install = false, launch = false } = (await req.json().catch(() => ({}))) as { install?: boolean; launch?: boolean }
  await mkdir(BUILD_DIR, { recursive: true })
  const out = path.join(BUILD_DIR, "data.pdb")
  const args = [path.join(PROJECT_ROOT, "pack.py"), TEMPLATE_PDB, DATA_DIR, out]

  const pythons = process.env.PYTHON ? [process.env.PYTHON] : ["python3", "python", "py"]
  let result = { code: -1, out: "No Python interpreter found" }
  for (const py of pythons) {
    result = await run(py, args)
    if (result.code !== -1) break
  }
  if (result.code !== 0) return NextResponse.json({ ok: false, log: result.out }, { status: 500 })

  const log = [result.out.trim()]
  const installDir = process.env.GAME_INSTALL_DIR
  if (install) {
    if (!installDir) return NextResponse.json({ ok: false, log: "GAME_INSTALL_DIR is not set" }, { status: 400 })
    await copyFile(out, path.join(installDir, "data.pdb"))
    log.push(`Installed to ${path.join(installDir, "data.pdb")}`)
    if (launch && process.env.GAME_EXE) {
      spawn(process.env.GAME_EXE, [], { cwd: installDir, detached: true, stdio: "ignore" }).unref()
      log.push(`Launched ${process.env.GAME_EXE}`)
    }
  }
  return NextResponse.json({ ok: true, log: log.join("\n") })
}
