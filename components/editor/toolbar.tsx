"use client"

import {
  Boxes,
  Brush,
  Eraser,
  Grid3x3,
  Maximize,
  MousePointer2,
  PackageCheck,
  PaintBucket,
  Pipette,
  Redo2,
  Save,
  Shield,
  Sparkles,
  Undo2,
  User,
} from "lucide-react"
import { useEditor, type Tool } from "@/lib/editor-store"
import type { LevelListItem } from "@/lib/types"
import { cn } from "@/lib/utils"

export const TOOLS: { id: Tool; label: string; key: string; icon: typeof Brush }[] = [
  { id: "select", label: "Select / move", key: "V", icon: MousePointer2 },
  { id: "paint", label: "Paint tiles", key: "B", icon: Brush },
  { id: "erase", label: "Erase tiles", key: "E", icon: Eraser },
  { id: "fill", label: "Flood fill (Alt = clear)", key: "G", icon: PaintBucket },
  { id: "pick", label: "Pick sprite", key: "I", icon: Pipette },
  { id: "decoration", label: "Place decoration (Shift = free)", key: "D", icon: Sparkles },
  { id: "entity", label: "Place entity (Shift = free)", key: "N", icon: User },
  { id: "collision", label: "Paint collision", key: "C", icon: Shield },
]

const COLLISION_PRESETS = [0, 2, 26, 194, 1538, 12290]

function IconButton({
  label,
  active,
  onClick,
  disabled,
  children,
}: {
  label: string
  active?: boolean
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-8 items-center justify-center rounded-md text-muted hover:bg-panel-raised hover:text-foreground disabled:opacity-30",
        active && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
      )}
    >
      {children}
    </button>
  )
}

export function Toolbar({
  levels,
  onOpen,
  onSave,
  onPack,
  onFit,
  saving,
  packing,
}: {
  levels: LevelListItem[]
  onOpen: (path: string) => void
  onSave: () => void
  onPack: () => void
  onFit: () => void
  saving: boolean
  packing: boolean
}) {
  const s = useEditor()
  const dirty = s.version !== s.savedVersion
  const sets = new Map<string, LevelListItem[]>()
  for (const l of levels) sets.set(l.set, [...(sets.get(l.set) ?? []), l])

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-panel px-2">
      <div className="flex items-center gap-2 pr-2">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Boxes className="size-4" aria-hidden="true" />
        </span>
        <h1 className="hidden text-sm font-semibold lg:block">Archibald Editor</h1>
      </div>

      <label htmlFor="level-select" className="sr-only">
        Level
      </label>
      <select
        id="level-select"
        value={s.levelPath ?? ""}
        onChange={(e) => onOpen(e.target.value)}
        className="h-8 w-48 rounded-md border bg-background px-2 font-mono text-xs outline-none focus:border-primary"
      >
        {!s.levelPath && <option value="">Choose a level</option>}
        {[...sets.entries()].map(([set, list]) => (
          <optgroup key={set} label={set}>
            {list.map((l) => (
              <option key={l.path} value={l.path}>
                {l.path.replace(/^levels\//, "")}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <div className="mx-1 h-6 w-px bg-border" aria-hidden="true" />

      <div role="toolbar" aria-label="Tools" className="flex items-center gap-0.5">
        {TOOLS.map((t) => (
          <IconButton key={t.id} label={`${t.label} (${t.key})`} active={s.tool === t.id} onClick={() => s.setTool(t.id)}>
            <t.icon className="size-4" />
          </IconButton>
        ))}
      </div>

      {s.tool === "collision" && (
        <div className="flex items-center gap-1">
          <label htmlFor="collision-value" className="text-xs text-muted">
            value
          </label>
          <input
            id="collision-value"
            type="number"
            value={s.collisionValue}
            onChange={(e) => s.setCollisionValue(Number(e.target.value) || 0)}
            className="h-8 w-20 rounded-md border bg-background px-2 font-mono text-xs outline-none focus:border-primary"
          />
          {COLLISION_PRESETS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => s.setCollisionValue(v)}
              className={cn(
                "h-7 rounded-md border px-1.5 font-mono text-[11px] text-muted hover:text-foreground",
                s.collisionValue === v && "border-primary text-foreground",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      )}

      <div className="mx-1 h-6 w-px bg-border" aria-hidden="true" />

      <div className="flex items-center gap-0.5">
        <IconButton label="Undo (Ctrl+Z)" onClick={s.undoAction} disabled={s.undo.length === 0}>
          <Undo2 className="size-4" />
        </IconButton>
        <IconButton label="Redo (Ctrl+Shift+Z)" onClick={s.redoAction} disabled={s.redo.length === 0}>
          <Redo2 className="size-4" />
        </IconButton>
        <IconButton label="Toggle grid (H)" active={s.showGrid} onClick={() => s.toggle("showGrid")}>
          <Grid3x3 className="size-4" />
        </IconButton>
        <IconButton label="Fit level (F)" onClick={onFit}>
          <Maximize className="size-4" />
        </IconButton>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <div className="hidden items-center gap-3 pr-2 text-xs text-muted xl:flex">
          {(
            [
              ["showCollision", "Collision"],
              ["showEntities", "Entities"],
              ["dimInactive", "Dim others"],
              ["snapDecorations", "Snap"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-1.5">
              <input type="checkbox" checked={s[key]} onChange={() => s.toggle(key)} className="accent-primary" />
              {label}
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={!s.level || saving}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-panel-raised disabled:opacity-40"
        >
          <Save className="size-4" aria-hidden="true" />
          {saving ? "Saving" : "Save"}
          {dirty && <span className="size-1.5 rounded-full bg-primary" aria-label="unsaved changes" />}
        </button>
        <button
          type="button"
          onClick={onPack}
          disabled={packing}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <PackageCheck className="size-4" aria-hidden="true" />
          {packing ? "Packing" : "Save & Pack"}
        </button>
      </div>
    </header>
  )
}
