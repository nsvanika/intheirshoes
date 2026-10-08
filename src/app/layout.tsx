import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import Link from "next/link";
import AccessibilitySettings from "@/components/AccessibilitySettings";
import { NO_FLASH_SCRIPT } from "@/lib/settings";
import "./globals.css";
import "./accessibility.css"; // after globals, so its overrides win

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * OpenDyslexic, bundled with the app (SIL Open Font License 1.1; see src/fonts). It is served from
 * this site, never from a third party. It is only used when "Reading-friendly font" is on, and
 * `preload: false` means a browser does not even download it unless that setting is used.
 */
const readingFont = localFont({
  src: [
    { path: "../fonts/opendyslexic-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/opendyslexic-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-reading",
  display: "swap",
  preload: false,
  fallback: ["Verdana", "Trebuchet MS", "system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: "InTheirShoes",
  description: "See the world through someone else's eyes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the inline script below sets data-* attributes on <html> from the
    // saved accessibility settings before the page paints, which the server cannot know about.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${readingFont.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-slate-900"
        >
          Skip to main content
        </a>
        <header className="border-b border-slate-200 dark:border-slate-800">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-5 gap-y-3 px-4 py-4 sm:px-6">
            <Link href="/" className="mr-auto rounded-md text-xl font-semibold tracking-tight">
              InTheirShoes
            </Link>
            <nav aria-label="Main">
              <Link
                href="/make-your-own"
                className="rounded-md text-teal-800 underline underline-offset-4 dark:text-teal-300"
              >
                Make Your Own
              </Link>
            </nav>
            <AccessibilitySettings />
          </div>
        </header>
        <div id="main" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </div>
        <footer className="border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto w-full max-w-5xl space-y-3 px-4 py-5 text-sm leading-relaxed text-slate-700 sm:px-6 dark:text-slate-300">
            <p role="note">
              <strong>Educational use only.</strong> These stories are fictional examples to help people
              think about how others might see a situation. They are not medical, psychological, or
              professional advice, and real people and situations are always more varied than any
              example.
            </p>
            <p>InTheirShoes is a practice tool, not therapy or diagnosis.</p>
            <nav aria-label="Footer">
              <Link
                href="/privacy"
                className="rounded-md text-teal-800 underline underline-offset-4 dark:text-teal-300"
              >
                Privacy
              </Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
