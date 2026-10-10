import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  server: {
    // Used once VITE_USE_MOCKS is off and Django is running locally.
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
