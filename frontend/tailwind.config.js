/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // brand = primary action (light blue) + chrome (navy). Existing pages
        // that use bg-brand / text-brand / bg-brand-dark adopt it with no edits.
        brand: { DEFAULT: '#29ABE6', dark: '#0E2A4D', deep: '#1483C2', soft: '#E6F4FC' },
        sky:   { DEFAULT: '#29ABE6', deep: '#1483C2', soft: '#E6F4FC' },
        navy:  { DEFAULT: '#0E2A4D', soft: '#1A3D67' },
        aqua:  { DEFAULT: '#11B5C6', deep: '#0B7C88', soft: '#E4F8FA' },
        coral: { DEFAULT: '#F26B3A', deep: '#D8501F', soft: '#FFEFE9' },
        ink:   { DEFAULT: '#16243B', soft: '#26323F' }
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        display: ['"Bricolage Grotesque"', '"Plus Jakarta Sans"', 'sans-serif']
      },
      boxShadow: {
        soft: '0 1px 2px rgba(14,42,77,.04), 0 6px 18px rgba(14,42,77,.07)',
        sky:  '0 8px 20px rgba(31,160,222,.30)'
      },
      borderRadius: { '2xl': '1.1rem', '3xl': '1.6rem' }
    }
  },
  plugins: []
};