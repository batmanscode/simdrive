import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const sensorPermissionsPolicy = "accelerometer=(self), gyroscope=(self), magnetometer=(self)";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    headers: {
      "Permissions-Policy": sensorPermissionsPolicy
    },
    proxy: {
      "/ws": {
        target: "ws://localhost:8787",
        ws: true
      }
    }
  }
});
