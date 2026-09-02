/** @type {import("tailwindcss").Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base:     "#080C10",
        panel:    "#0D1117",
        panel2:   "#111820",
        border:   "#1E2D3D",
        border2:  "#2D4A6B",
        text:     "#E2E8F0",
        muted:    "#6B8299",
        dim:      "#3D5470",
        safe:     "#3ECF8E",
        moderate: "#F0A93A",
        critical: "#FF4D4F",
        info:     "#4DA6FF",
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
