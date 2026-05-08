/** @type {import("tailwindcss").Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ocean: {
          50: "#f4fbfb",
          100: "#e8f7f7",
          500: "#0fa3b1",
          700: "#0f6d77",
          900: "#1e3b43"
        }
      }
    },
  },
  plugins: [],
};
