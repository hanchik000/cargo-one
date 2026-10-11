# Hugging Face Spaces (Docker, free CPU). Paste this file as "Dockerfile" into a new Docker Space.
# Add one secret in the Space settings: OTAPI_KEY. Everything else comes from deploy/render.env.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
# Re-download the code whenever the main branch changes (otherwise a rebuild would reuse the cached copy).
ADD https://api.github.com/repos/hanchik000/cargo-one/git/refs/heads/main /tmp/ref.json
RUN git clone --depth 1 https://github.com/hanchik000/cargo-one /app && chown -R 1000:1000 /app
WORKDIR /app
USER 1000
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm install --include=dev --no-audit --no-fund && npm run build
ENV PORT=7860 DATA_DIR=/tmp/cargo-data TRUST_PROXY=1
EXPOSE 7860
CMD ["node", "--env-file=deploy/render.env", "--disable-warning=ExperimentalWarning", "server/server.mjs"]
