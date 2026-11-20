import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "GOZSter — Strength & Coaching Platform",
  description:
    "Plataforma web (Coach Studio) y mobile PWA Offline-First (Athlete App) para entrenamientos de fuerza.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "GOZSter",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8FAFC" },
    { media: "(prefers-color-scheme: dark)", color: "#0F172A" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

const themeInitScript = `(function(){try{var t=localStorage.getItem('gozster-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh bg-background text-foreground transition-colors duration-150">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
