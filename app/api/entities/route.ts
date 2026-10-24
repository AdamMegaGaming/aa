import { NextResponse } from "next/server"
import { loadEntityCatalog } from "@/lib/server/entity-catalog"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json(await loadEntityCatalog())
}
