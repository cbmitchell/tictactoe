import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  // Required for GitHub Pages — assets are served from /tictactoe/, not /
  base: '/tictactoe/',
});
