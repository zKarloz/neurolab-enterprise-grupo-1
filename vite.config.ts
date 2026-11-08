import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// El plugin oficial de Tailwind v4 evita introducir PostCSS innecesariamente.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1' },
})
