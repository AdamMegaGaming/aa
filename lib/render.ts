"use client"

import { entityPosition, layerGeometry, spriteNameById, type Level } from "@/lib/level-format"
import type { Camera, Hover, Selection } from "@/lib/editor-store"
import { getImage } from "@/lib/image-cache"
import type { CatalogEntity, SpriteDef } from "@/lib/types"

export type RenderOptions = {
  level: Level
  camera: Camera
  width: number
  height: number
  activeLayer: number
  visibleLayers: boolean[]
  sprites: Map<string, SpriteDef>
  entities: Map<string, CatalogEntity>
  selection: Selection
  hover: Hover
  showGrid: boolean
  showCollision: boolean
  showEntities: boolean
  dimInactive: boolean
  brushSize: { w: number; h: number } | null
  colors: { grid: string; bounds: string; accent: string; entity: string; collision: string; label: string }
}

export const ENTITY_BOX = 40

export function drawSprite(ctx: CanvasRenderingContext2D, def: SpriteDef, x: number, y: number) {
  const img = getImage(def.surface)
  if (!img) return false
  ctx.drawImage(img, def.x, def.y, def.w, def.h, x, y, def.w, def.h)
  return true
}

export function entityBounds(
  pos: { x: number; y: number },
  icon: SpriteDef | undefined,
): { x: number; y: number; w: number; h: number } {
  if (icon) return { x: pos.x - icon.pivotX, y: pos.y - icon.pivotY, w: icon.w, h: icon.h }
  return { x: pos.x, y: pos.y, w: ENTITY_BOX, h: ENTITY_BOX }
}

