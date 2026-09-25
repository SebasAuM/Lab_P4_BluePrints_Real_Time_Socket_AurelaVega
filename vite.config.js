import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // REST (CRUD + login) va por proxy a la API Spring. El tiempo real (STOMP) NO pasa por
    // aquí: el cliente se conecta directo a VITE_STOMP_BASE/ws-blueprints y Spring valida el origen (CORS).
    proxy: {
      '/api': 'http://localhost:8080',
      '/auth': 'http://localhost:8080',
    },
  },
})
