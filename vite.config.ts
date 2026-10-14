import { defineConfig } from 'vite';

export default defineConfig(({mode}) => mode==='library' ? {
  publicDir:false,
  build:{
    lib:{entry:'src/index.ts',formats:['es'],fileName:'index'},
    rollupOptions:{external:['pixi.js']},
  },
} : {
  base:'./',
  publicDir:false,
  build:{outDir:'playground-dist'},
});
