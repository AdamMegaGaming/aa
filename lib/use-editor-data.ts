"use client"

import { useMemo } from "react"
import useSWR from "swr"
import type { CatalogEntity, EntityCatalog, LevelListItem, SpriteDef, SpriteLibrary } from "@/lib/types"

const json = async (url: string) => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url}: ${r.status}`)
  return r.json()
}

const opts = { revalidateOnFocus: false }

export function useLevels() {
  return useSWR<LevelListItem[]>("/api/levels", json, opts)
}

export function useSpriteLibrary() {
  const { data, error, isLoading } = useSWR<SpriteLibrary>("/api/sprites", json, opts)
  const byName = useMemo(() => new Map<string, SpriteDef>((data?.sprites ?? []).map((s) => [s.name, s])), [data])
  return { library: data, byName, error, isLoading }
}

export function useEntityCatalog() {
  const { data, error, isLoading } = useSWR<EntityCatalog>("/api/entities", json, opts)
  const byName = useMemo(() => new Map<string, CatalogEntity>((data?.entities ?? []).map((e) => [e.name, e])), [data])
  return { catalog: data, byName, error, isLoading }
}
