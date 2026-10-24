"use client"

import { useMemo, useState } from "react"
import { ChevronRight, Search } from "lucide-react"
import { useEditor } from "@/lib/editor-store"
import type { EntityCatalog, SpriteDef } from "@/lib/types"
import { cn } from "@/lib/utils"
import { SpriteThumb } from "./sprite-thumb"

export function EntityPanel({ catalog, sprites }: { catalog: EntityCatalog | undefined; sprites: Map<string, SpriteDef> }) {
  const [query, setQuery] = useState("")
  const [usedOnly, setUsedOnly] = useState(false)
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const brush = useEditor((s) => s.brushEntity)
  const setBrush = useEditor((s) => s.setBrushEntity)

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const map = new Map<string, NonNullable<EntityCatalog>["entities"]>()
    for (const e of catalog?.entities ?? []) {
      if (usedOnly && e.usage === 0) continue
      if (q && !e.name.toLowerCase().includes(q) && !(e.base ?? "").toLowerCase().includes(q)) continue
      const list = map.get(e.group) ?? []
      list.push(e)
      map.set(e.group, list)
    }
    return [...map.entries()]
  }, [catalog, query, usedOnly])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-b p-2">
        <label className="relative">
          <span className="sr-only">Search entities</span>
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search entities"
            className="h-8 w-full rounded-md border bg-background pl-7 pr-2 text-sm outline-none placeholder:text-muted focus:border-primary"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={usedOnly} onChange={(e) => setUsedOnly(e.target.checked)} className="accent-primary" />
          Only types used in shipped levels
        </label>
      </div>
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto py-1">
        {groups.length === 0 && <p className="p-4 text-center text-sm text-muted">No entities match.</p>}
        {groups.map(([group, list]) => {
          const isOpen = query.trim() !== "" || !closed.has(group)
          return (
            <section key={group}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() =>
                  setClosed((c) => {
                    const n = new Set(c)
                    if (n.has(group)) n.delete(group)
                    else n.add(group)
                    return n
                  })
                }
                className="flex w-full items-center gap-1 px-2 py-1.5 text-left text-xs font-medium uppercase tracking-wide text-muted hover:text-foreground"
              >
                <ChevronRight className={cn("size-3.5 transition-transform", isOpen && "rotate-90")} aria-hidden="true" />
                <span className="truncate">{group}</span>
                <span className="ml-auto font-mono font-normal">{list.length}</span>
              </button>
              {isOpen && (
                <ul className="px-1 pb-1">
                  {list.map((e) => (
                    <li key={e.name}>
                      <button
                        type="button"
                        onClick={() => setBrush(e.name)}
                        title={e.base ? `${e.name} (extends ${e.base})` : e.name}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md border border-transparent px-1.5 py-1 text-left hover:bg-panel-raised",
                          brush === e.name && "border-primary bg-panel-raised",
                        )}
                      >
                        <SpriteThumb def={e.icon ? sprites.get(e.icon) : undefined} size={32} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm">{e.name}</span>
                          {e.base && <span className="truncate font-mono text-[10px] text-muted">{e.base}</span>}
                        </span>
                        {e.usage > 0 && (
                          <span className="font-mono text-[10px] text-muted" title={`Used ${e.usage} times in shipped levels`}>
                            {e.usage}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
