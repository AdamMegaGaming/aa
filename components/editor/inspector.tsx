"use client"

import { useState } from "react"
import { Plus, Trash2, X } from "lucide-react"
import { useEditor } from "@/lib/editor-store"
import { deleteSelection } from "@/lib/edit-ops"
import { layerGeometry, pruneSpriteTable, resizeLayer, setProp, spriteNameById } from "@/lib/level-format"
import type { CatalogEntity, SpriteDef } from "@/lib/types"
import { SpriteThumb } from "./sprite-thumb"

const field = "h-7 w-full min-w-0 rounded-md border bg-background px-2 font-mono text-xs outline-none focus:border-primary"
const btn = "inline-flex h-7 items-center justify-center gap-1 rounded-md border px-2 text-xs hover:bg-panel-raised disabled:opacity-40"

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-b p-3">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[72px_1fr] items-center gap-2 text-xs">
      <span className="text-muted">{label}</span>
      {children}
    </div>
  )
}

function useMutate() {
  const checkpoint = useEditor((s) => s.checkpoint)
  const touch = useEditor((s) => s.touch)
  return (fn: () => void) => {
    checkpoint()
    fn()
    touch()
  }
}

function LayerResize() {
  const level = useEditor((s) => s.level)!
  const li = useEditor((s) => s.activeLayer)
  const mutate = useMutate()
  const [amount, setAmount] = useState(1)
  const layer = level.layers[li]
  if (!layer) return null
  const g = layerGeometry(layer)
  const grow = (side: "left" | "top" | "right" | "bottom", sign: 1 | -1) =>
    mutate(() => resizeLayer(layer, { left: 0, top: 0, right: 0, bottom: 0, [side]: sign * amount }))

  return (
    <Section title={`Layer ${li} size`}>
      <Row label="Grid">
        <span className="font-mono text-xs">
          {g.width} x {g.height} cells ({g.cellW}px)
        </span>
      </Row>
      <Row label="Origin">
        <span className="font-mono text-xs">
          {g.originX}, {g.originY}
        </span>
      </Row>
      <Row label="Step">
        <input
          type="number"
          min={1}
          max={50}
          value={amount}
          onChange={(e) => setAmount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
          className={field}
          aria-label="Cells to add or remove"
        />
      </Row>
      <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-1 text-xs">
        {(["left", "right", "top", "bottom"] as const).map((side) => (
          <div key={side} className="contents">
            <span className="w-14 capitalize text-muted">{side}</span>
            <button type="button" className={btn} onClick={() => grow(side, 1)}>
              + {amount}
            </button>
            <button type="button" className={btn} onClick={() => grow(side, -1)}>
              − {amount}
            </button>
          </div>
        ))}
      </div>
      <p className="text-pretty text-[11px] leading-relaxed text-muted">
        Growing left/top shifts cells_offset so existing tiles, decorations and entities stay in place.
      </p>
    </Section>
  )
}

function EntityInspector({ index, catalog }: { index: number; catalog: Map<string, CatalogEntity> }) {
  const level = useEditor((s) => s.level)!
  const mutate = useMutate()
  const [newKey, setNewKey] = useState("")
  const e = level.entities[index]
  if (!e) return null
  const cat = catalog.get(e.type)
  const suggestions = (cat?.instanceProps ?? []).filter((p) => !e.props.some((x) => x.key === p.key)).slice(0, 8)

  return (
    <Section title="Entity">
      <Row label="Type">
        <span className="truncate text-sm">{e.type}</span>
      </Row>
      <Row label="Id">
        <span className="font-mono text-xs">{e.id}</span>
      </Row>
      {cat?.base && (
        <Row label="Extends">
          <span className="truncate font-mono text-xs text-muted">{cat.base}</span>
        </Row>
      )}
      <div className="flex flex-col gap-1">
        {e.props.map((p, pi) => (
          <div key={`${p.key}-${pi}`} className="grid grid-cols-[1fr_1fr_auto] items-center gap-1">
            <span className="truncate font-mono text-[11px] text-muted" title={p.key}>
              {p.key}
            </span>
            <input
              defaultValue={p.value}
              key={`${e.id}-${p.key}-${p.value}`}
              onBlur={(ev) => ev.target.value !== p.value && mutate(() => setProp(e, p.key, ev.target.value))}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" && !ev.nativeEvent.isComposing && ev.keyCode !== 229) (ev.target as HTMLInputElement).blur()
              }}
              className={field}
              aria-label={p.key}
            />
            <button
              type="button"
              aria-label={`Remove ${p.key}`}
              disabled={p.key === "position_in_layer" || p.key === "layer_index"}
              onClick={() =>
                mutate(() => {
                  e.inline = undefined
                  e.props.splice(pi, 1)
                })
              }
              className="flex size-7 items-center justify-center rounded-md text-muted hover:text-foreground disabled:opacity-30"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
      <form
        className="flex gap-1"
        onSubmit={(ev) => {
          ev.preventDefault()
          const k = newKey.trim()
          if (!k) return
          mutate(() => setProp(e, k, cat?.instanceProps.find((p) => p.key === k)?.value ?? ""))
          setNewKey("")
        }}
      >
        <input value={newKey} onChange={(ev) => setNewKey(ev.target.value)} placeholder="new property" className={field} aria-label="New property name" />
        <button type="submit" className={btn} aria-label="Add property">
          <Plus className="size-3.5" />
        </button>
      </form>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {suggestions.map((s) => (
            <button
              key={s.key}
              type="button"
              title={`Seen ${s.count}x, e.g. "${s.value}"`}
              onClick={() => mutate(() => setProp(e, s.key, s.value))}
              className="rounded-sm border px-1.5 py-0.5 font-mono text-[10px] text-muted hover:text-foreground"
            >
              + {s.key}
            </button>
          ))}
        </div>
      )}
    </Section>
  )
}

