// Parser + serializer for Archibald's Adventures level .txt files.
// Goal: parse(serialize(x)) is lossless and serialize(parse(text)) === text
// for every unmodified level, so saving never corrupts things we don't edit.

export type SpriteTableEntry = { name: string; id: number }

export type Decoration = { x: number; y: number; spriteId: number; flags: number }

export type EntityProp = { key: string; value: string }

export type Entity = {
  type: string
  id: number
  props: EntityProp[]
  /** Original single-line form such as `Foo 3 { }`; dropped once edited. */
  inline?: string
}

type LayerItem =
  | { t: "raw"; line: string }
  | { t: "cells" }
  | { t: "no_cells" }
  | { t: "sprite_cells" }
  | { t: "no_sprite_cells" }
  | { t: "decorations" }

export type Layer = {
  headerLine: string
  items: LayerItem[]
  /** Collision grid (width*height), null when the layer uses `no_cells`. */
  collision: number[] | null
  /** Sprite ids per cell (width*height), null when `no_sprite_cells`. */
  sprites: number[] | null
  /** Second value of each sprite_cells pair (rotation/flags), preserved. */
  spriteFlags: number[] | null
  decorations: Decoration[]
}

type DocPart =
  | { t: "raw"; line: string }
  | { t: "sprite_table"; open: string; close: string }
  | { t: "layers"; open: string; close: string }
  | { t: "entities"; open: string; close: string }

export type Level = {
  parts: DocPart[]
  spriteTable: SpriteTableEntry[]
  layersPreamble: string[]
  layers: Layer[]
  entities: Entity[]
}

const HEADER_KEY = /^(\S+)(?:\s+(.*))?$/

export function getHeader(layer: Layer, key: string): string | undefined {
  for (const it of layer.items) {
    if (it.t !== "raw") continue
    const m = it.line.trim().match(HEADER_KEY)
    if (m && m[1] === key) return m[2] ?? ""
  }
  return undefined
}

export function setHeader(layer: Layer, key: string, value: string) {
  for (const it of layer.items) {
    if (it.t !== "raw") continue
    const m = it.line.trim().match(HEADER_KEY)
    if (m && m[1] === key) {
      it.line = value === "" ? key : `${key} ${value}`
      return
    }
  }
  const firstGrid = layer.items.findIndex((it) => it.t !== "raw")
  const line = value === "" ? key : `${key} ${value}`
  layer.items.splice(firstGrid < 0 ? layer.items.length : firstGrid, 0, { t: "raw", line })
}

function nums(s: string | undefined, fallback: [number, number]): [number, number] {
  if (!s) return fallback
  const p = s.trim().split(/\s+/).map(Number)
  return [Number.isFinite(p[0]) ? p[0] : fallback[0], Number.isFinite(p[1]) ? p[1] : fallback[1]]
}

export type LayerGeometry = {
  name: string
  width: number
  height: number
  cellW: number
  cellH: number
  originX: number
  originY: number
  offsetX: number
  offsetY: number
}

export function layerGeometry(layer: Layer): LayerGeometry {
  const [cellW, cellH] = nums(getHeader(layer, "cell_size"), [40, 40])
  const [originX, originY] = nums(getHeader(layer, "cells_offset"), [0, 0])
  const [offsetX, offsetY] = nums(getHeader(layer, "offset"), [0, 0])
  return {
    name: getHeader(layer, "name") ?? "noname",
    width: Number(getHeader(layer, "width") ?? 0) || 0,
    height: Number(getHeader(layer, "height") ?? 0) || 0,
    cellW,
    cellH,
    originX,
    originY,
    offsetX,
    offsetY,
  }
}

function isNumLine(s: string) {
  const t = s.trim()
  return t.length > 0 && /^-?\d/.test(t)
}

