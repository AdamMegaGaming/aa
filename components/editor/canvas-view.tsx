"use client"

import { useEffect, useRef } from "react"
import { useEditor } from "@/lib/editor-store"
import {
  addDecoration,
  addEntity,
  floodFill,
  hitTest,
  levelWorldBounds,
  moveEntity,
  setCollisionCell,
  setSpriteCell,
  worldToCell,
} from "@/lib/edit-ops"
import { onImageLoaded } from "@/lib/image-cache"
import { entityPosition, layerGeometry, spriteNameById } from "@/lib/level-format"
import { render } from "@/lib/render"
import type { CatalogEntity, SpriteDef } from "@/lib/types"

type Drag =
  | { kind: "pan"; sx: number; sy: number; cx: number; cy: number }
  | { kind: "stroke"; last: string }
  | { kind: "move-entity"; index: number; dx: number; dy: number; moved: boolean }
  | { kind: "move-decoration"; layer: number; index: number; dx: number; dy: number; moved: boolean }
  | null

const MIN_ZOOM = 0.05
const MAX_ZOOM = 8

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export function CanvasView({
  sprites,
  entities,
  fitKey,
}: {
  sprites: Map<string, SpriteDef>
  entities: Map<string, CatalogEntity>
  fitKey: number
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sizeRef = useRef({ w: 0, h: 0 })
  const dragRef = useRef<Drag>(null)
  const spaceRef = useRef(false)
  const frameRef = useRef(0)
  const libsRef = useRef({ sprites, entities })
  libsRef.current = { sprites, entities }

  const scheduleDraw = useRef(() => {})
  scheduleDraw.current = () => {
    cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current
      const s = useEditor.getState()
      if (!canvas || !s.level) return
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      const brush = s.brushSprite ? libsRef.current.sprites.get(s.brushSprite) : undefined
      render(ctx, {
        level: s.level,
        camera: s.camera,
        width: sizeRef.current.w,
        height: sizeRef.current.h,
        activeLayer: s.activeLayer,
        visibleLayers: s.visibleLayers,
        sprites: libsRef.current.sprites,
        entities: libsRef.current.entities,
        selection: s.selection,
        hover: s.tool === "select" || s.tool === "entity" || s.tool === "decoration" ? null : s.hover,
        showGrid: s.showGrid,
        showCollision: s.showCollision || s.tool === "collision",
        showEntities: s.showEntities,
        dimInactive: s.dimInactive,
        brushSize: s.tool === "paint" && brush ? { w: brush.w, h: brush.h } : null,
        colors: {
          grid: "rgba(255,255,255,0.08)",
          bounds: cssVar("--muted"),
          accent: cssVar("--primary"),
          entity: cssVar("--entity"),
          collision: cssVar("--collision"),
          label: cssVar("--foreground"),
        },
      })
    })
  }

  // Redraw on any store change and when sprite sheets finish loading.
  useEffect(() => {
    const unsub = useEditor.subscribe(() => scheduleDraw.current())
    const unImg = onImageLoaded(() => scheduleDraw.current())
    return () => {
      unsub()
      unImg()
    }
  }, [])

  useEffect(() => {
    scheduleDraw.current()
  }, [sprites, entities])

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      const dpr = window.devicePixelRatio || 1
      sizeRef.current = { w: width, h: height }
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      scheduleDraw.current()
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  // Fit the whole level into view when a level loads or "fit" is requested.
  useEffect(() => {
    const { level, setCamera } = useEditor.getState()
    if (!level) return
    const b = levelWorldBounds(level)
    const { w, h } = sizeRef.current.w ? sizeRef.current : { w: 1000, h: 700 }
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(w / (b.w + 80), h / (b.h + 80))))
    setCamera({ zoom, x: b.x + b.w / 2 - w / zoom / 2, y: b.y + b.h / 2 - h / zoom / 2 })
  }, [fitKey])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        spaceRef.current = true
        if (canvasRef.current) canvasRef.current.style.cursor = "grab"
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceRef.current = false
        if (canvasRef.current) canvasRef.current.style.cursor = ""
      }
    }
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
    }
  }, [])

  const toWorld = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const { camera } = useEditor.getState()
    return { wx: camera.x + (clientX - rect.left) / camera.zoom, wy: camera.y + (clientY - rect.top) / camera.zoom }
  }

  // Wheel needs a non-passive listener so we can prevent page zoom/scroll.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { camera, setCamera } = useEditor.getState()
      if (e.ctrlKey || e.metaKey || !e.shiftKey) {
        const rect = canvas.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top
        const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))
        const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom * factor))
        const wx = camera.x + mx / camera.zoom
        const wy = camera.y + my / camera.zoom
        setCamera({ zoom, x: wx - mx / zoom, y: wy - my / zoom })
      } else {
        setCamera({ ...camera, x: camera.x + e.deltaY / camera.zoom, y: camera.y + e.deltaX / camera.zoom })
      }
    }
    canvas.addEventListener("wheel", onWheel, { passive: false })
    return () => canvas.removeEventListener("wheel", onWheel)
  }, [])

  const applyStroke = (wx: number, wy: number, first: boolean) => {
    const s = useEditor.getState()
    const level = s.level
    if (!level) return
    const c = worldToCell(level, s.activeLayer, wx, wy)
    if (!c) return
    const key = `${c.cx},${c.cy}`
    const drag = dragRef.current
    if (!first && drag?.kind === "stroke" && drag.last === key) return
    if (drag?.kind === "stroke") drag.last = key
    let changed = false
    if (s.tool === "paint" && s.brushSprite) changed = setSpriteCell(level, s.activeLayer, c.cx, c.cy, s.brushSprite)
    else if (s.tool === "erase") changed = setSpriteCell(level, s.activeLayer, c.cx, c.cy, null)
    else if (s.tool === "collision") changed = setCollisionCell(level, s.activeLayer, c.cx, c.cy, s.collisionValue)
    if (changed) s.touch()
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = useEditor.getState()
    if (!s.level) return
    canvasRef.current!.setPointerCapture(e.pointerId)
    const { wx, wy } = toWorld(e.clientX, e.clientY)

    if (e.button === 1 || e.button === 2 || spaceRef.current) {
      dragRef.current = { kind: "pan", sx: e.clientX, sy: e.clientY, cx: s.camera.x, cy: s.camera.y }
      canvasRef.current!.style.cursor = "grabbing"
      return
    }
    if (e.button !== 0) return
    const level = s.level
    const c = worldToCell(level, s.activeLayer, wx, wy)

    switch (s.tool) {
      case "paint":
      case "erase":
      case "collision": {
        if (s.tool === "paint" && !s.brushSprite) return
        s.checkpoint()
        dragRef.current = { kind: "stroke", last: "" }
        applyStroke(wx, wy, true)
        return
      }
      case "fill": {
        if (!c?.inside) return
        s.checkpoint()
        if (floodFill(level, s.activeLayer, c.cx, c.cy, e.altKey ? null : s.brushSprite) > 0) s.touch()
        return
      }
      case "pick": {
        const hit = hitTest(level, s.activeLayer, wx, wy, libsRef.current.sprites, libsRef.current.entities, false)
        const names = spriteNameById(level)
        const layer = level.layers[s.activeLayer]
        let name: string | undefined
        if (hit?.kind === "decoration") name = names.get(layer.decorations[hit.index].spriteId)
        else if (hit?.kind === "cell" && layer.sprites) name = names.get(layer.sprites[hit.y * layerGeometry(layer).width + hit.x])
        if (name) s.setBrushSprite(name)
        return
      }
      case "decoration": {
        if (!s.brushSprite || !c) return
        s.checkpoint()
        const g = c.g
        const def = libsRef.current.sprites.get(s.brushSprite)
        let lx = c.lx
        let ly = c.ly
        if (s.snapDecorations && !e.shiftKey) {
          lx = g.originX + c.cx * g.cellW + (def?.pivotX ?? 0)
          ly = g.originY + c.cy * g.cellH + (def?.pivotY ?? 0)
        }
        const index = addDecoration(level, s.activeLayer, lx, ly, s.brushSprite)
        s.setSelection({ kind: "decoration", layer: s.activeLayer, index })
        s.touch()
        return
      }
      case "entity": {
        if (!s.brushEntity || !c) return
        s.checkpoint()
        const g = c.g
        const lx = s.snapDecorations && !e.shiftKey ? g.originX + c.cx * g.cellW : c.lx
        const ly = s.snapDecorations && !e.shiftKey ? g.originY + c.cy * g.cellH : c.ly
        const index = addEntity(level, s.activeLayer, lx, ly, libsRef.current.entities.get(s.brushEntity), s.brushEntity)
        s.setSelection({ kind: "entity", index })
        s.touch()
        return
      }
      case "select": {
        const hit = hitTest(level, s.activeLayer, wx, wy, libsRef.current.sprites, libsRef.current.entities, s.showEntities)
        s.setSelection(hit)
        if (hit?.kind === "entity") {
          const e2 = level.entities[hit.index]
          const pos = entityPosition(e2)
          const g = layerGeometry(level.layers[pos.layer])
          dragRef.current = { kind: "move-entity", index: hit.index, dx: wx - g.offsetX - pos.x, dy: wy - g.offsetY - pos.y, moved: false }
        } else if (hit?.kind === "decoration") {
          const d = level.layers[hit.layer].decorations[hit.index]
          const g = layerGeometry(level.layers[hit.layer])
          dragRef.current = { kind: "move-decoration", layer: hit.layer, index: hit.index, dx: wx - g.offsetX - d.x, dy: wy - g.offsetY - d.y, moved: false }
        }
        return
      }
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = useEditor.getState()
    if (!s.level) return
    const drag = dragRef.current
    if (drag?.kind === "pan") {
      const z = s.camera.zoom
      s.setCamera({ zoom: z, x: drag.cx - (e.clientX - drag.sx) / z, y: drag.cy - (e.clientY - drag.sy) / z })
      return
    }
    const { wx, wy } = toWorld(e.clientX, e.clientY)
    const c = worldToCell(s.level, s.activeLayer, wx, wy)
    s.setHover(c ? { wx, wy, cx: c.cx, cy: c.cy, inside: c.inside } : null)

    if (drag?.kind === "stroke") {
      applyStroke(wx, wy, false)
    } else if (drag?.kind === "move-entity" || drag?.kind === "move-decoration") {
      if (!drag.moved) {
        s.checkpoint()
        drag.moved = true
      }
      const li = drag.kind === "move-entity" ? entityPosition(s.level.entities[drag.index]).layer : drag.layer
      const g = layerGeometry(s.level.layers[li])
      let lx = wx - g.offsetX - drag.dx
      let ly = wy - g.offsetY - drag.dy
      if (s.snapDecorations && !e.shiftKey) {
        const snap = g.cellW / 2
        lx = Math.round((lx - g.originX) / snap) * snap + g.originX
        ly = Math.round((ly - g.originY) / snap) * snap + g.originY
      }
      if (drag.kind === "move-entity") moveEntity(s.level.entities[drag.index], lx, ly)
      else {
        const d = s.level.layers[drag.layer].decorations[drag.index]
        d.x = Math.round(lx)
        d.y = Math.round(ly)
      }
      s.touch()
    }
  }

  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (canvasRef.current?.hasPointerCapture(e.pointerId)) canvasRef.current.releasePointerCapture(e.pointerId)
    if (dragRef.current?.kind === "pan" && canvasRef.current) canvasRef.current.style.cursor = spaceRef.current ? "grab" : ""
    dragRef.current = null
  }

  return (
    <div ref={wrapRef} className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-canvas">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 touch-none select-none"
        aria-label="Level canvas. Scroll to zoom, middle or right drag to pan."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => useEditor.getState().setHover(null)}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  )
}
