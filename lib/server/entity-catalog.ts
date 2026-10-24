import "server-only"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { parseLevel } from "@/lib/level-format"
import type { CatalogEntity, EntityCatalog } from "@/lib/types"
import { DATA_DIR, resolveDataPath, walkFiles } from "./paths"
import { loadSpriteLibrary } from "./sprite-library"

const SPRITE_KEYS = ["sprite", "sprite1", "on_sprite", "off_sprite", "closed_sprite", "opened_sprite", "idle_sprite"]
const POSITIONAL = new Set(["position_in_layer", "layer_index"])

type Def = { name: string; base: string; group: string; props: { key: string; value: string }[] }

function parseEntityDefs(text: string): Def[] {
  const defs: Def[] = []
  let group = "Definitions"
  const lines = text.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i].replace(/\/\/.*$/, "").trim()
    if (!s || s.startsWith("#")) continue
    const g = s.match(/^group\s+(.+)$/)
    if (g) {
      group = g[1].trim()
      continue
    }
    const m = s.match(/^(\S+)\s+(\S+)\s*\{(.*)$/)
    if (!m) continue
    const def: Def = { name: m[1], base: m[2], group, props: [] }
    const pushProp = (line: string) => {
      const kv = line.trim().match(/^(\S+)(?:\s+(.*))?$/)
      if (kv) def.props.push({ key: kv[1], value: (kv[2] ?? "").trim() })
    }
    const rest = m[3].trim()
    if (rest.includes("}")) {
      const inner = rest.slice(0, rest.indexOf("}")).trim()
      // inline bodies may hold several "key value" pairs, e.g. "{ sprite1 intro/car2 }"
      if (inner) {
        const tk = inner.split(/\s+/)
        for (let k = 0; k < tk.length; k += 2) def.props.push({ key: tk[k], value: tk[k + 1] ?? "" })
      }
    } else {
      if (rest) pushProp(rest)
      i++
      while (i < lines.length && !lines[i].trim().startsWith("}")) {
        const l = lines[i].replace(/\/\/.*$/, "").trim()
        if (l) pushProp(l)
        i++
      }
    }
    defs.push(def)
  }
  return defs
}

let cache: { at: number; cat: EntityCatalog } | null = null

export async function loadEntityCatalog(): Promise<EntityCatalog> {
  if (cache && Date.now() - cache.at < 10000) return cache.cat
  const defsPath = resolveDataPath("entity_defs.txt")
  const defs = parseEntityDefs(defsPath ? await readFile(defsPath, "latin1").catch(() => "") : "")
  const lib = await loadSpriteLibrary()
  const spriteNames = new Set(lib.sprites.map((s) => s.name))

  type Usage = { count: number; props: Map<string, Map<string, number>> }
  const usage = new Map<string, Usage>()
  const files = await walkFiles(path.join(DATA_DIR, "levels"), (p) => p.endsWith(".txt"))
  for (const f of files) {
    const level = parseLevel(await readFile(f, "latin1"))
    for (const e of level.entities) {
      let u = usage.get(e.type)
      if (!u) usage.set(e.type, (u = { count: 0, props: new Map() }))
      u.count++
      for (const p of e.props) {
        if (POSITIONAL.has(p.key)) continue
        let vals = u.props.get(p.key)
        if (!vals) u.props.set(p.key, (vals = new Map()))
        vals.set(p.value, (vals.get(p.value) ?? 0) + 1)
      }
    }
  }

  const resolveIcon = (name: string, props: { key: string; value: string }[]): string | null => {
    const candidates: string[] = []
    for (const k of SPRITE_KEYS) {
      const v = props.find((p) => p.key === k)?.value
      if (v && v !== "none") candidates.push(v)
    }
    const lower = name.toLowerCase()
    const last = lower.split("/").pop() ?? lower
    candidates.push(name, lower, `tile/${lower}`, `tile/${last}`, last, `${last}_0`, `${last}0`)
    return candidates.find((c) => spriteNames.has(c)) ?? null
  }

  const byName = new Map<string, CatalogEntity>()
  for (const d of defs) {
    byName.set(d.name, {
      name: d.name,
      base: d.base,
      group: d.group,
      defProps: d.props,
      instanceProps: [],
      usage: 0,
      icon: null,
    })
  }
  for (const [type, u] of usage) {
    let entry = byName.get(type)
    if (!entry) {
      entry = { name: type, base: null, group: type.includes("/") ? type.split("/")[0] : "Built-in", defProps: [], instanceProps: [], usage: 0, icon: null }
      byName.set(type, entry)
    }
    entry.usage = u.count
    entry.instanceProps = [...u.props.entries()]
      .map(([key, vals]) => {
        const [value, count] = [...vals.entries()].sort((a, b) => b[1] - a[1])[0]
        return { key, value, count: [...vals.values()].reduce((a, b) => a + b, 0) || count }
      })
      .sort((a, b) => b.count - a.count)
  }
  for (const e of byName.values()) {
    e.icon = resolveIcon(e.name, [...e.defProps, ...e.instanceProps])
  }
  const entities = [...byName.values()].sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name))
  const cat: EntityCatalog = { entities, groups: [...new Set(entities.map((e) => e.group))] }
  cache = { at: Date.now(), cat }
  return cat
}
