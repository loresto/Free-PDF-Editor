import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages отдаёт проект из подпапки /<repo>/, поэтому base задаётся при
// сборке (workflow выставляет VITE_BASE). Локально и на своём домене — корень.
const base = process.env.VITE_BASE || '/'

// Сборка для Pages — чистый статический сайт: Cloudflare-плагин не нужен и
// переписывает пути к ассетам под файловую систему.
const pages = base !== '/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss(), ...(pages ? [] : [cloudflare()])],
  build: {
    target: 'es2022',
    // Отдельная папка для Pages: локальная сборка пишет в dist/client + worker.
    ...(pages ? { outDir: 'dist/pages', emptyOutDir: true } : {}),
  },
})
