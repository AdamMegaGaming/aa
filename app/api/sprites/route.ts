import { NextResponse } from "next/server"
import { loadSpriteLibrary } from "@/lib/server/sprite-library"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json(await loadSpriteLibrary())
}
