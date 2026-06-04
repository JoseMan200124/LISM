import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NexaLab LIS",
  description: "Laboratory information system for traceable, efficient lab operations.",
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
