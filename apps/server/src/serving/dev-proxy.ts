import type { DevAssets } from "@screen-contract/api";
import { ConflictError } from "@screen-contract/app";
import { embedToken } from "./web-token-embed.js";

/**
 * 開発時の画面配信。
 *
 * **同一 origin を崩さない。** 認可は Origin と Host を自分の待受ポートに限り
 * (context/infrastructure.md)、トークンも server が配信する HTML にしか埋め込ま
 * ない。Vite の origin から開いた画面は一切動かない。
 *
 * したがって **server が Vite の前に立つ**。画面は server の origin から配られ、
 * 中身だけを Vite から取る。HMR の WebSocket だけは Vite へ直に繋ぐ
 * (`apps/web/vite.config.ts` の `server.hmr`) — 中継すると `/stream` と口が競合
 * する。
 */
export interface DevProxyOptions {
  /** Vite dev server の origin。 */
  readonly target: string;
  readonly token: string;
}

export function createDevProxy(options: DevProxyOptions): DevAssets {
  async function upstream(path: string, init?: RequestInit): Promise<Response> {
    try {
      return await fetch(new URL(path, options.target), init);
    } catch {
      // 立ち上がる前に開かれることがある。原因を出す。
      throw new ConflictError(
        "Vite dev server へ繋げません (`pnpm dev` が動いているか確かめてください)",
      );
    }
  }

  return {
    async shell(authorized: boolean): Promise<string> {
      const html = await (await upstream("/")).text();
      // ブラウザは runtime.json を読めない。配信する HTML が唯一の経路である。
      return authorized ? embedToken(html, options.token) : html;
    },

    asset: async (c) => {
      const url = new URL(c.req.url);
      const response = await upstream(url.pathname + url.search, {
        headers: c.req.raw.headers,
      });
      // 本文をそのまま流す。content-type と cache 制御は Vite の判断に従う。
      return new Response(response.body, { status: response.status, headers: response.headers });
    },
  };
}
