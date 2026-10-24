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

/**
 * Find a working Python 3 interpreter. Each candidate is actually executed, so
 * broken shims (e.g. a leftover alias pointing at an uninstalled Python 3.12)
 * are skipped instead of being used. Set PYTHON in .env.local to force one.
 */
async function findPython(): Promise<{ cmd: string[] | null; log: string }> {
  const candidates: string[][] = []
  if (process.env.PYTHON) candidates.push([process.env.PYTHON])
  if (process.platform === "win32") candidates.push(["py", "-3"], ["python"], ["python3"])
  else candidates.push(["python3"], ["python"])

  const tried: string[] = []
  for (const c of candidates) {
    const probe = await run(c[0], [...c.slice(1), "-c", "import sys; assert sys.version_info >= (3, 8); print(sys.executable)"])
    if (probe.code === 0) return { cmd: c, log: "" }
    tried.push(`${c.join(" ")} -> ${probe.out.trim() || `exit ${probe.code}`}`)
  }
  return {
    cmd: null,
    log: `No working Python 3 found. Tried:\n${tried.join("\n")}\n\nSet PYTHON in .env.local to the full path of python.exe and restart the dev server.`,
  }
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

  const python = await findPython()
  if (!python.cmd) return NextResponse.json({ ok: false, log: python.log }, { status: 500 })
  const result = await run(python.cmd[0], [...python.cmd.slice(1), ...args])
  if (result.code !== 0) {
    return NextResponse.json({ ok: false, log: `Using: ${python.cmd.join(" ")}\n${result.out}` }, { status: 500 })
  }

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
