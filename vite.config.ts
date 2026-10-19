/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Content Security Policy for the built site. The page may only run its own scripts, load
 * sprites from GitHub (PokeAPI) and fonts from Google, and fetch its own data files.
 * Added at build time only: the dev server needs inline scripts for hot reload.
 * (frame-ancestors can't be set from a meta tag; GitHub Pages doesn't allow custom headers.)
 */
export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data: https://raw.githubusercontent.com https://cdn.jsdelivr.net",
  "connect-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
].join('; ');

function securityHeaders(): Plugin {
  return {
    name: 'security-meta',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
      { tag: 'meta', attrs: { name: 'referrer', content: 'no-referrer' }, injectTo: 'head-prepend' },
    ],
  };
}

// GitHub Pages serves this repo at https://mcui1997.github.io/shiny-hunting/
export default defineConfig({
  base: '/shiny-hunting/',
  plugins: [react(), securityHeaders()],
  build: { sourcemap: false },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
