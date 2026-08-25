import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * SPA として組む。
 *
 * **server 機能は使わない。** API ロジックを置くのは Workflow Server (api 層)
 * だけである (context/architecture.md の Runtime Boundary)。
 */
export default defineConfig({
  plugins: [tailwindcss(), tanstackStart({ spa: { enabled: true } }), viteReact()],
});
