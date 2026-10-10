import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The waste preview imports packages/core directly, so the numbers a worker sees before
// submitting come from the same functions the Lambda uses (R2).
export default defineConfig({
  plugins: [react()],
  server: { fs: { allow: [".."] } },
});