export function render(ctx: CanvasRenderingContext2D, o: RenderOptions) {
  const { level, camera: cam, width, height } = o
  const dpr = window.devicePixelRatio || 1
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, width * dpr, height * dpr)
  ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, -cam.x * cam.zoom * dpr, -cam.y * cam.zoom * dpr)
  ctx.imageSmoothingEnabled = cam.zoom < 1

  const view = { x0: cam.x, y0: cam.y, x1: cam.x + width / cam.zoom, y1: cam.y + height / cam.zoom }
  const names = spriteNameById(level)
  const px = 1 / cam.zoom

  level.layers.forEach((layer, li) => {
    if (!o.visibleLayers[li]) return
    const g = layerGeometry(layer)
    const active = li === o.activeLayer
    ctx.save()
    ctx.translate(g.offsetX, g.offsetY)
    ctx.globalAlpha = o.dimInactive && !active ? 0.35 : 1

    const lx0 = view.x0 - g.offsetX
    const ly0 = view.y0 - g.offsetY
    const lx1 = view.x1 - g.offsetX
    const ly1 = view.y1 - g.offsetY
    // Sprites can overhang their cell, so pad the culling window by a few cells.
    const pad = 3
    const cx0 = Math.max(0, Math.floor((lx0 - g.originX) / g.cellW) - pad)
    const cy0 = Math.max(0, Math.floor((ly0 - g.originY) / g.cellH) - pad)
    const cx1 = Math.min(g.width - 1, Math.ceil((lx1 - g.originX) / g.cellW) + 1)
    const cy1 = Math.min(g.height - 1, Math.ceil((ly1 - g.originY) / g.cellH) + 1)

    if (layer.sprites) {
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const id = layer.sprites[cy * g.width + cx]
          if (!id) continue
          const name = names.get(id)
          const def = name ? o.sprites.get(name) : undefined
          const x = g.originX + cx * g.cellW
          const y = g.originY + cy * g.cellH
          if (!def || !drawSprite(ctx, def, x - def.pivotX, y - def.pivotY)) {
            ctx.fillStyle = "rgba(255,80,120,0.35)"
            ctx.fillRect(x, y, g.cellW, g.cellH)
          }
        }
      }
    }

    for (let di = 0; di < layer.decorations.length; di++) {
      const d = layer.decorations[di]
      const name = names.get(d.spriteId)
      const def = name ? o.sprites.get(name) : undefined
      if (def) {
        const bx = d.x - def.pivotX
        const by = d.y - def.pivotY
        if (bx > lx1 || by > ly1 || bx + def.w < lx0 || by + def.h < ly0) continue
        if (!drawSprite(ctx, def, bx, by)) {
          ctx.fillStyle = "rgba(255,80,120,0.35)"
          ctx.fillRect(bx, by, def.w, def.h)
        }
      } else {
        ctx.fillStyle = "rgba(255,80,120,0.5)"
        ctx.fillRect(d.x - 8, d.y - 8, 16, 16)
      }
    }

    if (active) {
      ctx.globalAlpha = 1
      if (o.showCollision && layer.collision) {
        for (let cy = Math.max(0, cy0); cy <= cy1; cy++) {
          for (let cx = Math.max(0, cx0); cx <= cx1; cx++) {
            const v = layer.collision[cy * g.width + cx]
            if (!v) continue
            ctx.fillStyle = o.colors.collision
            ctx.globalAlpha = v === 2 ? 0.35 : 0.55
            ctx.fillRect(g.originX + cx * g.cellW, g.originY + cy * g.cellH, g.cellW, g.cellH)
          }
        }
        ctx.globalAlpha = 1
        if (cam.zoom >= 0.75) {
          ctx.fillStyle = o.colors.label
          ctx.font = `${10 * px}px ui-monospace, monospace`
          ctx.textBaseline = "top"
          for (let cy = Math.max(0, cy0); cy <= cy1; cy++) {
            for (let cx = Math.max(0, cx0); cx <= cx1; cx++) {
              const v = layer.collision[cy * g.width + cx]
              if (v && v !== 2) ctx.fillText(String(v), g.originX + cx * g.cellW + 2 * px, g.originY + cy * g.cellH + 2 * px)
            }
          }
        }
      }
      if (o.showGrid && cam.zoom >= 0.2) {
        ctx.strokeStyle = o.colors.grid
        ctx.lineWidth = px
        ctx.beginPath()
        for (let cx = Math.max(0, cx0); cx <= cx1 + 1; cx++) {
          const x = g.originX + cx * g.cellW
          ctx.moveTo(x, g.originY + Math.max(0, cy0) * g.cellH)
          ctx.lineTo(x, g.originY + (cy1 + 1) * g.cellH)
        }
        for (let cy = Math.max(0, cy0); cy <= cy1 + 1; cy++) {
          const y = g.originY + cy * g.cellH
          ctx.moveTo(g.originX + Math.max(0, cx0) * g.cellW, y)
          ctx.lineTo(g.originX + (cx1 + 1) * g.cellW, y)
        }
        ctx.stroke()
      }
      ctx.strokeStyle = o.colors.bounds
      ctx.lineWidth = 2 * px
      ctx.strokeRect(g.originX, g.originY, g.width * g.cellW, g.height * g.cellH)

      const sel = o.selection
      if (sel?.kind === "decoration" && sel.layer === li) {
        const d = layer.decorations[sel.index]
        const name = d ? names.get(d.spriteId) : undefined
        const def = name ? o.sprites.get(name) : undefined
        if (d) {
          const b = def ? { x: d.x - def.pivotX, y: d.y - def.pivotY, w: def.w, h: def.h } : { x: d.x - 8, y: d.y - 8, w: 16, h: 16 }
          ctx.strokeStyle = o.colors.accent
          ctx.lineWidth = 2 * px
          ctx.strokeRect(b.x, b.y, b.w, b.h)
        }
      }
      if (sel?.kind === "cell" && sel.layer === li) {
        ctx.strokeStyle = o.colors.accent
        ctx.lineWidth = 2 * px
        ctx.strokeRect(g.originX + sel.x * g.cellW, g.originY + sel.y * g.cellH, g.cellW, g.cellH)
      }
      const h = o.hover
      if (h && h.inside) {
        ctx.fillStyle = o.colors.accent
        ctx.globalAlpha = 0.18
        const bw = o.brushSize?.w ?? g.cellW
        const bh = o.brushSize?.h ?? g.cellH
        ctx.fillRect(g.originX + h.cx * g.cellW, g.originY + h.cy * g.cellH, Math.max(g.cellW, bw), Math.max(g.cellH, bh))
        ctx.globalAlpha = 1
      }
    }
    ctx.restore()
  })

  if (o.showEntities) {
    ctx.font = `${11 * px}px ui-sans-serif, system-ui, sans-serif`
    ctx.textBaseline = "bottom"
    level.entities.forEach((e, ei) => {
      const pos = entityPosition(e)
      const layer = level.layers[pos.layer]
      if (!layer || !o.visibleLayers[pos.layer]) return
      const g = layerGeometry(layer)
      const cat = o.entities.get(e.type)
      const icon = cat?.icon ? o.sprites.get(cat.icon) : undefined
      const b = entityBounds(pos, icon)
      const wx = b.x + g.offsetX
      const wy = b.y + g.offsetY
      if (wx > view.x1 || wy > view.y1 || wx + b.w < view.x0 || wy + b.h < view.y0) return
      const selected = o.selection?.kind === "entity" && o.selection.index === ei
      ctx.globalAlpha = o.dimInactive && pos.layer !== o.activeLayer ? 0.45 : 1
      const drawn = icon ? drawSprite(ctx, icon, wx, wy) : false
      ctx.globalAlpha = 1
      ctx.lineWidth = (selected ? 2 : 1) * px
      ctx.strokeStyle = selected ? o.colors.accent : o.colors.entity
      if (!drawn) {
        ctx.fillStyle = o.colors.entity
        ctx.globalAlpha = 0.25
        ctx.fillRect(wx, wy, b.w, b.h)
        ctx.globalAlpha = 1
      }
      ctx.strokeRect(wx, wy, b.w, b.h)
      if (selected || cam.zoom >= 0.6) {
        ctx.fillStyle = selected ? o.colors.accent : o.colors.label
        ctx.fillText(e.type, wx, wy - 2 * px)
      }
    })
  }
}
