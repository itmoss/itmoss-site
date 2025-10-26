/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{astro,md,mdx,html,js,ts,tsx,jsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['ui-sans-serif', 'system-ui', 'Inter', 'Arial', 'sans-serif'],
        body: ['ui-sans-serif', 'system-ui', 'Inter', 'Arial', 'sans-serif']
      }
    }
  },
  plugins: [require('@tailwindcss/typography')]
};
