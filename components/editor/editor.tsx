"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useEditor, type Tool } from "@/lib/editor-store"
import { deleteSelection } from "@/lib/edit-ops"
import { parseLevel, serializeLevel } from "@/lib/level-format"
import { useEntityCatalog, useLevels, useSpriteLibrary } from "@/lib/use-editor-data"
import { cn } from "@/lib/utils"
import { CanvasView } from "./canvas-view"
import { EntityPanel } from "./entity-panel"
import { Inspector } from "./inspector"
import { LayerPanel } from "./layer-panel"
import { SpritePanel } from "./sprite-panel"
import { StatusBar } from "./status-bar"
import { Toolbar } from "./toolbar"

const TOOL_KEYS: Record<string, Tool> = { v: "select", b: "paint", e: "erase", g: "fill", i: "pick", d: "decoration", n: "entity", c: "collision" }

function levelUrl(path: string) {
  return `/api/${path.split("/").map(encodeURIComponent).join("/")}`
}

export function Editor() {
  const { data: levels, error: levelsError } = useLevels()
  const { library, byName: sprites } = useSpriteLibrary()
  const { catalog, byName: entityTypes } = useEntityCatalog()
  const [tab, setTab] = useState<"sprites" | "entities">("sprites")
  const [fitKey, setFitKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [packing, setPacking] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [packLog, setPackLog] = useState<string | null>(null)
  const opened = useRef(false)

  const open = useCallback(async (path: string) => {
    const s = useEditor.getState()
    if (s.level && s.version !== s.savedVersion && !window.confirm("Discard unsaved changes to this level?")) return
    setMessage(`Loading ${path}...`)
    const res = await fetch(levelUrl(path), { cache: "no-store" })
    if (!res.ok) {
      setMessage(`Failed to load ${path}`)
      return
    }
    useEditor.getState().loadLevel(path, parseLevel(await res.text()))
    setFitKey((k) => k + 1)
    setMessage(`Opened ${path}`)
  }, [])

  const save = useCallback(async () => {
    const s = useEditor.getState()
    if (!s.level || !s.levelPath) return true
    setSaving(true)
    const version = s.version
    const res = await fetch(levelUrl(s.levelPath), { method: "PUT", body: serializeLevel(s.level) })
    setSaving(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setMessage(`Save failed: ${err.error ?? res.status}`)
      return false
    }
    const { bytes } = await res.json()
    useEditor.setState({ savedVersion: version })
    setMessage(`Saved ${s.levelPath} (${bytes.toLocaleString()} bytes)`)
    return true
  }, [])

  const pack = useCallback(async () => {
    const s = useEditor.getState()
    if (s.version !== s.savedVersion && !(await save())) return
    setPacking(true)
    setMessage("Packing data.pdb...")
    const res = await fetch("/api/pack", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
    const out = await res.json().catch(() => ({ ok: false, log: "Invalid response" }))
    setPacking(false)
    setPackLog(out.log ?? "")
    setMessage(out.ok ? "Packed data.pdb" : "Pack failed")
  }, [save])

  useEffect(() => {
    if (opened.current || !levels?.length) return
    opened.current = true
    const first = levels.find((l) => l.path === "levels/set1/lev01.txt") ?? levels.find((l) => l.set.startsWith("set")) ?? levels[0]
    open(first.path)
  }, [levels, open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return
      const s = useEditor.getState()
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (mod && k === "z") {
        e.preventDefault()
        if (e.shiftKey) s.redoAction()
        else s.undoAction()
      } else if (mod && k === "y") {
        e.preventDefault()
        s.redoAction()
      } else if (mod && k === "s") {
        e.preventDefault()
        save()
      } else if (!mod && TOOL_KEYS[k]) {
        s.setTool(TOOL_KEYS[k])
      } else if (!mod && k === "h") {
        s.toggle("showGrid")
      } else if (!mod && k === "f") {
        setFitKey((n) => n + 1)
      } else if (!mod && /^[0-9]$/.test(k) && s.level && Number(k) < s.level.layers.length) {
        s.setActiveLayer(Number(k))
      } else if ((k === "delete" || k === "backspace") && s.selection && s.level) {
        e.preventDefault()
        s.checkpoint()
        deleteSelection(s.level, s.selection)
        s.setSelection(null)
        s.touch()
      } else if (k === "escape") {
        s.setSelection(null)
      }
    }
    const beforeUnload = (e: BeforeUnloadEvent) => {
      const s = useEditor.getState()
      if (s.version !== s.savedVersion) e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("beforeunload", beforeUnload)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("beforeunload", beforeUnload)
    }
  }, [save])

  const hasLevel = useEditor((s) => s.level !== null)

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <Toolbar
        levels={levels ?? []}
        onOpen={open}
        onSave={save}
        onPack={pack}
        onFit={() => setFitKey((k) => k + 1)}
        saving={saving}
        packing={packing}
      />
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col border-r bg-panel" aria-label="Library">
          <div role="tablist" aria-label="Library" className="flex border-b">
            {(["sprites", "entities"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex-1 border-b-2 border-transparent py-2 text-sm capitalize text-muted hover:text-foreground",
                  tab === t && "border-primary text-foreground",
                )}
              >
                {t}
                <span className="ml-1.5 font-mono text-[10px]">
                  {t === "sprites" ? (library?.sprites.length ?? "") : (catalog?.entities.length ?? "")}
                </span>
              </button>
            ))}
          </div>
          {tab === "sprites" ? <SpritePanel library={library} byName={sprites} /> : <EntityPanel catalog={catalog} sprites={sprites} />}
        </aside>

        <main className="relative flex min-w-0 flex-1 flex-col">
          {hasLevel ? (
            <CanvasView sprites={sprites} entities={entityTypes} fitKey={fitKey} />
          ) : (
            <div className="flex flex-1 items-center justify-center bg-canvas p-8 text-center text-sm text-muted">
              {levelsError ? "Could not read the extracted/ folder. Run extract.py first." : "Loading levels..."}
            </div>
          )}
          {packLog !== null && (
            <div className="absolute bottom-3 right-3 flex max-h-72 w-[28rem] max-w-[calc(100%-1.5rem)] flex-col rounded-md border bg-panel shadow-xl">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <h2 className="text-sm font-medium">pack.py output</h2>
                <div className="flex items-center gap-2">
                  <a href="/api/pack/download" className="text-xs text-primary underline-offset-2 hover:underline">
                    Download data.pdb
                  </a>
                  <button type="button" onClick={() => setPackLog(null)} className="text-xs text-muted hover:text-foreground">
                    Close
                  </button>
                </div>
              </div>
              <pre className="thin-scroll overflow-auto whitespace-pre-wrap p-3 font-mono text-[11px] leading-relaxed text-muted">{packLog}</pre>
            </div>
          )}
        </main>

        <aside className="thin-scroll flex w-72 shrink-0 flex-col overflow-y-auto border-l bg-panel" aria-label="Layers and properties">
          <LayerPanel />
          <Inspector sprites={sprites} catalog={entityTypes} />
        </aside>
      </div>
      <StatusBar message={message} />
    </div>
  )
}