function parseLayer(lines: string[], start: number): { layer: Layer; next: number } {
  const layer: Layer = {
    headerLine: lines[start],
    items: [],
    collision: null,
    sprites: null,
    spriteFlags: null,
    decorations: [],
  }
  let i = start + 1
  const rows = () => Number(getHeader(layer, "height") ?? 0) || 0
  while (i < lines.length) {
    const raw = lines[i]
    const s = raw.trim()
    if (s.startsWith("layer") && !s.startsWith("layer_") && (s === "layer" || s.startsWith("layer ") || s.startsWith("layer/"))) break
    if (s.startsWith("}")) break
    if (s === "cells") {
      layer.items.push({ t: "cells" })
      const out: number[] = []
      i++
      for (let r = 0; r < rows() && i < lines.length && isNumLine(lines[i]); r++, i++) {
        for (const v of lines[i].trim().split(/\s+/)) out.push(Number(v))
      }
      layer.collision = out
      continue
    }
    if (s === "no_cells") {
      layer.items.push({ t: "no_cells" })
      i++
      continue
    }
    if (s === "sprite_cells") {
      layer.items.push({ t: "sprite_cells" })
      const ids: number[] = []
      const flags: number[] = []
      i++
      for (let r = 0; r < rows() && i < lines.length && isNumLine(lines[i]); r++, i++) {
        const t = lines[i].trim().split(/\s+/)
        for (let k = 0; k + 1 < t.length; k += 2) {
          ids.push(Number(t[k]))
          flags.push(Number(t[k + 1]))
        }
      }
      layer.sprites = ids
      layer.spriteFlags = flags
      continue
    }
    if (s === "no_sprite_cells") {
      layer.items.push({ t: "no_sprite_cells" })
      i++
      continue
    }
    if (s.startsWith("decorations")) {
      layer.items.push({ t: "decorations" })
      const n = Number(s.split(/\s+/)[1] ?? 0) || 0
      i++
      for (let k = 0; k < n && i < lines.length; k++, i++) {
        const t = lines[i].trim().split(/\s+/).map(Number)
        layer.decorations.push({ x: t[0] || 0, y: t[1] || 0, spriteId: t[2] || 0, flags: t[3] || 0 })
      }
      continue
    }
    layer.items.push({ t: "raw", line: raw })
    i++
  }
  return { layer, next: i }
}