function DecorationInspector({ layer, index, sprites }: { layer: number; index: number; sprites: Map<string, SpriteDef> }) {
  const level = useEditor((s) => s.level)!
  const mutate = useMutate()
  const d = level.layers[layer]?.decorations[index]
  if (!d) return null
  const name = spriteNameById(level).get(d.spriteId)
  const num = (key: "x" | "y" | "flags") => (
    <input
      type="number"
      key={`${index}-${key}-${d[key]}`}
      defaultValue={d[key]}
      onBlur={(ev) => {
        const v = Number(ev.target.value)
        if (Number.isFinite(v) && v !== d[key]) mutate(() => (d[key] = Math.round(v)))
      }}
      className={field}
      aria-label={key}
    />
  )
  return (
    <Section title="Decoration">
      <div className="flex items-center gap-2">
        <SpriteThumb def={name ? sprites.get(name) : undefined} size={48} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-mono text-xs">{name ?? `#${d.spriteId}`}</span>
          <span className="text-[11px] text-muted">
            layer {layer}, index {index}
          </span>
        </div>
      </div>
      <Row label="X">{num("x")}</Row>
      <Row label="Y">{num("y")}</Row>
      <Row label="Flags">{num("flags")}</Row>
    </Section>
  )
}

function CellInspector({ layer, x, y, sprites }: { layer: number; x: number; y: number; sprites: Map<string, SpriteDef> }) {
  const level = useEditor((s) => s.level)!
  const mutate = useMutate()
  const L = level.layers[layer]
  if (!L) return null
  const g = layerGeometry(L)
  const k = y * g.width + x
  const id = L.sprites?.[k] ?? 0
  const name = spriteNameById(level).get(id)
  return (
    <Section title="Cell">
      <div className="flex items-center gap-2">
        <SpriteThumb def={name ? sprites.get(name) : undefined} size={48} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-mono text-xs">{id ? (name ?? `#${id}`) : "empty"}</span>
          <span className="font-mono text-[11px] text-muted">
            ({x}, {y}) on layer {layer}
          </span>
        </div>
      </div>
      {L.collision && (
        <Row label="Collision">
          <input
            type="number"
            key={`${k}-${L.collision[k]}`}
            defaultValue={L.collision[k]}
            onBlur={(ev) => {
              const v = Number(ev.target.value)
              if (Number.isInteger(v) && v !== L.collision![k]) mutate(() => (L.collision![k] = v))
            }}
            className={field}
            aria-label="Collision value"
          />
        </Row>
      )}
      {L.spriteFlags && (
        <Row label="Flags">
          <span className="font-mono text-xs">{L.spriteFlags[k]}</span>
        </Row>
      )}
    </Section>
  )
}

export function Inspector({ sprites, catalog }: { sprites: Map<string, SpriteDef>; catalog: Map<string, CatalogEntity> }) {
  const level = useEditor((s) => s.level)
  useEditor((s) => s.version)
  const sel = useEditor((s) => s.selection)
  const setSelection = useEditor((s) => s.setSelection)
  const mutate = useMutate()
  const [pruned, setPruned] = useState<number | null>(null)
  if (!level) return null

  return (
    <div className="flex flex-col">
      {sel?.kind === "entity" && <EntityInspector index={sel.index} catalog={catalog} />}
      {sel?.kind === "decoration" && <DecorationInspector layer={sel.layer} index={sel.index} sprites={sprites} />}
      {sel?.kind === "cell" && <CellInspector layer={sel.layer} x={sel.x} y={sel.y} sprites={sprites} />}
      {sel && sel.kind !== "cell" && (
        <div className="border-b p-3">
          <button
            type="button"
            className={`${btn} w-full text-collision`}
            onClick={() => {
              mutate(() => deleteSelection(level, sel))
              setSelection(null)
            }}
          >
            <Trash2 className="size-3.5" /> Delete {sel.kind}
          </button>
        </div>
      )}
      <LayerResize />
      <Section title="Level">
        <Row label="Entities">
          <span className="font-mono text-xs">{level.entities.length}</span>
        </Row>
        <Row label="Sprites">
          <span className="font-mono text-xs">{level.spriteTable.length} in sprite_table</span>
        </Row>
        <button
          type="button"
          className={btn}
          onClick={() => {
            let n = 0
            mutate(() => (n = pruneSpriteTable(level)))
            setPruned(n)
          }}
        >
          Prune unused sprite_table entries
        </button>
        {pruned !== null && <p className="text-[11px] text-muted">Removed {pruned} unused entries.</p>}
      </Section>
    </div>
  )
}
