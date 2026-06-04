import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "NexaLab LIS | Operación clara y trazable",
    template: "%s | NexaLab LIS",
  },
  description:
    "NexaLab organiza muestras, resultados, inventario y control de calidad en una experiencia clara para laboratorios clínicos, universitarios y de investigación.",
  keywords: [
    "laboratory information system",
    "LIS",
    "gestión de laboratorio",
    "trazabilidad de muestras",
    "control de calidad",
  ],
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
