import type { NextConfig } from "next";
import { staticSecurityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  // Для Docker-образа: server.js + минимальный node_modules (см. Dockerfile).
  output: "standalone",
  // Next 16 по умолчанию дописывает свой блок в AGENTS.md при `next dev`.
  // AGENTS.md у нас — правила для DeepSeek (docs/DEEPSEEK-TASKS.md, прил. A), поэтому отключаем.
  agentRules: false,
  // Шрифты для PDF читаются с диска во время запроса: без явного указания в standalone их не будет.
  outputFileTracingIncludes: {
    "/api/me/documents/[id]/file": ["./src/server/pdf/fonts/*.ttf"],
  },
  async headers() {
    return [{ source: "/:path*", headers: [...staticSecurityHeaders] }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
