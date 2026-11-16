import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { POST } from "./api/transcribe.ts";

/** X and other cards need absolute image URLs. SITE_URL wins; on Vercel the production domain is used. */
const site = process.env.SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");

/** Serves api/transcribe.ts in `npm run dev`, as Vercel does in production (needs GROQ_API_KEY in the environment) */
const api: Plugin = {
  name: "api-transcribe",
  configureServer(server) {
    server.middlewares.use("/api/transcribe", async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const headers = new Headers(Object.entries(req.headers).flatMap(([k, v]) => (typeof v === "string" ? [[k, v] as [string, string]] : [])));
      const response = await POST(new Request(`http://${req.headers.host}/api/transcribe`, { method: req.method, headers, body: req.method === "POST" ? Buffer.concat(chunks) : undefined }));
      res.statusCode = response.status;
      response.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(Buffer.from(await response.arrayBuffer()));
    });
  },
};

export default defineConfig({
  plugins: [react(), api, { name: "site-url", transformIndexHtml: html => html.replaceAll("%SITE_URL%", site) }],
  server: { host: true },
});
