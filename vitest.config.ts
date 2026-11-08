import "dotenv/config";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Три набора: unit (чистая логика, без БД), integration (с БД из docker-compose),
// security (матрица изоляции IDOR/ролей, SPEC §9.3). Запуск: pnpm test:unit | test:integration | test:security.
export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    // server-only бросает исключение вне React Server-окружения; в тестах это обычный модуль.
    alias: {
      "server-only": fileURLToPath(new URL("./tests/helpers/server-only.ts", import.meta.url)),
    },
  },
  test: {
    env: {
      // Тестовый секрет Better Auth на случай, если в .env его нет. Для production не годится.
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ?? "vitest-only-insecure-secret-do-not-use-in-prod",
      BETTER_AUTH_URL: "http://localhost:3000",
    },
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
          setupFiles: ["tests/helpers/setup-db.ts"],
          // Тесты делят одну БД — без параллелизма между файлами.
          fileParallelism: false,
        },
      },
      {
        extends: true,
        test: {
          name: "security",
          include: ["tests/security/**/*.{test,spec}.ts"],
          environment: "node",
          setupFiles: ["tests/helpers/setup-db.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
