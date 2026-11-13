import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'

const envDirectory = existsSync(path.resolve(fileURLToPath(new URL('..', import.meta.url)), '.env.example'))
  ? '..'
  : '.'

// https://vite.dev/config/
export default defineConfig({
  envDir: envDirectory,
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  server: {
    port: 5175,
    strictPort: true,
    watch: {
      usePolling: true,
    },
  },
})
