/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: '#E2E8F0',
        primary: {
          DEFAULT: '#0D9488',
          hover: '#0F766E',
          bright: '#14B8A6',
          deep: '#115E59',
          light: '#E6F4F1',
          surface: '#F2FAF8',
        },
        highlight: {
          DEFAULT: '#E91E8C',
          hover: '#C7186F',
          light: '#FCE4EC',
        },
        accent: {
          DEFAULT: '#F2876B',
          light: '#FFF0ED',
        },
        success: '#2E9E83',
        warning: '#E8A33D',
        error: '#D2554A',
        background: '#F0FDFB',
        card: {
          DEFAULT: '#FFFFFF',
          hover: '#FAFDFD',
        },
        surface: {
          subtle: '#F6FCFA',
          glass: 'rgba(255, 255, 255, 0.85)',
        },
        text: {
          primary: '#0B1F26',
          secondary: '#51707B',
          muted: '#839EAA',
        },
      },
      boxShadow: {
        'elevation-low': '0 1px 3px rgba(11,31,38,.04), 0 6px 18px -8px rgba(13,148,136,.12)',
        'elevation-md': '0 4px 12px rgba(11,31,38,.06), 0 12px 28px -10px rgba(13,148,136,.18)',
        'elevation-high': '0 8px 24px rgba(11,31,38,.08), 0 20px 48px -12px rgba(13,148,136,.25)',
        'glass': '0 8px 32px 0 rgba(13, 148, 136, 0.08)',
        'glow-primary': '0 0 20px rgba(20, 184, 166, 0.25)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
