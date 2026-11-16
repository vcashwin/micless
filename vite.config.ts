import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** X and other cards need absolute image URLs. SITE_URL wins; on Vercel the production domain is used. */
const site = process.env.SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");

export default defineConfig({
  plugins: [react(), { name: "site-url", transformIndexHtml: html => html.replaceAll("%SITE_URL%", site) }],
  server: { host: true },
});
