/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['Fraunces', 'Georgia', 'serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        pearl: {
          50: '#FAFCFF',
          100: '#F5F8FC',
          200: '#EBF1F8',
          300: '#DCE4EE',
          400: '#C4D0E0',
        },
        cerulean: {
          50: '#ECF5FC',
          100: '#D6EAF8',
          500: '#166FA6',
          600: '#0E5A8A',
          700: '#094266',
        },
        mint: {
          50: '#EEFBF6',
          100: '#D5F5E9',
          600: '#0D7A5F',
          700: '#095C47',
        },
        coral: {
          50: '#FDF2F2',
          100: '#FCE4E4',
          600: '#C93B2B',
          700: '#9E2B1E',
        },
        amber: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          600: '#C27803',
          700: '#925802',
        },
        plum: {
          50: '#F5F3FF',
          100: '#EDE9FE',
          600: '#6D28D9',
          700: '#5B21B6',
        },
      },
      boxShadow: {
        'enterprise': '0 1px 3px 0 rgba(20, 33, 61, 0.05), 0 4px 12px -2px rgba(20, 33, 61, 0.04)',
        'enterprise-md': '0 4px 16px -2px rgba(20, 33, 61, 0.07), 0 2px 6px -1px rgba(20, 33, 61, 0.04)',
        'enterprise-lg': '0 12px 28px -4px rgba(20, 33, 61, 0.10), 0 4px 12px -2px rgba(20, 33, 61, 0.05)',
      },
    },
  },
  plugins: [],
}
