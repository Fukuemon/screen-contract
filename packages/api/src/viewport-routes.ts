import type { Hono } from "hono";
import type { ViewportControl } from "@screen-contract/app";
import { isValidViewport, parseElementId } from "@screen-contract/app";

/**
 * live viewport の endpoint。
 *
 * **接続で run を 1 本起こし、pause 予約を付けて走らせる。** 1 ステップ (entry
 * への `open`) を終えた時点で `paused` に入り、そこから操作と記録ができる
 * (ADR-0002 / ADR-0026)。
 *
 * 外部入力は必ず parse を通す。branded type は実行時の保証を持たないため、型
 * アサーションで持ち上げると未検証の文字列が保存先のパス組み立てまで届く。
 */
export function registerViewportRoutes(app: Hono, viewport: ViewportControl): void {
  app.get("/viewport", (c) => c.json(viewport.snapshot()));
  app.post("/viewport/start", async (c) => {
    // 本文なしの POST も受ける。開く先の指定は任意である。
    const { url } = (await c.req.json().catch(() => ({}))) as { url?: unknown };
    if (url !== undefined && typeof url !== "string") {
      return c.json({ error: "bad-request" }, 400);
    }
    return c.json(await viewport.start(url));
  });
  app.post("/viewport/resume", async (c) => c.json(await viewport.resume()));
  app.post("/viewport/stop", (c) => c.json(viewport.stop()));
  // 記録した手順を最初から実行する。記録と同じ経路を通す (ADR-0026)。
  app.post("/viewport/replay", async (c) => c.json(await viewport.replay()));
  // 下書きを保存して承認へ回す。**正本へ直接書かない** (ADR-0017)。
  app.post("/viewport/submit", async (c) => c.json(await viewport.submit()));
  app.post("/viewport/mode", async (c) => {
    const { mode } = (await c.req.json()) as { mode?: unknown };
    if (mode !== "view" && mode !== "operate") {
      return c.json({ error: "bad-request" }, 400);
    }
    return c.json(viewport.setMode(mode));
  });
  app.post("/viewport/navigate", async (c) => {
    const { url } = (await c.req.json()) as { url?: unknown };
    if (typeof url !== "string") {
      return c.json({ error: "bad-request" }, 400);
    }
    return c.json(await viewport.navigate(url));
  });

  app.post("/viewport/size", async (c) => {
    const { width, height } = (await c.req.json()) as { width?: unknown; height?: unknown };
    // 型だけでは足りない。0 や桁外れをそのまま実行基盤へ渡すと、原因の
    // 分からない失敗になる。**client 側の検証を規則にしない。**
    if (typeof width !== "number" || typeof height !== "number") {
      return c.json({ error: "bad-request" }, 400);
    }
    if (!isValidViewport({ width, height })) {
      return c.json({ error: "bad-request" }, 400);
    }
    return c.json(await viewport.setViewport({ width, height }));
  });

  app.post("/viewport/resolve", async (c) => {
    const { x, y } = (await c.req.json()) as { x?: unknown; y?: unknown };
    if (typeof x !== "number" || typeof y !== "number") {
      return c.json({ error: "bad-request" }, 400);
    }
    const picked = await viewport.resolveAt({ x, y });
    return picked === undefined ? c.json({ picked: null }) : c.json({ picked });
  });

  app.get("/viewport/elements", async (c) =>
    c.json({ elements: await viewport.observeElements() }),
  );

  app.get("/viewport/console", async (c) => c.json({ messages: await viewport.consoleMessages() }));

  app.post("/viewport/badges", async (c) => {
    const { role, name } = (await c.req.json()) as { role?: unknown; name?: unknown };
    if (typeof role !== "string" || typeof name !== "string") {
      return c.json({ error: "bad-request" }, 400);
    }
    return c.json(viewport.addBadge({ role, name }));
  });

  // 外部入力は必ず parse を通す。いまは組み立てに使わなくても、要素 ID は
  // badges と ref を通じて正本と成果物のファイル名側へ流れる識別子である。
  app.delete("/viewport/badges/:id", (c) =>
    c.json(viewport.removeBadge(parseElementId(c.req.param("id")))),
  );

  app.post("/viewport/badges/:id/move", async (c) => {
    const { to } = (await c.req.json()) as { to?: unknown };
    if (typeof to !== "number" || !Number.isInteger(to)) {
      return c.json({ error: "bad-request" }, 400);
    }
    return c.json(viewport.moveBadge(parseElementId(c.req.param("id")), to));
  });

  app.get("/viewport/origins", (c) => c.json({ origins: viewport.allowedOrigins() }));

  app.post("/viewport/origins", async (c) => {
    const { origin } = (await c.req.json()) as { origin?: unknown };
    if (typeof origin !== "string") {
      return c.json({ error: "bad-request" }, 400);
    }
    return c.json({ origins: viewport.addAllowedOrigin(origin) });
  });

  // 一覧・いま使っているもの・取り込みの世代を 1 つの形で返す。世代は
  // Baseline の識別に入る (ADR-0022)。
  app.get("/auth/profiles", (c) => c.json(viewport.listAuthProfiles()));

  app.post("/auth/profiles", async (c) => {
    const { name } = (await c.req.json()) as { name?: unknown };
    if (typeof name !== "string") {
      return c.json({ error: "bad-request" }, 400);
    }
    return c.json(await viewport.saveAuthProfile(name));
  });

  app.post("/auth/use", async (c) => {
    const { name } = (await c.req.json()) as { name?: unknown };
    if (name !== undefined && name !== null && typeof name !== "string") {
      return c.json({ error: "bad-request" }, 400);
    }
    return c.json(await viewport.useAuthProfile(name ?? undefined));
  });

  app.delete("/auth/profiles/:name", (c) =>
    c.json(viewport.removeAuthProfile(c.req.param("name"))),
  );

  // 記録は追記しかしない。捨てる口が無いと、やり直しに server の再起動が要る。
  app.delete("/viewport/recording", (c) => c.json(viewport.clearSteps()));

  app.post("/viewport/recording", async (c) => {
    const { recording } = (await c.req.json()) as { recording?: unknown };
    if (typeof recording !== "boolean") {
      return c.json({ error: "bad-request" }, 400);
    }
    return c.json(viewport.setRecording(recording));
  });
}
