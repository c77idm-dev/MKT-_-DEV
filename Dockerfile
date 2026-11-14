FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm run build:scripts

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 MIDIA_DIR=/data/midia MIDIA_TMP_DIR=/data/tmp MALLOC_ARENA_MAX=2
# ffmpeg (Vídeo de Prova, spec §9; traz o ffprobe) e a fonte do carimbo das fotos (sem ela o texto do sharp sai em branco).
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
RUN groupadd --system app && useradd --system --gid app app && mkdir -p /data/midia /data/tmp && chown -R app:app /data
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/dist ./dist
# Módulo nativo do argon2: garante a versão da plataforma da imagem.
COPY --from=build /app/node_modules/@node-rs ./node_modules/@node-rs
# sharp do worker (empacotado com --external:sharp): o módulo, os binários da plataforma e as dependências dele.
COPY --from=build /app/node_modules/sharp ./node_modules/sharp
COPY --from=build /app/node_modules/@img ./node_modules/@img
COPY --from=build /app/node_modules/detect-libc ./node_modules/detect-libc
COPY --from=build /app/node_modules/semver ./node_modules/semver
USER app
EXPOSE 3000
CMD ["sh", "-c", "node dist/migrar.mjs && exec node server.js"]
