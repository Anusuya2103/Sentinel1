/** @type {import("tailwindcss").Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base:     "#0B0F17",
        surface:  "#111827",
        surface2: "#1A2233",
        border:   "#1F2937",
        border2:  "#374151",
        text:     "#F3F4F6",
        muted:    "#9CA3AF",
        dim:      "#4B5563",
        critical: "#EF4444",
        warning:  "#F59E0B",
        cyan:     "#06B6D4",
        safe:     "#10B981",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
