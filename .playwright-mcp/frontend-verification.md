# Frontend verification evidence

All screenshots are captured with Playwright against `pnpm dev` with `NUXT_PUBLIC_NEW_UI=1`.

| Screen | URL | Checks | Screenshot | Console errors | Result |
|---|---|---|---|---|---|
| New shell | `http://localhost:3000/app` | `header nav[aria-label="Breadcrumb"]` visible = "Overview"; `main#main` visible; `main h1` = "Overview"; 7 primary nav links | `rebuild-shell.png` | none | PASS (visible Chromium) |
