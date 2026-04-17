import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Book_it",
  description: "Gestion de propriétés Airbnb",
  icons: {
    /**
     * WHY we override icons here instead of relying on app/icon.png:
     *
     * Next.js App Router automatically picks up app/icon.png as the favicon
     * (file-based metadata convention). However, the blue pixel-art house in
     * icon.png is hard to see on dark browser tab backgrounds.
     *
     * By declaring `metadata.icons` explicitly in layout.tsx, we take full
     * control of what <link rel="icon"> tags are emitted — this overrides the
     * file-based convention entirely, so Next.js no longer auto-registers icon.png.
     *
     * favicon-white.svg renders the same house shape in white on a transparent
     * background, so it is clearly visible on both dark and light browser UIs.
     *
     * The page logo (AppHeader, /public/logo-transparent.png) is completely
     * unaffected — it is referenced directly in JSX and has nothing to do with
     * the favicon mechanism.
     */
    icon: "/favicon-white.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
