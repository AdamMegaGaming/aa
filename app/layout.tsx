import type { Metadata, Viewport } from "next"
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google"
import "./globals.css"

const _sans = IBM_Plex_Sans({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"] })
const _mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"] })

export const metadata: Metadata = {
  title: "Archibald Level Editor",
  description: "Level editor for Archibald's Adventures: edit tilemaps, decorations, collision and entities, then repack data.pdb.",
}

export const viewport: Viewport = {
  themeColor: "#14161b",
  colorScheme: "dark",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-background">
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
