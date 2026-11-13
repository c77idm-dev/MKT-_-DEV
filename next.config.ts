import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // O e2e faz o build de produção em outra pasta (NEXT_DIST_DIR=.next-e2e), sem sobrescrever o .next do dev.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Pacotes que o Next não deve empacotar: usam recursos do Node e rodam do node_modules (o standalone os inclui).
  serverExternalPackages: ["pg-boss", "@tus/server", "@tus/file-store"],
  experimental: {
    serverActions: {
      // Planilhas de até 5 MB (spec §6.8) mais a folga do multipart. O nginx da VPS precisa aceitar o mesmo (6m).
      bodySizeLimit: "6mb",
    },
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
