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
# Prune dev dependencies now that the build is done. The generated Prisma
# client lives in the virtual store and survives the prod install.
RUN pnpm install --prod --frozen-lockfile

FROM gcr.io/distroless/nodejs22-debian12:nonroot@sha256:13593b7570658e8477de39e2f4a1dd25db2f836d68a0ba771251572d23bb4f8e AS runtime
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
CMD ["dist/main.js"]
