"use client"

import { Eye, EyeOff } from "lucide-react"
import { useEditor } from "@/lib/editor-store"
import { layerGeometry } from "@/lib/level-format"
import { cn } from "@/lib/utils"

export function LayerPanel() {
  const level = useEditor((s) => s.level)
  useEditor((s) => s.version)
  const active = useEditor((s) => s.activeLayer)
  const visible = useEditor((s) => s.visibleLayers)
  const setActive = useEditor((s) => s.setActiveLayer)
  const toggleVisible = useEditor((s) => s.toggleLayerVisible)

  if (!level) return null
  return (
    <section aria-labelledby="layers-heading" className="border-b">
      <h2 id="layers-heading" className="px-3 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-muted">
        Layers
      </h2>
      <ul className="flex flex-col gap-0.5 p-1.5">
        {level.layers.map((layer, i) => {
          const g = layerGeometry(layer)
          const tags = [layer.collision && "collision", layer.sprites && "tiles", layer.decorations.length > 0 && `${layer.decorations.length} deco`].filter(Boolean)
          return (
            <li key={i} className={cn("flex items-center gap-1 rounded-md border border-transparent", active === i && "border-primary/60 bg-panel-raised")}>
              <button
                type="button"
                onClick={() => toggleVisible(i)}
                aria-label={visible[i] ? `Hide layer ${i}` : `Show layer ${i}`}
                aria-pressed={!visible[i]}
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:text-foreground"
              >
                {visible[i] ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
              </button>
              <button type="button" onClick={() => setActive(i)} className="flex min-w-0 flex-1 flex-col py-1 pr-2 text-left" aria-current={active === i}>
                <span className="flex items-baseline gap-1.5 text-sm">
                  <span className="font-mono text-xs text-muted">{i}</span>
                  <span className="truncate">{g.name}</span>
                  <span className="ml-auto font-mono text-[10px] text-muted">
                    {g.width}x{g.height}
                  </span>
                </span>
                <span className="truncate text-[11px] text-muted">{tags.join(" / ") || "empty"}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
