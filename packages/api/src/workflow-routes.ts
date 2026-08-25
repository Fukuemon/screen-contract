import type { Hono } from "hono";
import type { UseCases } from "@screen-contract/app";
import { parseStartRunInput, parseStoreKey } from "@screen-contract/app";

/**
 * run の開始と、draft / 正本 / 承認の endpoint。
 *
 * 外部入力は必ず parse を通す。branded type は実行時の保証を持たないため、型
 * アサーションで持ち上げると `{name:"../../.ssh/id_rsa"}` がそのまま保存先の
 * パス組み立てまで届く。
 */
export function registerWorkflowRoutes(app: Hono, useCases: UseCases): void {
  app.post("/runs", async (c) => {
    await useCases.startRun(parseStartRunInput(await c.req.json()));
    return c.json({ ok: true }, 202);
  });

  app.put("/drafts/:key{.+}", async (c) => {
    const revision = await useCases.saveDraft(
      parseStoreKey(c.req.param("key")),
      await c.req.text(),
    );
    return c.json({ revision });
  });

  // 差分表示に要る。**承認の前に対象の差分を必ず表示する** (ADR-0017) ため、
  // draft と正本の両方を読めるようにする。
  app.get("/drafts/:key{.+}", async (c) => {
    const content = await useCases.loadDraft(parseStoreKey(c.req.param("key")));
    return content === undefined ? c.text("", 404) : c.text(content);
  });

  app.get("/authoritative/:key{.+}", async (c) => {
    const content = await useCases.loadAuthoritative(parseStoreKey(c.req.param("key")));
    // 正本がまだ無い状態は「空からの差分」である。404 にしない。
    return c.text(content ?? "");
  });

  app.post("/approvals", async (c) => {
    const { key } = (await c.req.json()) as { key?: unknown };
    if (typeof key !== "string") {
      return c.json({ error: "bad-request" }, 400);
    }
    return c.json(await useCases.requestApproval(parseStoreKey(key)));
  });

  app.get("/approvals", (c) => c.json(useCases.listPendingApprovals()));

  app.post("/approvals/:id/approve", async (c) => {
    const result = await useCases.approve(c.req.param("id"));
    // not-found と stale を同じ status にしない。呼び出し側が区別できず、
    // UI が誤った案内をする。
    const status = result.kind === "approved" ? 200 : result.kind === "not-found" ? 404 : 409;
    return c.json(result, status);
  });
}
