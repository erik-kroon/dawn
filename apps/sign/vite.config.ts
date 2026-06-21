import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
  server: {
    port: 3002,
    strictPort: true,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [tailwindcss(), react()],
});
