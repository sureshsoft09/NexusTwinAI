import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiBaseUrl = env.VITE_LOCAL_API_URL || 'http://localhost:8080'
  const wsBaseUrl = env.VITE_LOCAL_WS_URL || 'ws://localhost:8080'

  return {
    plugins: [react()],
    build: {
      outDir: 'build',
    },
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: apiBaseUrl,
          changeOrigin: true,
          ws: true,
        },
        '/ws': {
          target: wsBaseUrl,
          ws: true,
        },
      },
    },
  }
})
