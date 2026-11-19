import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/* The site's public address, used by the share preview (WhatsApp etc. need a
   full address for the image). Set SITE_URL on your host, e.g.
   https://hanumanchalisa.example — Vercel and Netlify fill it in by themselves. */
function siteUrl() {
  const raw =
    process.env.SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL && "https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
    process.env.URL || // Netlify
    "";
  return raw.replace(/\/+$/, "");
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: "site-url",
      transformIndexHtml: (html) => html.replaceAll("%SITE_URL%", siteUrl()),
    },
  ],
  server: { port: 5190, strictPort: true, host: true },
});
