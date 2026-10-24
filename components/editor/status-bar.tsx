"use client"

import { useEditor } from "@/lib/editor-store"
import { TOOLS } from "./toolbar"

export function StatusBar({ message }: { message: string | null }) {
  const hover = useEditor((s) => s.hover)
  const zoom = useEditor((s) => s.camera.zoom)
  const layer = useEditor((s) => s.activeLayer)
  const tool = useEditor((s) => s.tool)
  const brushSprite = useEditor((s) => s.brushSprite)
  const brushEntity = useEditor((s) => s.brushEntity)
  const brush = tool === "entity" ? brushEntity : tool === "paint" || tool === "fill" || tool === "decoration" ? brushSprite : null

  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t bg-panel px-3 font-mono text-[11px] text-muted">
      <span>{TOOLS.find((t) => t.id === tool)?.label}</span>
      {brush !== null && <span className="text-foreground">{brush ?? "no brush selected"}</span>}
      <span>layer {layer}</span>
      {hover && (
        <>
          <span>
            world {Math.round(hover.wx)}, {Math.round(hover.wy)}
          </span>
          <span className={hover.inside ? "" : "opacity-50"}>
            cell {hover.cx}, {hover.cy}
          </span>
        </>
      )}
      <span>{Math.round(zoom * 100)}%</span>
      <span className="ml-auto truncate" role="status">
        {message ?? "Wheel: zoom · Middle/right drag or Space+drag: pan"}
      </span>
    </footer>
  )
}
