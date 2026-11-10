#!/usr/bin/env bash
set -euo pipefail
# Applies every migration except the last by hand (marking each applied), then
# runs `prisma migrate deploy` for the rest: proves a database that is one
# version behind upgrades cleanly (docs/tasks.md Phase 1 exit criterion).
cd "$(dirname "$0")/.."

mapfile -t migrations < <(find prisma/migrations -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)
n=${#migrations[@]}
echo "Found $n migration(s)"

if [ "$n" -ge 2 ]; then
  for ((i = 0; i < n - 1; i++)); do
    m="${migrations[$i]}"
    echo "Baselining migration: $m"
    pnpm exec prisma db execute --file "prisma/migrations/$m/migration.sql"
    pnpm exec prisma migrate resolve --applied "$m"
  done
fi

pnpm exec prisma migrate deploy
pnpm exec prisma migrate status
