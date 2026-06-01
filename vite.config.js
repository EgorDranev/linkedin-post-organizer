import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// On Vercel (and with `vercel dev`), /api/* is served by the serverless
// functions in /api — no dev proxy needed. The frontend uses relative
// /api paths, so it behaves the same locally and in production.
export default defineConfig({
  plugins: [react()],
});
