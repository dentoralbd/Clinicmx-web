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
        },
        highlight: {
          DEFAULT: '#E91E8C',
          hover: '#C7186F',
        },
        accent: '#F2876B',
        success: '#2E9E83',
        warning: '#E8A33D',
        error: '#D2554A',
        background: '#F0FDFB',
        card: '#FFFFFF',
        text: {
          primary: '#0B1F26',
          secondary: '#51707B',
        },
      },
      boxShadow: {
        'elevation-low': '0 1px 2px rgba(11,31,38,.05), 0 8px 24px -12px rgba(13,148,136,.18)',
        'elevation-md': '0 2px 4px rgba(11,31,38,.06), 0 12px 32px -14px rgba(13,148,136,.22)',
        'elevation-high': '0 2px 6px rgba(11,31,38,.06), 0 18px 44px -16px rgba(13,148,136,.28)',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
