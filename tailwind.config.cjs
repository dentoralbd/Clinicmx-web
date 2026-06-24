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
    },
  },
  plugins: [],
}
