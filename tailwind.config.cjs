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
          primary: '#1B2733',
          secondary: '#5A7184',
        },
      },
      boxShadow: {
        'elevation-low': '0 1px 2px 0 rgba(16, 24, 40, 0.05), 0 1px 3px 0 rgba(16, 24, 40, 0.06)',
        'elevation-md': '0 4px 12px -2px rgba(16, 24, 40, 0.10), 0 2px 4px -2px rgba(16, 24, 40, 0.06)',
        'elevation-high': '0 12px 28px -6px rgba(16, 24, 40, 0.16), 0 6px 12px -4px rgba(16, 24, 40, 0.08)',
      },
    },
  },
  plugins: [],
}
