import { assetUrl } from "@/lib/image-cache"
import type { SpriteDef } from "@/lib/types"
import { cn } from "@/lib/utils"

export function SpriteThumb({ def, size = 48, className }: { def: SpriteDef | undefined; size?: number; className?: string }) {
  const scale = def ? Math.min(1, (size - 4) / Math.max(def.w, def.h, 1)) : 1
  return (
    <div
      className={cn("checker flex shrink-0 items-center justify-center overflow-hidden rounded-sm", className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {def ? (
        <div
          className="shrink-0"
          style={{
            width: def.w,
            height: def.h,
            backgroundImage: `url(${assetUrl(def.surface)})`,
            backgroundPosition: `-${def.x}px -${def.y}px`,
            backgroundRepeat: "no-repeat",
            transform: `scale(${scale})`,
            imageRendering: scale >= 1 ? "pixelated" : "auto",
          }}
        />
      ) : (
        <span className="text-[10px] text-muted">?</span>
      )}
    </div>
  )
}
