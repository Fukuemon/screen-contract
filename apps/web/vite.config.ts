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
/** dev server の待受。**固定する** — Workflow Server が前に立つため相手が決まる。 */
const DEV_PORT = 5175;

export default defineConfig({
  plugins: [tailwindcss(), tanstackStart({ spa: { enabled: true } }), viteReact()],
  server: {
    host: "127.0.0.1",
    port: DEV_PORT,
    // 使えなければ止まる。黙って別のポートへ逃げると、前に立つ server の
    // 向き先とずれる。
    strictPort: true,
    /**
     * HMR は Vite へ直に繋ぐ。
     *
     * **中継しない。** Workflow Server の `/stream` と口が競合するうえ、
     * WebSocket の中継は認可の掛け所を増やす。画面の配信だけを前に立てる。
     */
    hmr: { protocol: "ws", host: "127.0.0.1", port: DEV_PORT },
  },
});
