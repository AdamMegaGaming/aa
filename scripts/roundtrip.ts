// Verifies serializeLevel(parseLevel(text)) === text for every level file.
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { parseLevel, serializeLevel, layerGeometry } from "../lib/level-format.ts"

const root = join(process.cwd(), process.env.GAME_DATA_DIR ?? "extracted", "levels")

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".txt") ? [p] : []
  })
}

let ok = 0
const failures: string[] = []
for (const file of walk(root)) {
  const text = readFileSync(file, "latin1")
  const level = parseLevel(text)
  const back = serializeLevel(level)
  const gridsOk = level.layers.every((l) => {
    const g = layerGeometry(l)
    const n = g.width * g.height
    return (!l.sprites || l.sprites.length === n) && (!l.collision || l.collision.length === n)
  })
  if (back === text && gridsOk) ok++
  else {
    const a = text.split("\n")
    const b = back.split("\n")
    const idx = a.findIndex((line, i) => line !== b[i])
    failures.push(`${file}: grids=${gridsOk} first diff line ${idx + 1}\n  orig: ${JSON.stringify(a[idx])}\n  new:  ${JSON.stringify(b[idx])}`)
  }
}
console.log(`round-trip OK: ${ok}, failed: ${failures.length}`)
for (const f of failures.slice(0, 10)) console.log(f)
if (failures.length) process.exit(1)
