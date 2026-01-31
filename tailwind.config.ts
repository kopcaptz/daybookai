import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        serif: ["'Cinzel'", "'Times New Roman'", "serif"],
        sans: ["'Inter'", "system-ui", "sans-serif"],
      },
      colors: {
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
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        mood: {
          1: "hsl(var(--mood-1))",
          2: "hsl(var(--mood-2))",
          3: "hsl(var(--mood-3))",
          4: "hsl(var(--mood-4))",
          5: "hsl(var(--mood-5))",
        },
        cyber: {
          glow: "hsl(var(--glow-primary))",
          "glow-secondary": "hsl(var(--glow-secondary))",
          sigil: "hsl(var(--sigil))",
          rune: "hsl(var(--rune))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        "slide-down": {
          from: { opacity: "0", transform: "translateY(-100%)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 15px hsl(var(--glow-primary) / 0.2)" },
          "50%": { boxShadow: "0 0 25px hsl(var(--glow-primary) / 0.35)" },
        },
        "sigil-pulse": {
          "0%, 100%": { opacity: "0.7" },
          "50%": { opacity: "1" },
        },
        // Breathing animation for sigil
        "breathe": {
          "0%, 100%": { transform: "scale(1)", opacity: "0.85" },
          "50%": { transform: "scale(1.03)", opacity: "1" },
        },
        // Orbital particles
        "orbit-slow": {
          from: { transform: "rotate(0deg) translateX(48px) rotate(0deg)" },
          to: { transform: "rotate(360deg) translateX(48px) rotate(-360deg)" },
        },
        "orbit-medium": {
          from: { transform: "rotate(120deg) translateX(40px) rotate(-120deg)" },
          to: { transform: "rotate(480deg) translateX(40px) rotate(-480deg)" },
        },
        "orbit-counter": {
          from: { transform: "rotate(240deg) translateX(44px) rotate(-240deg)" },
          to: { transform: "rotate(-120deg) translateX(44px) rotate(120deg)" },
        },
        "orbit-fast": {
          from: { transform: "rotate(0deg) translateX(48px) rotate(0deg)" },
          to: { transform: "rotate(360deg) translateX(48px) rotate(-360deg)" },
        },
        "orbit-fast-counter": {
          from: { transform: "rotate(240deg) translateX(44px) rotate(-240deg)" },
          to: { transform: "rotate(-120deg) translateX(44px) rotate(120deg)" },
        },
        // Ritual ripple
        "ritual-ripple": {
          "0%": { 
            transform: "scale(0.8)", 
            opacity: "0.6",
          },
          "100%": { 
            transform: "scale(2)", 
            opacity: "0",
          },
        },
        // Portal transition
        "portal-enter": {
          from: { transform: "scale(0.9)", opacity: "0", filter: "blur(4px)" },
          to: { transform: "scale(1)", opacity: "1", filter: "blur(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        "slide-up": "slide-up 0.3s ease-out",
        "slide-down": "slide-down 0.3s ease-out",
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
        "sigil-pulse": "sigil-pulse 2s ease-in-out infinite",
        "breathe": "breathe 4s ease-in-out infinite",
        "orbit-slow": "orbit-slow 12s linear infinite",
        "orbit-medium": "orbit-medium 8s linear infinite",
        "orbit-counter": "orbit-counter 10s linear infinite",
        "orbit-fast": "orbit-fast 2s linear infinite",
        "orbit-fast-counter": "orbit-fast-counter 2s linear infinite",
        "ritual-ripple": "ritual-ripple 0.6s ease-out forwards",
        "portal-enter": "portal-enter 0.3s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
