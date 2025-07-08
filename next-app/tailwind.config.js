// tailwind.config.js or tailwind.config.mjs
export default {
  darkMode: "class", // <-- THIS enables dark mode
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
     extend: { 
      fontFamily: {'computer-modern': ['Computer Modern', 'serif']}
    } 
  },
  plugins: [],
};