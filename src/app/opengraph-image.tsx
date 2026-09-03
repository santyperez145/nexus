import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: "linear-gradient(145deg, #ffffff 0%, #fafafa 55%, #f5f3ff 100%)",
          color: "#18181b",
          fontFamily: "ui-sans-serif, system-ui",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, letterSpacing: 6, color: "#6d28d9" }}>
          NEXUS
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.05, maxWidth: 900 }}>
            Independent AI model gateway
          </div>
          <div style={{ fontSize: 28, color: "#71717a", maxWidth: 820 }}>
            Una API · cientos de modelos · 0% markup en inferencia
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
