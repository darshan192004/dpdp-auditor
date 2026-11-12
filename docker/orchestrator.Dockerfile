# Orchestrator image (tasks.md P1-34).
#
# Multi-stage: pnpm/turbo build on Debian, then `pnpm deploy` produces a
# production-only tree (workspace deps included) that runs on a digest-pinned
# distroless Node 22 base as a non-root user (security.md §11).
ARG NODE_IMAGE=node:22-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    HUSKY=0
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
# Builds @dpdpa/contracts + @dpdpa/observability first, and runs prisma generate.
RUN pnpm exec turbo build --filter=@dpdpa/orchestrator...
# Drop the dev tree, then install a production-only tree for the orchestrator
# and its workspace dependencies. The filter matters: an unfiltered prod
# install also keeps the web workspace's runtime deps (Nuxt modules and their
# bundled binaries) in the shared store, which bloats this image and drags in
# unrelated CVEs.
# --ignore-scripts skips the root `prepare: husky` hook (husky is a dev dep).
RUN rm -rf node_modules apps/*/node_modules packages/*/node_modules
RUN pnpm install --prod --frozen-lockfile --ignore-scripts --filter=@dpdpa/orchestrator...
RUN pnpm --filter @dpdpa/orchestrator exec prisma generate
# `pnpm install --prod` only creates node_modules for workspaces that still have
# runtime dependencies. @dpdpa/observability has none, so its directory is
# absent and the COPY below would fail; create it explicitly.
RUN mkdir -p apps/orchestrator/node_modules packages/contracts/node_modules packages/observability/node_modules

FROM gcr.io/distroless/nodejs22-debian13:nonroot@sha256:34985bab6fd6981259f18ab7555995a911ca3bee4b0d38bacdc63932df1dc6cb AS runtime
ENV NODE_ENV=production \
    PORT=3001
WORKDIR /app
# Copy the workspace layout verbatim: pnpm's relative symlinks only resolve
# when node_modules and the workspace packages keep their original paths.
COPY --from=build --chown=nonroot:nonroot /repo/package.json ./package.json
COPY --from=build --chown=nonroot:nonroot /repo/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build --chown=nonroot:nonroot /repo/node_modules ./node_modules
COPY --from=build --chown=nonroot:nonroot /repo/apps/orchestrator/package.json ./apps/orchestrator/package.json
COPY --from=build --chown=nonroot:nonroot /repo/apps/orchestrator/dist ./apps/orchestrator/dist
COPY --from=build --chown=nonroot:nonroot /repo/apps/orchestrator/prisma ./apps/orchestrator/prisma
COPY --from=build --chown=nonroot:nonroot /repo/apps/orchestrator/node_modules ./apps/orchestrator/node_modules
COPY --from=build --chown=nonroot:nonroot /repo/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build --chown=nonroot:nonroot /repo/packages/contracts/dist ./packages/contracts/dist
COPY --from=build --chown=nonroot:nonroot /repo/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=build --chown=nonroot:nonroot /repo/packages/observability/package.json ./packages/observability/package.json
COPY --from=build --chown=nonroot:nonroot /repo/packages/observability/dist ./packages/observability/dist
COPY --from=build --chown=nonroot:nonroot /repo/packages/observability/node_modules ./packages/observability/node_modules
USER nonroot
EXPOSE 3001
CMD ["apps/orchestrator/dist/main.js"]
