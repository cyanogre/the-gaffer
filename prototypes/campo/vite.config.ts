import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        entryFileNames: 'lab.js',
        assetFileNames: 'lab.[ext]',
        inlineDynamicImports: true,
      },
    },
  },
});
