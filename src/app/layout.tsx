import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
  title: "InTheirShoes",
  description: "See the world through someone else's eyes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-slate-900"
        >
          Skip to main content
        </a>
        <header className="border-b border-slate-200 dark:border-slate-800">
          <div className="mx-auto flex w-full max-w-5xl items-center px-4 py-4 sm:px-6">
            <Link
              href="/"
              className="rounded-md text-xl font-semibold tracking-tight"
            >
              InTheirShoes
            </Link>
          </div>
        </header>
        <div id="main" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </div>
        <footer className="border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
          <p
            role="note"
            className="mx-auto w-full max-w-5xl px-4 py-5 text-sm leading-relaxed text-slate-700 sm:px-6 dark:text-slate-300"
          >
            <strong>Educational use only.</strong> These stories are
            fictional examples to help people think about how others might
            see a situation. They are not medical, psychological, or
            professional advice, and real people and situations are always
            more varied than any example.
          </p>
        </footer>
      </body>
    </html>
  );
}
