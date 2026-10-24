"use client"

const images = new Map<string, HTMLImageElement>()
const listeners = new Set<() => void>()

export function assetUrl(surface: string) {
  return `/api/assets/${surface.split("/").map(encodeURIComponent).join("/")}`
}

/** Returns the image if it has finished loading, otherwise starts loading and returns null. */
export function getImage(surface: string): HTMLImageElement | null {
  let img = images.get(surface)
  if (!img) {
    img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => listeners.forEach((l) => l())
    img.src = assetUrl(surface)
    images.set(surface, img)
  }
  return img.complete && img.naturalWidth > 0 ? img : null
}

export function onImageLoaded(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
