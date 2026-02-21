/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        coco: {
          dark: '#1a1a1a', // Blackish from palette
          brown: {
            DEFAULT: '#5d2b1e', // Center brown
            dark: '#4a2218',    
            light: '#7a3e2a',
          },
          green: {
            DEFAULT: '#8cb133', // Lime green
            dark: '#4c7028',    // Dark green left
            light: '#a4c948',
          },
          offwhite: '#f5f5f5',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
