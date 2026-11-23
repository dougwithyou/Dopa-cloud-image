import { Inter_Tight } from "next/font/google";

/**
 * Tipografía del panel, la página principal y el registro. Las plantillas que
 * ven los clientes no la usan (tienen sus propias fuentes).
 */
export const dashFont = Inter_Tight({ subsets: ["latin"], variable: "--font-dash", display: "swap" });
