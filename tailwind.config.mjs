/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{astro,md,mdx,html,js,ts,tsx,jsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Noto Sans KR', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        body: ['Inter', 'Noto Sans KR', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      }
    }
  },
  plugins: []
};
