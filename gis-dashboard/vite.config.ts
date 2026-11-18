import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(),tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/geoserver': {
        target: 'http://nkumazivhvaiapqfz9rntr3m-20261111T190131:8080',
        changeOrigin: true
      }
    }
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/geoserver': {
        target: 'http://nkumazivhvaiapqfz9rntr3m-20261111T190131:8080',
        changeOrigin: true
      }
    }
  }
})
