import "server-only"
import { readFile } from "node:fs/promises"
import type { SpriteDef, SpriteLibrary } from "@/lib/types"
import { resolveDataPath } from "./paths"

function tokenize(text: string): string[] {
  const noComments = text
    .split("\n")
    .map((l) => {
      const i = l.indexOf("//")
      const j = l.indexOf("#")
      const cut = [i, j].filter((x) => x >= 0)
      return cut.length ? l.slice(0, Math.min(...cut)) : l
    })
    .join("\n")
  return noComments.replace(/[{}]/g, (m) => ` ${m} `).split(/\s+/).filter(Boolean)
}

const isNum = (t: string | undefined) => t !== undefined && /^-?\d+(\.\d+)?$/.test(t)

type RawAnim = { name: string; frames: string[]; category: string }

function parseSpriteFile(text: string, category: string, sprites: Map<string, SpriteDef>, anims: RawAnim[]) {
  const tk = tokenize(text)
  let gridW = 40
  let gridH = 40
  let surface = ""
  let i = 0
  while (i < tk.length) {
    const t = tk[i]
    if (t === "grid_size" && isNum(tk[i + 1]) && isNum(tk[i + 2])) {
      gridW = Number(tk[i + 1])
      gridH = Number(tk[i + 2])
      i += 3
    } else if (t === "use_surface") {
      surface = tk[i + 1] ?? ""
      i += 2
    } else if ((t === "sprite" || t === "anim") && tk[i + 2] === "{") {
      const name = tk[i + 1]
      let j = i + 3
      const body: string[] = []
      while (j < tk.length && tk[j] !== "}") body.push(tk[j++])
      i = j + 1
      if (t === "anim") {
        const frames: string[] = []
        for (let k = 0; k < body.length; k++) {
          if (body[k] === "skey" && body[k + 1]) frames.push(body[++k])
          else if (body[k] === "key" && body[k + 2]) {
            frames.push(body[k + 2])
            k += 2
          }
        }
        anims.push({ name, frames, category })
        continue
      }
      let x = 0
      let y = 0
      let gw = 1
      let gh = 1
      let w: number | null = null
      let h: number | null = null
      let px = 0
      let py = 0
      let inEditor = true
      let usedGrid = false
      for (let k = 0; k < body.length; k++) {
        const b = body[k]
        if (b === "grid") {
          x = Number(body[k + 1]) * gridW
          y = Number(body[k + 2]) * gridH
          usedGrid = true
          k += 2
        } else if (b === "gsize") {
          gw = Number(body[k + 1])
          gh = Number(body[k + 2])
          k += 2
        } else if (b === "rect") {
          x = Number(body[k + 1])
          y = Number(body[k + 2])
          w = Number(body[k + 3])
          h = Number(body[k + 4])
          k += 4
        } else if (b === "size") {
          w = Number(body[k + 1])
          h = Number(body[k + 2])
          k += 2
        } else if (b === "pivot") {
          px = Number(body[k + 1])
          py = Number(body[k + 2])
          k += 2
        } else if (b === "in_editor") {
          inEditor = body[k + 1] !== "0"
          k += 1
        }
      }
      sprites.set(name, {
        name,
        surface,
        x,
        y,
        w: w ?? (usedGrid ? gw * gridW : gridW),
        h: h ?? (usedGrid ? gh * gridH : gridH),
        pivotX: px,
        pivotY: py,
        category,
        inEditor,
      })
    } else {
      i++
    }
  }
}

let cache: { at: number; lib: SpriteLibrary } | null = null

export async function loadSpriteLibrary(): Promise<SpriteLibrary> {
  if (cache && Date.now() - cache.at < 5000) return cache.lib
  const groupsPath = resolveDataPath("sprite_groups.txt")
  const groupsText = groupsPath ? await readFile(groupsPath, "latin1").catch(() => "") : ""
  const files: string[] = []
  for (const line of groupsText.split("\n")) {
    const t = line.trim().split(/\s+/)
    if (t[0] === "sprites" && t[2]) files.push(t[2])
  }
  const sprites = new Map<string, SpriteDef>()
  const anims: RawAnim[] = []
  for (const f of files) {
    const full = resolveDataPath(f)
    if (!full) continue
    const text = await readFile(full, "latin1").catch(() => null)
    if (text === null) continue
    const category = f.split("/")[1] ?? "misc"
    parseSpriteFile(text, category, sprites, anims)
  }
  for (const a of anims) {
    const first = a.frames.map((f) => sprites.get(f)).find(Boolean)
    if (!first || sprites.has(a.name)) continue
    sprites.set(a.name, { ...first, name: a.name, category: a.category, inEditor: true, anim: a.frames })
  }
  const list = [...sprites.values()]
  const lib: SpriteLibrary = {
    sprites: list,
    categories: [...new Set(list.map((s) => s.category))],
  }
  cache = { at: Date.now(), lib }
  return lib
}
