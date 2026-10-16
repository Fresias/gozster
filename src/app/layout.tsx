import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GOZSter — Strength & Coaching Platform",
  description:
    "Plataforma web (Coach Studio) y mobile PWA Offline-First (Athlete App) para entrenamientos de fuerza.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark">
      <body className="min-h-dvh bg-background text-foreground">{children}</body>
    </html>
  );
}
