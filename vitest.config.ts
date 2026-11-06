import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: [
      "tests/unit/**/*.test.ts",
      "tests/components/**/*.test.tsx",
      "tests/api/**/*.test.ts",
    ],
    setupFiles: ["./tests/setup.ts"],
    restoreMocks: true,
  },
});
