import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/reception': 'http://localhost:3002',
    },
  },
  build: {
    // reown/appkit dan viem memang besar karena mencakup semua wallet provider.
    // Chunk-chunk ini sudah diisolasi via manualChunks agar hanya di-load saat dibutuhkan.
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) return 'react';
          if (id.includes('node_modules/wagmi/')) return 'wagmi';
          if (id.includes('node_modules/viem/')) return 'viem';
        },
      },
    },
  },
})
