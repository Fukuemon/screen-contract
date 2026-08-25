import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { UseCases, ViewportControl } from "@screen-contract/app";
import { isConflictError, isExecutionFailure, isValidationError } from "@screen-contract/app";
import { bootCookie, BOOT_QUERY, checkBootTicket } from "./boot-ticket.js";
import { registerViewportRoutes } from "./viewport-routes.js";
import { registerWorkflowRoutes } from "./workflow-routes.js";
import {
  isAllowedHost,
  isAllowedOrigin,
  rejectRequest,
  type AuthPolicy,
  type AuthRejection,
} from "./auth.js";

/**
 * HTTP の公開面。
 *
 * **listen しない。** アプリケーションを組み立てて返すだけで、プロセスにするのは
 * 合成ルートである (ADR-0023 / ADR-0024)。認可は Hono のミドルウェアとして
 * interface 層に閉じる (ADR-0021)。
 */

const STATUS: Readonly<Record<AuthRejection, 401 | 403>> = {
  "missing-token": 401,
  "bad-token": 401,
  "bad-origin": 403,
  "bad-host": 403,
};

export interface HttpAppOptions {
  readonly useCases: UseCases;
  /**
   * 待受ポートとトークン。listen したあとでなければ決まらないため、
   * 合成ルートが後から差し込めるように関数で受ける。
   */
  readonly policy: () => AuthPolicy | undefined;
  /**
   * Stream Proxy の WebSocket を結線する。合成ルートが adapter を選ぶ
   * (ADR-0023)。渡さないと `/stream` は 404 になる。
   */
  readonly stream?: MiddlewareHandler | undefined;
  /**
   * Web UI の配信。
   *
   * **api はファイルを読まない。** 読み込みと埋め込みは合成ルートが渡す
   * (`packages/api` は Node のファイルシステムに依存しない)。
   */
  readonly web?: WebAssets | undefined;
  /**
   * live viewport の run。
   *
   * **操作モードと記録は `paused` の run の枠内でしか使えない** (ADR-0002)。
   * 渡さないと `/viewport` 系の endpoint を生やさない。
   */
  readonly viewport?: ViewportControl | undefined;
}

export interface WebAssets {
  /** 配信する HTML。トークンは埋め込み済みで受け取る。 */
  /**
   * 配信する HTML。
   *
   * @param authorized - 起動チケットを持つ相手か。**持たない相手へトークンを
   *   埋め込まない** — 埋め込むと、ループバックへ繋げる任意プロセスが `curl`
   *   1 本でトークンを取れる (context/infrastructure.md)。
   */
  shell(authorized: boolean): string;
  /** HTML 以外の資材。無ければ undefined。 */
  asset(path: string): { readonly body: Uint8Array; readonly contentType: string } | undefined;
}

