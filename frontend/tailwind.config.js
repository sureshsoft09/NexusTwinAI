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
        ivory: {
          50: '#FDFBF7',
          100: '#FAF7F2',
          200: '#F3EFE6',
          300: '#E6E0D3',
          400: '#D4CBB8',
        },
        sage: {
          50: '#F2F8F4',
          100: '#DFF0E5',
          500: '#3B7A57',
          600: '#2D6A4F',
          700: '#1E4D38',
        },
        clay: {
          50: '#FDF3F1',
          100: '#FBE4DF',
          500: '#C85A32',
          600: '#B54834',
          700: '#8F3624',
        },
        gold: {
          50: '#FEF9EE',
          100: '#FDF0D5',
          500: '#D99B26',
          600: '#B7791F',
          700: '#925E14',
        },
        berry: {
          50: '#FCF3F7',
          100: '#F7E1EC',
          500: '#8E3B63',
          600: '#7B2D53',
          700: '#5E203E',
        },
        ink: {
          900: '#1C1917',
          800: '#292524',
          700: '#44403C',
          600: '#57534E',
          500: '#78716C',
          400: '#A8A29E',
        },
      },
      boxShadow: {
        'enterprise': '0 1px 3px 0 rgba(28, 25, 23, 0.05), 0 4px 12px -2px rgba(28, 25, 23, 0.04)',
        'enterprise-md': '0 4px 16px -2px rgba(28, 25, 23, 0.07), 0 2px 6px -1px rgba(28, 25, 23, 0.04)',
        'enterprise-lg': '0 12px 28px -4px rgba(28, 25, 23, 0.09), 0 4px 12px -2px rgba(28, 25, 23, 0.04)',
        'sage-glow': '0 0 0 1px rgba(45, 106, 79, 0.2), 0 8px 20px -4px rgba(45, 106, 79, 0.14)',
        'clay-glow': '0 0 0 1px rgba(181, 72, 52, 0.2), 0 8px 20px -4px rgba(181, 72, 52, 0.14)',
        'gold-glow': '0 0 0 1px rgba(183, 121, 31, 0.2), 0 8px 20px -4px rgba(183, 121, 31, 0.14)',
        'berry-glow': '0 0 0 1px rgba(123, 45, 83, 0.2), 0 8px 20px -4px rgba(123, 45, 83, 0.14)',
      },
    },
  },
  plugins: [],
}
