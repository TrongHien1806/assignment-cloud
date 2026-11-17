# syntax=docker/dockerfile:1

ARG NODE_IMAGE=node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54

FROM ${NODE_IMAGE} AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM deps AS test

COPY src/ src/
COPY test/ test/
RUN npm test

FROM ${NODE_IMAGE} AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
# Lấy source từ stage test để image không build được khi test hỏng.
COPY --from=test /app/src ./src

# UID dạng số để Kubernetes kiểm tra được runAsNonRoot.
USER 1000:1000
EXPOSE 8080

ENTRYPOINT ["node", "src/server.js"]