export function createHttpApp(options: HttpAppOptions): Hono {
  const app = new Hono();

  /**
   * ブラウザが直接叩く経路。**トークンを要求しない。**
   *
   * `/` はトークンを埋め込んだ HTML を返す唯一の経路であり、ここで要求すると
   * 鶏と卵になる。WebSocket は任意のヘッダを付けられないため、認証は最初の
   * フレームで行う (context/infrastructure.md)。守るのは Origin と Host である。
   *
   * **`*` のミドルウェアより先に登録する。** 後にすると `*` がトークンを
   * 要求し、いずれも必ず 401 になる。
   */
  const browserFacing: MiddlewareHandler = async (c, next) => {
    const policy = options.policy();
    if (policy === undefined) {
      return c.json({ error: "unavailable" }, 503);
    }
    if (
      !isAllowedHost(c.req.header("host"), policy) ||
      !isAllowedOrigin(c.req.header("origin"), policy)
    ) {
      return c.json({ error: "forbidden" }, 403);
    }
    await next();
    return undefined;
  };

  if (options.stream !== undefined) {
    app.use("/stream", browserFacing);
    app.get("/stream", options.stream);
  }

  if (options.web !== undefined) {
    const web = options.web;
    app.use("/", browserFacing);
    app.use("/assets/*", browserFacing);
    /**
     * 画面の配信。
     *
     * **起動チケットを見る。** `GET /` はトークンを埋め込んだ画面を返す唯一の
     * 経路であり、無条件に開けると同一マシンの任意プロセスがトークンを取れる。
     * チケットは query で 1 度受け取り、cookie へ移す。
     */
    app.get("/", (c) => {
      const policy = options.policy();
      if (policy === undefined) {
        return c.json({ error: "unavailable" }, 503);
      }
      const outcome = checkBootTicket(
        { query: c.req.query(BOOT_QUERY), cookie: c.req.header("cookie") },
        policy.bootKey,
      );
      if (outcome.kind === "issue") {
        c.header("set-cookie", bootCookie(policy.bootKey));
      }
      return c.html(web.shell(outcome.kind !== "denied"));
    });
    app.get("/assets/*", (c) => {
      const asset = web.asset(c.req.path);
      return asset === undefined
        ? c.notFound()
        : c.body(asset.body as never, 200, { "content-type": asset.contentType });
    });
  }

  app.use("*", async (c, next) => {
    const policy = options.policy();
    if (policy === undefined) {
      // listen 前に届いたリクエストは通さない。ポートが決まる前は Origin も
      // Host も検査できず、検査を飛ばして通すことになる。
      return c.json({ error: "unavailable" }, 503);
    }
    const rejection = rejectRequest(
      {
        // RFC 7235 のスキーム名は大小を区別しない。区別すると原因の分からない 401 になる。
        token: c.req.header("authorization")?.replace(/^Bearer\s+/i, ""),
        origin: c.req.header("origin"),
        host: c.req.header("host"),
      },
      policy,
    );
    if (rejection !== undefined) {
      return c.json({ error: "forbidden" }, STATUS[rejection]);
    }
    await next();
    return undefined;
  });

  // 外部入力は必ず parse を通す。branded type は実行時の保証を持たないため、
  // 型アサーションで持ち上げると未検証の文字列が保存先のパス組み立てまで届く。
  // live viewport の run。**接続で 1 本起こし、pause 予約を付けて走らせる。**
  // 1 ステップ (entry への open) を終えた時点で paused に入り、そこから操作と
  // 記録ができる (ADR-0002 / ADR-0026)。
  if (options.viewport !== undefined) {
    registerViewportRoutes(app, options.viewport);
  }

  registerWorkflowRoutes(app, options.useCases);

  /**
   * 失敗を 3 つに分ける。
   *
   * **応答へ例外の中身を出さない。** 検証の失敗メッセージには規則が載るが、
   * 想定外の失敗にはパスや secret が載りうる。詳細は server 側にだけ残す。
   *
   * **名前ではなく構造で判定する** (`isValidationError` / `isConflictError`)。
   * クラス名の列挙にすると、`name` を上書きしたクラスを足すたびに分類から漏れ、
   * 逆に素の `Error` を入れると server の状態異常まで 400 として返る。
   */
  app.onError((error, c) => {
    if (isValidationError(error)) {
      return c.json({ error: "bad-request" }, 400);
    }
    if (isConflictError(error)) {
      // 入力は正しいが、いまの状態では実行できない。400 と混ぜると
      // 「入力を直せば通る」と読めてしまう。
      return c.json({ error: "conflict" }, 409);
    }
    if (isExecutionFailure(error)) {
      // 対象ブラウザ側の失敗。**server の障害ではない。** 500 にすると、
      // 開けない URL を指しただけで「壊れた」と読まれる。
      return c.json({ error: "browser-failed" }, 409);
    }
    // 障害の一次観測点は標準出力である (context/infrastructure.md)。
    console.error("[api] 想定外の失敗", error.name);
    return c.json({ error: "internal" }, 500);
  });

  return app;
}
