/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./index.html",
    "./app.js",
    "./rankingEngine.js"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        game: {
          bg: '#090d16',
          card: '#0f172a',
          cardHover: '#1e293b',
          accent: '#10b981',
          gold: '#f59e0b',
          silver: '#94a3b8',
          bronze: '#d97706'
        }
      }
    }
  },
  plugins: []
}
