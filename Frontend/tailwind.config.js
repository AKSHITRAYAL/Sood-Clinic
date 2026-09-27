/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'gg': '#4CAF50', 
        'bb': '#2196F3'
      },
    },
  },
  plugins: [],
}