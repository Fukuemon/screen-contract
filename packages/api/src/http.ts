import { Hono } from "hono";
import type { UseCases } from "@screen-contract/app";
import { parseStartRunInput, parseStoreKey } from "@screen-contract/app";
import { rejectRequest, type AuthPolicy, type AuthRejection } from "./auth.js";

/**
 * HTTP の公開面。
 *
 * **listen しない。** アプリケーションを組み立てて返すだけで、プロセスにするのは
 * 合成ルートである (ADR-0023 / ADR-0024)。認可は Hono のミドルウェアとして
 * interface 層に閉じる (ADR-0021)。
 */

/** 拒否の理由を応答へそのまま出さない。攻撃者へどこで落ちたかを教える。 */
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
}

export function createHttpApp(options: HttpAppOptions): Hono {
  const app = new Hono();

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
  app.post("/runs", async (c) => {
    await options.useCases.startRun(parseStartRunInput(await c.req.json()));
    return c.json({ ok: true }, 202);
  });

  app.put("/drafts/:key{.+}", async (c) => {
    const revision = await options.useCases.saveDraft(
      parseStoreKey(c.req.param("key")),
      await c.req.text(),
    );
    return c.json({ revision });
  });

  app.post("/approvals", async (c) => {
    const { key } = (await c.req.json()) as { key?: unknown };
    if (typeof key !== "string") {
      return c.json({ error: "bad-request" }, 400);
    }
    return c.json(await options.useCases.requestApproval(parseStoreKey(key)));
  });

  app.get("/approvals", (c) => c.json(options.useCases.listPendingApprovals()));

  app.post("/approvals/:id/approve", async (c) => {
    const result = await options.useCases.approve(c.req.param("id"));
    // not-found と stale を同じ status にしない。呼び出し側が区別できず、
    // UI が誤った案内をする。
    const status = result.kind === "approved" ? 200 : result.kind === "not-found" ? 404 : 409;
    return c.json(result, status);
  });

  // 検証由来の失敗と想定外の失敗を分ける。すべて 400 にすると、client の
  // 誤りと server の障害を呼び出し側が区別できない。
  //
  // **応答へ例外の中身を出さない。** 検証の失敗メッセージには規則が載るが、
  // 想定外の失敗にはパスや secret が載りうる。詳細は server 側にだけ残す。
  app.onError((error, c) => {
    if (error instanceof SyntaxError || error.name === "Error") {
      return c.json({ error: "bad-request" }, 400);
    }
    // 障害の一次観測点は標準出力である (context/infrastructure.md)。
    console.error("[api] 想定外の失敗", error.name);
    return c.json({ error: "internal" }, 500);
  });

  return app;
}
