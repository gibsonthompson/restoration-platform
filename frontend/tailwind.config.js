/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand accent. Swap per-tenant later via report_branding / CSS vars.
        brand: { DEFAULT: '#ea580c', dark: '#1f2937' }
      }
    }
  },
  plugins: []
};
