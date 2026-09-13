/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        agora: {
          bg: "#0b0d12",
          panel: "#12151d",
          border: "#232838",
          accent: "#7c5cff",
          for: "#3ecf8e",
          against: "#ff6b6b",
        },
      },
    },
  },
  plugins: [],
};
