import { defineConfig } from 'vite';

// base: './' makes the built game work from any sub-folder (itch.io, GitHub Pages, zip).
export default defineConfig({
  base: './',
  server: { open: true },
});
