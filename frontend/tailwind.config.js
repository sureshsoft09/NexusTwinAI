/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: "#0A192F",
          teal: "#0D9488",
          charcoal: "#1E293B",
          slate: "#334155",
          accent: "#2563EB",
        }
      }
    },
  },
  plugins: [],
}
