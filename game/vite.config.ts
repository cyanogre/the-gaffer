import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    // Las hojas de sprites son PNG pequeñas: se incrustan en el JS para que la página sea autocontenida.
    assetsInlineLimit: 200_000,
    rollupOptions: {
      output: {
        entryFileNames: (chunk) => (chunk.name === 'bake-sprites' ? 'bake-sprites.js' : 'game.js'),
        assetFileNames: 'game.[ext]',
      },
    },
  },
});
