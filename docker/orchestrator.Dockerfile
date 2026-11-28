# Orchestrator image (tasks.md P1-34).
#
# Multi-stage: pnpm/turbo build on Debian, then `pnpm deploy` produces a
# production-only tree (workspace deps included) that runs on a digest-pinned
# distroless Node 22 base as a non-root user (security.md §11).
ARG NODE_IMAGE=node:22-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d

FROM ${NODE_IMAGE} AS build
# Prisma's postinstall detects the platform with `openssl version`. The slim
# base has no openssl CLI, so it silently downloads the 1.1.x engine; the
# distroless runtime is Debian 13 (OpenSSL 3.x) and would try to download the
# correct engine at runtime, which default-deny egress forbids.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl git \
 && rm -rf /var/lib/apt/lists/*
# Repo resolution runs `git ls-remote --symref` over HTTPS. Stage the helper's
# shared libraries separately; the distroless runtime already provides libc,
# libssl, libz and libzstd, which must not be replaced with Debian 12 copies.
RUN mkdir -p /gitlibs \
 && for lib in $(ldd /usr/bin/git /usr/lib/git-core/git-remote-https \
      | awk '/=> \/lib/{print $3}' | sort -u); do \
      case "$lib" in \
        /lib/x86_64-linux-gnu/libc.so.6|/lib/x86_64-linux-gnu/libcrypto.so.3|/lib/x86_64-linux-gnu/libssl.so.3|/lib/x86_64-linux-gnu/libz.so.1|/lib/x86_64-linux-gnu/libzstd.so.1) ;; \
        *) cp -L "$lib" /gitlibs/ ;; \
      esac; \
    done
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
# --ignore-scripts avoids the root `prepare: husky` hook (husky is a dev dep).
RUN rm -rf node_modules apps/*/node_modules packages/*/node_modules
RUN pnpm install --prod --frozen-lockfile --ignore-scripts --filter=@dpdpa/orchestrator...
RUN pnpm --filter @dpdpa/orchestrator exec prisma generate
# Fail the build here rather than let `prisma migrate deploy` attempt a
# runtime download of the matching engine under default-deny egress.
RUN test -f node_modules/.pnpm/@prisma+engines@7.10.1/node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x
# `pnpm install --prod` only creates node_modules for workspaces that still have
# runtime dependencies. @dpdpa/observability has none, so its directory is
# absent and the COPY below would fail; create it explicitly.
RUN mkdir -p apps/orchestrator/node_modules packages/contracts/node_modules packages/observability/node_modules

FROM gcr.io/distroless/nodejs22-debian13:nonroot@sha256:34985bab6fd6981259f18ab7555995a911ca3bee4b0d38bacdc63932df1dc6cb AS runtime
ENV NODE_ENV=production \
    PORT=3001 \
    LD_LIBRARY_PATH=/gitlibs
WORKDIR /app
# Copy the workspace layout verbatim: pnpm's relative symlinks only resolve
# when node_modules and the workspace packages keep their original paths.
COPY --from=build --chown=nonroot:nonroot /repo/package.json ./package.json
COPY --from=build --chown=nonroot:nonroot /repo/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build --chown=nonroot:nonroot /repo/node_modules ./node_modules
COPY --from=build --chown=nonroot:nonroot /repo/apps/orchestrator/package.json ./apps/orchestrator/package.json
COPY --from=build --chown=nonroot:nonroot /repo/apps/orchestrator/dist ./apps/orchestrator/dist
COPY --from=build --chown=nonroot:nonroot /repo/apps/orchestrator/prisma ./apps/orchestrator/prisma
COPY --from=build --chown=nonroot:nonroot /repo/apps/orchestrator/prisma.config.ts ./apps/orchestrator/prisma.config.ts
COPY --from=build --chown=nonroot:nonroot /repo/apps/orchestrator/node_modules ./apps/orchestrator/node_modules
COPY --from=build --chown=nonroot:nonroot /repo/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build --chown=nonroot:nonroot /repo/packages/contracts/dist ./packages/contracts/dist
COPY --from=build --chown=nonroot:nonroot /repo/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=build --chown=nonroot:nonroot /repo/packages/observability/package.json ./packages/observability/package.json
COPY --from=build --chown=nonroot:nonroot /repo/packages/observability/dist ./packages/observability/dist
COPY --from=build --chown=nonroot:nonroot /repo/packages/observability/node_modules ./packages/observability/node_modules
# The rule-pack loader reads and hash-verifies every YAML file in this
# directory at startup; without it the API exits with RULE_PACK_MISSING.
COPY --from=build --chown=nonroot:nonroot /repo/packages/rule-packs ./packages/rule-packs
# The beta gate loads this record from /app/docs/records at runtime.
COPY --from=build --chown=nonroot:nonroot /repo/docs/records/phase-f-beta-false-positive-review.json ./docs/records/phase-f-beta-false-positive-review.json
# Anonymous `git ls-remote` is part of public-repo validation.
COPY --from=build --chown=nonroot:nonroot /usr/bin/git /usr/bin/git
COPY --from=build --chown=nonroot:nonroot /usr/lib/git-core /usr/lib/git-core
COPY --from=build --chown=nonroot:nonroot /gitlibs /gitlibs
USER nonroot
EXPOSE 3001
CMD ["apps/orchestrator/dist/main.js"]