const ENTITY_START = /^(\S+)\s+(-?\d+)\s*\{(.*)$/

export function parseLevel(text: string): Level {
  const lines = text.split("\n")
  const level: Level = { parts: [], spriteTable: [], layersPreamble: [], layers: [], entities: [] }
  let i = 0
  while (i < lines.length) {
    const s = lines[i].trim()
    if (s.startsWith("sprite_table") && s.endsWith("{")) {
      const open = lines[i]
      i++
      while (i < lines.length && !lines[i].trim().startsWith("}")) {
        const t = lines[i].trim().split(/\s+/)
        if (t.length >= 2) level.spriteTable.push({ name: t[0], id: Number(t[1]) })
        i++
      }
      level.parts.push({ t: "sprite_table", open, close: lines[i] ?? "}" })
      i++
      continue
    }
    if (s.startsWith("layers") && s.endsWith("{")) {
      const open = lines[i]
      i++
      while (i < lines.length) {
        const t = lines[i].trim()
        if (t.startsWith("}")) break
        if (t === "layer" || t.startsWith("layer ") || t.startsWith("layer/")) {
          const { layer, next } = parseLayer(lines, i)
          level.layers.push(layer)
          i = next
          continue
        }
        if (level.layers.length === 0) level.layersPreamble.push(lines[i])
        else level.layers[level.layers.length - 1].items.push({ t: "raw", line: lines[i] })
        i++
      }
      level.parts.push({ t: "layers", open, close: lines[i] ?? "}" })
      i++
      continue
    }
    if (s.startsWith("entities") && s.includes("{")) {
      const open = lines[i]
      i++
      while (i < lines.length) {
        const t = lines[i].trim()
        if (t.startsWith("}")) break
        const m = t.match(ENTITY_START)
        if (m) {
          const ent: Entity = { type: m[1], id: Number(m[2]), props: [] }
          const rest = m[3].trim()
          if (rest.endsWith("}")) {
            ent.inline = lines[i]
            const inner = rest.slice(0, -1).trim()
            if (inner) {
              const kv = inner.match(HEADER_KEY)
              if (kv) ent.props.push({ key: kv[1], value: kv[2] ?? "" })
            }
            i++
          } else {
            i++
            while (i < lines.length && lines[i].trim() !== "}") {
              const kv = lines[i].trim().match(HEADER_KEY)
              if (kv) ent.props.push({ key: kv[1], value: kv[2] ?? "" })
              i++
            }
            i++
          }
          level.entities.push(ent)
          continue
        }
        i++
      }
      level.parts.push({ t: "entities", open, close: lines[i] ?? "} // entities" })
      i++
      continue
    }
    level.parts.push({ t: "raw", line: lines[i] })
    i++
  }
  return level
}

function serializeLayer(layer: Layer, out: string[]) {
  out.push(layer.headerLine)
  const g = layerGeometry(layer)
  for (const it of layer.items) {
    switch (it.t) {
      case "raw":
        out.push(it.line)
        break
      case "cells": {
        out.push("cells")
        const c = layer.collision ?? []
        for (let r = 0; r < g.height; r++) {
          let row = ""
          for (let x = 0; x < g.width; x++) row += `${c[r * g.width + x] ?? 0} `
          out.push(row)
        }
        break
      }
      case "no_cells":
        out.push("no_cells")
        break
      case "sprite_cells": {
        out.push("sprite_cells")
        const ids = layer.sprites ?? []
        const fl = layer.spriteFlags ?? []
        for (let r = 0; r < g.height; r++) {
          let row = ""
          for (let x = 0; x < g.width; x++) {
            const k = r * g.width + x
            row += `${ids[k] ?? 0} ${fl[k] ?? 0} `
          }
          out.push(row)
        }
        break
      }
      case "no_sprite_cells":
        out.push("no_sprite_cells")
        break
      case "decorations":
        out.push(`decorations ${layer.decorations.length}`)
        for (const d of layer.decorations) out.push(`${d.x} ${d.y} ${d.spriteId} ${d.flags}`)
        break
    }
  }
}

export function serializeLevel(level: Level): string {
  const out: string[] = []
  for (const p of level.parts) {
    if (p.t === "raw") {
      out.push(p.line)
    } else if (p.t === "sprite_table") {
      out.push(p.open)
      for (const e of level.spriteTable) out.push(` ${e.name} ${e.id}`)
      out.push(p.close)
    } else if (p.t === "layers") {
      out.push(p.open)
      out.push(...level.layersPreamble)
      for (const l of level.layers) serializeLayer(l, out)
      out.push(p.close)
    } else {
      out.push(p.open)
      for (const e of level.entities) {
        if (e.inline !== undefined) {
          out.push(e.inline)
          continue
        }
        out.push(`${e.type} ${e.id} {`)
        for (const pr of e.props) out.push(pr.value === "" ? pr.key : `${pr.key} ${pr.value}`)
        out.push("}")
      }
      out.push(p.close)
    }
  }
  return out.join("\n")
}

// ---------- editing helpers ----------

export function ensureSpriteId(level: Level, name: string): number {
  const hit = level.spriteTable.find((e) => e.name === name)
  if (hit) return hit.id
  const id = level.spriteTable.reduce((m, e) => Math.max(m, e.id), 0) + 1
  level.spriteTable.push({ name, id })
  return id
}

export function spriteNameById(level: Level): Map<number, string> {
  const m = new Map<number, string>()
  for (const e of level.spriteTable) m.set(e.id, e.name)
  return m
}

/** Remove sprite_table entries that no layer cell or decoration references. */
export function pruneSpriteTable(level: Level): number {
  const used = new Set<number>()
  for (const l of level.layers) {
    l.sprites?.forEach((id) => id && used.add(id))
    l.decorations.forEach((d) => used.add(d.spriteId))
  }
  const before = level.spriteTable.length
  level.spriteTable = level.spriteTable.filter((e) => used.has(e.id))
  return before - level.spriteTable.length
}

/** Grow (positive) or shrink (negative) each side of a layer, keeping world positions stable. */
export function resizeLayer(
  layer: Layer,
  d: { left: number; top: number; right: number; bottom: number },
) {
  const g = layerGeometry(layer)
  const nw = Math.max(1, g.width + d.left + d.right)
  const nh = Math.max(1, g.height + d.top + d.bottom)
  const remap = (src: number[] | null): number[] | null => {
    if (!src) return null
    const out = new Array<number>(nw * nh).fill(0)
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        const sx = x - d.left
        const sy = y - d.top
        if (sx >= 0 && sy >= 0 && sx < g.width && sy < g.height) out[y * nw + x] = src[sy * g.width + sx] ?? 0
      }
    }
    return out
  }
  layer.collision = remap(layer.collision)
  layer.sprites = remap(layer.sprites)
  layer.spriteFlags = remap(layer.spriteFlags)
  setHeader(layer, "width", String(nw))
  setHeader(layer, "height", String(nh))
  setHeader(layer, "cells_offset", `${g.originX - d.left * g.cellW} ${g.originY - d.top * g.cellH}`)
}

export function nextEntityId(level: Level): number {
  return level.entities.reduce((m, e) => Math.max(m, e.id), 0) + 1
}

export function getProp(e: Entity, key: string): string | undefined {
  return e.props.find((p) => p.key === key)?.value
}

export function setProp(e: Entity, key: string, value: string) {
  e.inline = undefined
  const p = e.props.find((x) => x.key === key)
  if (p) p.value = value
  else {
    const before = e.props.findIndex((x) => x.key === "position_in_layer" || x.key === "layer_index")
    if (before < 0) e.props.push({ key, value })
    else e.props.splice(before, 0, { key, value })
  }
}

export function entityPosition(e: Entity): { x: number; y: number; layer: number } {
  const [x, y] = nums(getProp(e, "position_in_layer"), [0, 0])
  return { x, y, layer: Number(getProp(e, "layer_index") ?? 0) || 0 }
}
