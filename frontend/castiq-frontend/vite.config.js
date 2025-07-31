import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// 1. Import the plugin
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vitejs.dev/config/
export default defineConfig({
  // 2. Add the plugin to the plugins array
  plugins: [
    react(),
    nodePolyfills(), 
  ],
  // We no longer need the 'define' section, the plugin handles it.
  // define: {
  //   global: 'window',
  // },
})
