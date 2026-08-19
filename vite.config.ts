import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { sentryVitePlugin } from '@sentry/vite-plugin'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // Sentry needs source maps to symbolicate the minified client bundle.
  // `upload_source_maps` in wrangler.jsonc only feeds Cloudflare's own dashboard.
  build: { sourcemap: true },
  plugins: [
    devtools(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    // Uploads source maps and stamps the release. Skipped without a token, so local
    // builds and anyone cloning the repo are unaffected.
    !!process.env.SENTRY_AUTH_TOKEN &&
      sentryVitePlugin({
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
      }),
  ],
})

export default config
