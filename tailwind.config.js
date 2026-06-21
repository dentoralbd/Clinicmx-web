/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#16415C',
          hover: '#1E5C82',
        },
        accent: '#F2876B',
        success: '#2E9E83',
        warning: '#E8A33D',
        error: '#D2554A',
        background: '#F4F8FB',
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
