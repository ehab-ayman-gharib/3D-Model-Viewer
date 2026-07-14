import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Z-Plane — High-Performance 3D/AR Pipeline",
  description: "Z-Plane bridges the gap between cloud storage and physical reality using a lightweight, edge-native 3D/WebAR viewer on Cloudflare.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script src="/xr.js" strategy="beforeInteractive" data-preload-chunks="slam" />
        <Script src="https://cdn.jsdelivr.net/npm/@8thwall/xrextras@1/dist/xrextras.js" strategy="beforeInteractive" />
        <Script src="https://cdn.jsdelivr.net/npm/@8thwall/landing-page@1/dist/landing-page.js" strategy="beforeInteractive" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
