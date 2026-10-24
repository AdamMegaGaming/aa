"use client"

import { create } from "zustand"
import type { Level } from "@/lib/level-format"

export type Tool = "select" | "paint" | "erase" | "fill" | "pick" | "collision" | "decoration" | "entity"

export type Selection =
  | { kind: "entity"; index: number }
  | { kind: "decoration"; layer: number; index: number }
  | { kind: "cell"; layer: number; x: number; y: number }
  | null

export type Camera = { x: number; y: number; zoom: number }

export type Hover = { wx: number; wy: number; cx: number; cy: number; inside: boolean } | null

const MAX_UNDO = 100

type State = {
  levelPath: string | null
  level: Level | null
  /** Bumped on every mutation so subscribers re-render. Level is mutated in place. */
  version: number
  savedVersion: number
  undo: Level[]
  redo: Level[]

  activeLayer: number
  visibleLayers: boolean[]
  tool: Tool
  brushSprite: string | null
  brushEntity: string | null
  collisionValue: number
  selection: Selection
  camera: Camera
  hover: Hover

  showGrid: boolean
  showCollision: boolean
  showEntities: boolean
  dimInactive: boolean
  snapDecorations: boolean

  loadLevel: (path: string, level: Level) => void
  /** Snapshot current level for undo. Call once before a mutation (or stroke). */
  checkpoint: () => void
  touch: () => void
  markSaved: () => void
  undoAction: () => void
  redoAction: () => void

  setActiveLayer: (i: number) => void
  toggleLayerVisible: (i: number) => void
  setTool: (t: Tool) => void
  setBrushSprite: (name: string | null) => void
  setBrushEntity: (name: string | null) => void
  setCollisionValue: (v: number) => void
  setSelection: (s: Selection) => void
  setCamera: (c: Camera | ((c: Camera) => Camera)) => void
  setHover: (h: Hover) => void
  toggle: (key: "showGrid" | "showCollision" | "showEntities" | "dimInactive" | "snapDecorations") => void
}

export const useEditor = create<State>((set, get) => ({
  levelPath: null,
  level: null,
  version: 0,
  savedVersion: 0,
  undo: [],
  redo: [],

  activeLayer: 1,
  visibleLayers: [],
  tool: "select",
  brushSprite: null,
  brushEntity: null,
  collisionValue: 1,
  selection: null,
  camera: { x: 0, y: 0, zoom: 1 },
  hover: null,

  showGrid: true,
  showCollision: false,
  showEntities: true,
  dimInactive: true,
  snapDecorations: true,

  loadLevel: (path, level) => {
    const main = level.layers.findIndex((l) => l.collision !== null)
    set({
      levelPath: path,
      level,
      version: 0,
      savedVersion: 0,
      undo: [],
      redo: [],
      selection: null,
      activeLayer: main >= 0 ? main : 0,
      visibleLayers: level.layers.map(() => true),
    })
  },
  checkpoint: () => {
    const { level, undo } = get()
    if (!level) return
    set({ undo: [...undo.slice(-MAX_UNDO + 1), structuredClone(level)], redo: [] })
  },
  touch: () => set((s) => ({ version: s.version + 1 })),
  markSaved: () => set((s) => ({ savedVersion: s.version })),
  undoAction: () => {
    const { level, undo, redo } = get()
    if (!level || undo.length === 0) return
    const prev = undo[undo.length - 1]
    set((s) => ({ level: prev, undo: undo.slice(0, -1), redo: [...redo, structuredClone(level)], version: s.version + 1, selection: null }))
  },
  redoAction: () => {
    const { level, undo, redo } = get()
    if (!level || redo.length === 0) return
    const next = redo[redo.length - 1]
    set((s) => ({ level: next, redo: redo.slice(0, -1), undo: [...undo, structuredClone(level)], version: s.version + 1, selection: null }))
  },

  setActiveLayer: (i) => set({ activeLayer: i, selection: null }),
  toggleLayerVisible: (i) =>
    set((s) => {
      const v = [...s.visibleLayers]
      v[i] = !v[i]
      return { visibleLayers: v }
    }),
  setTool: (tool) => set({ tool }),
  setBrushSprite: (brushSprite) =>
    set((s) => ({ brushSprite, tool: s.tool === "decoration" || s.tool === "fill" ? s.tool : "paint" })),
  setBrushEntity: (brushEntity) => set({ brushEntity, tool: "entity" }),
  setCollisionValue: (collisionValue) => set({ collisionValue, tool: "collision" }),
  setSelection: (selection) => set({ selection }),
  setCamera: (c) => set((s) => ({ camera: typeof c === "function" ? c(s.camera) : c })),
  setHover: (hover) => set({ hover }),
  toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<State>),
}))
