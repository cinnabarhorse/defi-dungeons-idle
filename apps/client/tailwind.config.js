/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'Liberation Mono',
          'Courier New',
          'monospace',
        ],
        hud: ['var(--font-hud)'],
        sans: ['var(--font-hud)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: 0 },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: 0 },
        },
        'level-up-glow': {
          '0%, 100%': {
            opacity: 0.5,
            transform: 'scale(0.96)',
          },
          '50%': {
            opacity: 1,
            transform: 'scale(1.04)',
          },
        },
        'level-up-frame': {
          '0%, 100%': {
            opacity: 0.75,
            transform: 'scale(0.97)',
          },
          '50%': {
            opacity: 1,
            transform: 'scale(1.03)',
          },
        },
        'level-up-title': {
          '0%': {
            opacity: 0,
            transform: 'translateY(30px) scale(0.85)',
          },
          '40%': {
            opacity: 1,
            transform: 'translateY(0) scale(1.05)',
          },
          '100%': {
            opacity: 1,
            transform: 'translateY(0) scale(1)',
          },
        },
        'level-up-number': {
          '0%': {
            opacity: 0,
            transform: 'scale(0.6)',
          },
          '35%': {
            opacity: 1,
            transform: 'scale(1.1)',
          },
          '65%': {
            transform: 'scale(0.95)',
          },
          '100%': {
            opacity: 1,
            transform: 'scale(1)',
          },
        },
        'level-up-sparkle': {
          '0%, 100%': {
            opacity: 0,
            transform: 'scale(0.4) translateY(6px)',
          },
          '50%': {
            opacity: 1,
            transform: 'scale(1.2) translateY(-4px)',
          },
        },
        'level-up-burst': {
          '0%': {
            opacity: 0.7,
            transform: 'scale(0.65)',
          },
          '60%': {
            opacity: 0.45,
            transform: 'scale(1.05)',
          },
          '100%': {
            opacity: 0,
            transform: 'scale(1.45)',
          },
        },
        'level-up-shimmer': {
          '0%, 100%': {
            opacity: 0.3,
          },
          '50%': {
            opacity: 1,
          },
        },
        'level-up-rays': {
          '0%': {
            transform: 'rotate(0deg)',
          },
          '100%': {
            transform: 'rotate(360deg)',
          },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'level-up-glow': 'level-up-glow 2.6s ease-in-out infinite',
        'level-up-frame': 'level-up-frame 2.4s ease-in-out infinite',
        'level-up-title': 'level-up-title 0.85s cubic-bezier(0.16, 1, 0.3, 1) both',
        'level-up-number': 'level-up-number 1s cubic-bezier(0.16, 1, 0.3, 1) both',
        'level-up-sparkle': 'level-up-sparkle 1.4s ease-in-out infinite',
        'level-up-burst': 'level-up-burst 1.4s ease-out forwards',
        'level-up-shimmer': 'level-up-shimmer 1.6s ease-in-out infinite',
        'level-up-rays': 'level-up-rays 14s linear infinite',
      },
      screens: {
        xs: '475px',
      },
      height: {
        'screen-dynamic': '100dvh',
      },
      minHeight: {
        'screen-dynamic': '100dvh',
      },
    },
  },
  plugins: [],
};
