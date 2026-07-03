import { ImageResponse } from "next/og";

export const alt = "NexaLab — Sistema de Laboratorio Educativo";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          background: "linear-gradient(135deg, #1d6b64 0%, #145250 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 88, fontWeight: 700, letterSpacing: -3 }}>
          NexaLab
        </div>
        <div style={{ display: "flex", fontSize: 32, color: "#e6f2ef", letterSpacing: 0.5 }}>
          Sistema de Laboratorio Educativo
        </div>
      </div>
    ),
    { ...size }
  );
}
