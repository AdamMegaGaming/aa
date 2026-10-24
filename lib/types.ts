export type SpriteDef = {
  name: string
  /** Game-relative image path, e.g. "sprites/tile/stone1.png". */
  surface: string
  x: number
  y: number
  w: number
  h: number
  pivotX: number
  pivotY: number
  /** Category from sprite_groups.txt folder (tile, bgr, entity, enemy, ...). */
  category: string
  inEditor: boolean
  /** Set when this entry is an animation; geometry is taken from its first frame. */
  anim?: string[]
}

export type SpriteLibrary = {
  sprites: SpriteDef[]
  categories: string[]
}

export type CatalogEntity = {
  name: string
  base: string | null
  group: string
  /** Props defined in entity_defs.txt (defaults applied by the engine). */
  defProps: { key: string; value: string }[]
  /** Most common per-instance props seen in shipped levels, used as placement defaults. */
  instanceProps: { key: string; value: string; count: number }[]
  usage: number
  icon: string | null
}

export type EntityCatalog = {
  entities: CatalogEntity[]
  groups: string[]
}

export type LevelListItem = { path: string; set: string; file: string; size: number }
