import type { Metadata, Viewport } from "next";
import "./globals.css";
import { APP_NAME } from "@/lib/env";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Entrega fotos, videos y textos para redes sociales a tus clientes en un portal privado.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
