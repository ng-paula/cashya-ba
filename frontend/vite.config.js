import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The backend (FastAPI / Express) will run on port 8000.
// Requests to /api are forwarded there once the backend exists.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
});
