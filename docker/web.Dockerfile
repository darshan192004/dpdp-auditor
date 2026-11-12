# Web app image (tasks.md P1-34).
#
# Multi-stage: pnpm/turbo build on Debian, run the Nitro output on a
# digest-pinned distroless Node 22 base as a non-root user (security.md §11).
# Base digests are multi-arch index digests; bump them with Renovate.
ARG NODE_IMAGE=node:22-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    HUSKY=0 \
    NUXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
# `...` builds @dpdpa/contracts and any other workspace dependency first.
RUN pnpm exec turbo build --filter=@dpdpa/web...

FROM gcr.io/distroless/nodejs22-debian13:nonroot@sha256:34985bab6fd6981259f18ab7555995a911ca3bee4b0d38bacdc63932df1dc6cb AS runtime
ENV NODE_ENV=production \
    NITRO_HOST=0.0.0.0 \
    NITRO_PORT=3000
WORKDIR /app
COPY --from=build --chown=nonroot:nonroot /repo/apps/web/.output ./
USER nonroot
EXPOSE 3000
# Distroless node's entrypoint is `node`; args are resolved from WORKDIR.
CMD ["server/index.mjs"]
