/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#0d1a2e",
          900: "#14335c",
          800: "#1c4270",
        },
        teal: {
          600: "#1f6f6b",
          700: "#15514e",
        },
        risk: {
          low: "#1f8a5f",
          lowBg: "#e5f5ee",
          medium: "#a4740f",
          mediumBg: "#faf1dc",
          high: "#c85a1f",
          highBg: "#fbe9dc",
          critical: "#c22a3e",
          criticalBg: "#fbe3e6",
        },
      },
      fontFamily: {
        serif: ['"Source Serif 4"', "Georgia", "serif"],
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "monospace"],
      },
    },
  },
  plugins: [],
};
