// Nuxt 4 config — see docs/design.md (framework pin) and docs/security.md §8 (headers, added in P1-23).
export default defineNuxtConfig({
  modules: ['@nuxt/ui'],

  css: ['~/assets/css/main.css'],

  typescript: {
    strict: true,
  },

  devtools: {
    enabled: false,
  },

  compatibilityDate: '2026-11-06',
});
