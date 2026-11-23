import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { brandTextColor, loadConfig } from "@/lib/catalog";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const { branding } = loadConfig();

export const metadata: Metadata = {
  title: branding.appName,
  description: branding.tagline ?? "Estimate how much flooring a room needs and what it will cost.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Branding colour from config/branding.json → CSS variables used by buttons and accents.
  const brandVars = { "--brand": branding.primaryColor, "--brand-text": brandTextColor(branding.primaryColor) } as CSSProperties;
  return (
    <html lang="en" style={brandVars} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
