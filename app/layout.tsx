import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Kinso Clone — Unified Inbox",
  description: "One inbox for every conversation, powered by the Zernio API.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} h-full bg-neutral-100 text-neutral-900 antialiased`}>
        {children}
      </body>
    </html>
  );
}
