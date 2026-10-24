"use client"

import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { useEditor } from "@/lib/editor-store"
import type { SpriteDef, SpriteLibrary } from "@/lib/types"
import { cn } from "@/lib/utils"
import { SpriteThumb } from "./sprite-thumb"

const PAGE = 240

export function SpritePanel({ library, byName }: { library: SpriteLibrary | undefined; byName: Map<string, SpriteDef> }) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<string>("level")
  const [showHidden, setShowHidden] = useState(false)
  const [limit, setLimit] = useState(PAGE)
  const brush = useEditor((s) => s.brushSprite)
  const setBrush = useEditor((s) => s.setBrushSprite)
  const level = useEditor((s) => s.level)
  useEditor((s) => s.version)

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list: { name: string; def: SpriteDef | undefined; id?: number }[]
    if (category === "level") {
      list = (level?.spriteTable ?? []).map((e) => ({ name: e.name, def: byName.get(e.name), id: e.id }))
    } else {
      list = (library?.sprites ?? [])
        .filter((s) => (category === "all" || s.category === category) && (showHidden || s.inEditor))
        .map((s) => ({ name: s.name, def: s }))
    }
    return q ? list.filter((i) => i.name.toLowerCase().includes(q)) : list
    // level.spriteTable is mutated in place; version subscription above re-renders this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, category, showHidden, library, byName, level, level?.spriteTable.length])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-b p-2">
        <label className="relative">
          <span className="sr-only">Search sprites</span>
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setLimit(PAGE)
            }}
            placeholder="Search sprites"
            className="h-8 w-full rounded-md border bg-background pl-7 pr-2 text-sm outline-none placeholder:text-muted focus:border-primary"
          />
        </label>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="sprite-category">
            Sprite category
          </label>
          <select
            id="sprite-category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value)
              setLimit(PAGE)
            }}
            className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm outline-none focus:border-primary"
          >
            <option value="level">In this level ({level?.spriteTable.length ?? 0})</option>
            <option value="all">All sprites ({library?.sprites.length ?? 0})</option>
            {library?.categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {category !== "level" && (
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} className="accent-primary" />
              hidden
            </label>
          )}
        </div>
      </div>

      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-2">
        {items.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted">No sprites match.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-1.5">
            {items.slice(0, limit).map((it) => (
              <li key={it.name}>
                <button
                  type="button"
                  onClick={() => setBrush(it.name)}
                  title={`${it.name}${it.def ? ` (${it.def.w}x${it.def.h})` : " (missing)"}${it.id !== undefined ? ` - id ${it.id}` : ""}`}
                  className={cn(
                    "flex w-full flex-col items-center gap-1 rounded-md border border-transparent p-1 text-left hover:bg-panel-raised",
                    brush === it.name && "border-primary bg-panel-raised",
                  )}
                >
                  <SpriteThumb def={it.def} size={56} />
                  <span className="w-full truncate text-center font-mono text-[10px] leading-tight text-muted">{it.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {items.length > limit && (
          <button
            type="button"
            onClick={() => setLimit((l) => l + PAGE)}
            className="mt-2 w-full rounded-md border py-1.5 text-xs text-muted hover:text-foreground"
          >
            Show more ({items.length - limit} remaining)
          </button>
        )}
      </div>
    </div>
  )
}
