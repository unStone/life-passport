import { defineConfig } from 'vite';
export default defineConfig({ base: './', resolve: { mainFields: ['browser', 'main'] }, build: { assetsInlineLimit: 0 } });
