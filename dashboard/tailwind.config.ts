import type { Config } from "tailwindcss";

// Colours are driven by CSS variables (see app/globals.css) so light/dark stay
// in one place. The palette is deliberately warm-neutral with a single muted
// accent — no default-blue, no gradients.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        elevated: "var(--bg-elevated)",
        inset: "var(--bg-inset)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        fg: "var(--text)",
        muted: "var(--text-muted)",
        faint: "var(--text-faint)",
        accent: "var(--accent)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        info: "var(--info)",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: { sm: "6px", DEFAULT: "8px", md: "8px", lg: "10px" },
      fontSize: {
        xs: ["12px", "1.5"],
        sm: ["13px", "1.5"],
        base: ["14px", "1.6"],
        lg: ["16px", "1.5"],
        xl: ["20px", "1.3"],
        "2xl": ["24px", "1.25"],
      },
    },
  },
  plugins: [],
};

export default config;
