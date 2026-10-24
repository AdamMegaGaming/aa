"use client"

import {
  ensureSpriteId,
  entityPosition,
  layerGeometry,
  nextEntityId,
  setProp,
  spriteNameById,
  type Entity,
  type Level,
} from "@/lib/level-format"
import type { Selection } from "@/lib/editor-store"
import { entityBounds } from "@/lib/render"
import type { CatalogEntity, SpriteDef } from "@/lib/types"

export function worldToCell(level: Level, layerIndex: number, wx: number, wy: number) {
  const layer = level.layers[layerIndex]
  if (!layer) return null
  const g = layerGeometry(layer)
  const lx = wx - g.offsetX
  const ly = wy - g.offsetY
  const cx = Math.floor((lx - g.originX) / g.cellW)
  const cy = Math.floor((ly - g.originY) / g.cellH)
  return { cx, cy, lx, ly, g, inside: cx >= 0 && cy >= 0 && cx < g.width && cy < g.height }
}

/** Sets a sprite cell. Returns true if anything changed. spriteName null = erase. */
export function setSpriteCell(level: Level, li: number, cx: number, cy: number, spriteName: string | null): boolean {
  const layer = level.layers[li]
  if (!layer?.sprites) return false
  const g = layerGeometry(layer)
  if (cx < 0 || cy < 0 || cx >= g.width || cy >= g.height) return false
  const id = spriteName ? ensureSpriteId(level, spriteName) : 0
  const k = cy * g.width + cx
  if (layer.sprites[k] === id) return false
  layer.sprites[k] = id
  if (layer.spriteFlags) layer.spriteFlags[k] = 0
  return true
}

export function setCollisionCell(level: Level, li: number, cx: number, cy: number, value: number): boolean {
  const layer = level.layers[li]
  if (!layer?.collision) return false
  const g = layerGeometry(layer)
  if (cx < 0 || cy < 0 || cx >= g.width || cy >= g.height) return false
  const k = cy * g.width + cx
  if (layer.collision[k] === value) return false
  layer.collision[k] = value
  return true
}

export function floodFill(level: Level, li: number, sx: number, sy: number, spriteName: string | null): number {
  const layer = level.layers[li]
  if (!layer?.sprites) return 0
  const g = layerGeometry(layer)
  if (sx < 0 || sy < 0 || sx >= g.width || sy >= g.height) return 0
  const target = layer.sprites[sy * g.width + sx]
  const id = spriteName ? ensureSpriteId(level, spriteName) : 0
  if (target === id) return 0
  const stack: [number, number][] = [[sx, sy]]
  let n = 0
  while (stack.length) {
    const [x, y] = stack.pop()!
    if (x < 0 || y < 0 || x >= g.width || y >= g.height) continue
    const k = y * g.width + x
    if (layer.sprites[k] !== target) continue
    layer.sprites[k] = id
    if (layer.spriteFlags) layer.spriteFlags[k] = 0
    n++
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
  }
  return n
}

export function addDecoration(level: Level, li: number, lx: number, ly: number, spriteName: string): number {
  const layer = level.layers[li]
  const id = ensureSpriteId(level, spriteName)
  layer.decorations.push({ x: Math.round(lx), y: Math.round(ly), spriteId: id, flags: 0 })
  return layer.decorations.length - 1
}

export function addEntity(level: Level, li: number, lx: number, ly: number, cat: CatalogEntity | undefined, type: string): number {
  const e: Entity = { type, id: nextEntityId(level), props: [] }
  // Pre-fill properties that nearly every shipped instance of this type sets.
  if (cat && cat.usage > 0) {
    for (const p of cat.instanceProps) if (p.count >= cat.usage * 0.8) e.props.push({ key: p.key, value: p.value })
  }
  setProp(e, "position_in_layer", `${Math.round(lx)} ${Math.round(ly)}`)
  setProp(e, "layer_index", String(li))
  level.entities.push(e)
  return level.entities.length - 1
}

export function moveEntity(e: Entity, lx: number, ly: number) {
  setProp(e, "position_in_layer", `${Math.round(lx)} ${Math.round(ly)}`)
}

export function deleteSelection(level: Level, sel: Selection): boolean {
  if (!sel) return false
  if (sel.kind === "entity") {
    level.entities.splice(sel.index, 1)
    return true
  }
  if (sel.kind === "decoration") {
    level.layers[sel.layer]?.decorations.splice(sel.index, 1)
    return true
  }
  return setSpriteCell(level, sel.layer, sel.x, sel.y, null)
}

/** Finds the topmost item under a world point: entities, then decorations on the active layer, then the cell. */
export function hitTest(
  level: Level,
  activeLayer: number,
  wx: number,
  wy: number,
  sprites: Map<string, SpriteDef>,
  entities: Map<string, CatalogEntity>,
  includeEntities: boolean,
): Selection {
  if (includeEntities) {
    for (let i = level.entities.length - 1; i >= 0; i--) {
      const e = level.entities[i]
      const pos = entityPosition(e)
      const layer = level.layers[pos.layer]
      if (!layer) continue
      const g = layerGeometry(layer)
      const cat = entities.get(e.type)
      const b = entityBounds(pos, cat?.icon ? sprites.get(cat.icon) : undefined)
      const x = wx - g.offsetX
      const y = wy - g.offsetY
      if (x >= b.x && y >= b.y && x <= b.x + b.w && y <= b.y + b.h) return { kind: "entity", index: i }
    }
  }
  const layer = level.layers[activeLayer]
  if (!layer) return null
  const g = layerGeometry(layer)
  const names = spriteNameById(level)
  const lx = wx - g.offsetX
  const ly = wy - g.offsetY
  for (let i = layer.decorations.length - 1; i >= 0; i--) {
    const d = layer.decorations[i]
    const name = names.get(d.spriteId)
    const def = name ? sprites.get(name) : undefined
    const b = def ? { x: d.x - def.pivotX, y: d.y - def.pivotY, w: def.w, h: def.h } : { x: d.x - 8, y: d.y - 8, w: 16, h: 16 }
    if (lx >= b.x && ly >= b.y && lx <= b.x + b.w && ly <= b.y + b.h) return { kind: "decoration", layer: activeLayer, index: i }
  }
  const c = worldToCell(level, activeLayer, wx, wy)
  if (c?.inside) return { kind: "cell", layer: activeLayer, x: c.cx, y: c.cy }
  return null
}

export function levelWorldBounds(level: Level) {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const l of level.layers) {
    const g = layerGeometry(l)
    if (!g.width || !g.height) continue
    x0 = Math.min(x0, g.offsetX + g.originX)
    y0 = Math.min(y0, g.offsetY + g.originY)
    x1 = Math.max(x1, g.offsetX + g.originX + g.width * g.cellW)
    y1 = Math.max(y1, g.offsetY + g.originY + g.height * g.cellH)
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 800, h: 600 }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}
