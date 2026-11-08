import "dotenv/config";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Три набора: unit (чистая логика, без БД), integration (с БД из docker-compose),
// security (матрица изоляции IDOR/ролей, SPEC §9.3). Запуск: pnpm test:unit | test:integration | test:security.
export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.{ts,tsx}"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          // Тесты делят одну БД — без параллелизма между файлами.
          fileParallelism: false,
        },
      },
      {
        extends: true,
        test: {
          name: "security",
          include: ["tests/security/**/*.test.ts"],
          environment: "node",
          fileParallelism: false,
        },
      },
    ],
  },
});
