import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

/**
 * NV Core design-system preset.
 *
 * Tokens extracted verbatim from the NV Core design (dark "Business OS").
 * Semantic colors reference CSS variables (defined in globals.css) so the
 * theme can be swapped per-workspace and light-mode added later without
 * touching component code.
 */
const preset = {
  darkMode: "class" as const,
  content: [],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        // --- NV Core themeable tokens (CSS vars; light + dark in globals.css) ---
        canvas: "hsl(var(--canvas) / <alpha-value>)",
        nav: "hsl(var(--nav) / <alpha-value>)",
        ink: {
          DEFAULT: "hsl(var(--ink) / <alpha-value>)",
          bright: "hsl(var(--ink-bright) / <alpha-value>)",
          muted: "hsl(var(--ink-muted) / <alpha-value>)",
          soft: "hsl(var(--ink-soft) / <alpha-value>)",
          faint: "hsl(var(--ink-faint) / <alpha-value>)",
        },
        line: {
          DEFAULT: "hsl(var(--line) / <alpha-value>)",
          soft: "hsl(var(--line-soft) / <alpha-value>)",
          strong: "hsl(var(--line-strong) / <alpha-value>)",
          bright: "hsl(var(--line-bright) / <alpha-value>)",
        },
        panel: {
          DEFAULT: "hsl(var(--panel) / <alpha-value>)",
          raised: "hsl(var(--panel-raised) / <alpha-value>)",
          high: "hsl(var(--panel-high) / <alpha-value>)",
          sunken: "hsl(var(--panel-sunken) / <alpha-value>)",
        },
        brand: {
          DEFAULT: "#5B8DEF",
          bright: "#8FB4FF",
          violet: "#7C7CF0",
          indigo: "#6E6EF2",
        },
        state: {
          success: "#3FB950",
          warning: "#E3B341",
          danger: "#F85149",
        },
        // --- shadcn semantic tokens (CSS vars) ---
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-newsreader)", "Georgia", "serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        brand: "0 3px 10px -3px rgba(91,141,239,.7)",
        panel: "0 8px 30px -12px rgba(0,0,0,.6)",
        drawer: "-16px 0 40px -20px rgba(0,0,0,.7)",
      },
      keyframes: {
        fadein: { from: { opacity: "0" }, to: { opacity: "1" } },
        slideInRight: {
          from: { opacity: "0", transform: "translateX(30px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        popIn: {
          from: { opacity: "0", transform: "translateY(-8px) scale(.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        riseIn: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        pulseDot: { "0%,100%": { opacity: "1" }, "50%": { opacity: ".35" } },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        fadein: "fadein .2s ease",
        "slide-in-right": "slideInRight .28s ease",
        "pop-in": "popIn .16s ease",
        "rise-in": "riseIn .3s ease",
        "pulse-dot": "pulseDot 1.6s ease-in-out infinite",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [animate],
} satisfies Omit<Config, "content">;

export default preset;
