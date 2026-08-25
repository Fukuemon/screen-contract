import type {
  StorageState,
  BoundingBox,
  BrowserAction,
  BrowserSession,
  ObservedElement,
  Screenshot,
  StreamHandle,
} from "@screen-contract/core-execution";
import { AgentBrowserError } from "./error.js";
import type { Snapshot } from "@screen-contract/domain";
import { runCli, type CliOptions, type CliResponse } from "./cli.js";

/**
 * agent-browser のセッション 1 つを Port の形へ写す。
 *
 * CLI の呼び出し形式と `--json` のパースは本 adapter に閉じ、Port は型付き結果
 * のみ返す (execution feature の Browser Port の契約)。
 */

/** 応答の失敗が不応答かどうかを見分ける。生存確認では検出できない壊れ方である。 */
const UNRESPONSIVE = /timed out|Resource temporarily unavailable|unresponsive/i;

function toAgentBrowserError(response: CliResponse, what: string): AgentBrowserError {
  const reason = response.error ?? "";
  if (UNRESPONSIVE.test(reason)) {
    // **黙ってセッションを作り直さない。** 再作成はページ状態を失う操作であり、
    // 呼び出し側が同一セッションでの再実行を前提にしていると静かに壊れる。
    // 再作成の可否は core/execution が決める。
    return new AgentBrowserError("browser/unresponsive", `${what}が応答しません`);
  }
  return new AgentBrowserError("browser/unresponsive", `${what}に失敗しました`);
}

function requireSuccess(response: CliResponse, what: string): unknown {
  if (!response.success) {
    throw toAgentBrowserError(response, what);
  }
  return response.data;
}

function readRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new AgentBrowserError("browser/unresponsive", `${what}の応答の形が想定と違います`);
  }
  return value as Record<string, unknown>;
}

function readBox(value: unknown): BoundingBox | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const { x, y, width, height } = value as Record<string, unknown>;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number"
  ) {
    return undefined;
  }
  return { x, y, width, height };
}

/** 注釈スクリーンショットの応答から box 付き要素一覧を取り出す。 */
export function readObservedElements(data: unknown): readonly ObservedElement[] {
  const record = readRecord(data, "要素一覧の取得");
  const annotations = record["annotations"];
  if (!Array.isArray(annotations)) {
    throw new AgentBrowserError(
      "browser/unresponsive",
      "要素一覧の応答に annotations がありません",
    );
  }
  const elements: ObservedElement[] = [];
  for (const entry of annotations) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const { role, name, box } = entry as Record<string, unknown>;
    const parsedBox = readBox(box);
    // role と name が無い要素は Semantic Locator へ解決できない。座標解決の
    // 入力にならないため落とす。
    if (typeof role !== "string" || typeof name !== "string" || parsedBox === undefined) {
      continue;
    }
    elements.push({ role, name, box: parsedBox });
  }
  return elements;
}

function actionArgs(action: BrowserAction): readonly string[] {
  switch (action.kind) {
    case "open":
      return ["open", action.url];
    case "click":
      // Semantic Locator で解決する。一時的な要素参照は撮影ごとに振り直される
      // ため、DSL にも実行履歴にも持ち越せない。
      return ["find", "role", action.locator.role, "click", "--name", action.locator.name];
  }
}

export function createSession(options: CliOptions, discardPath: string): BrowserSession {
  const call = async (args: readonly string[], what: string): Promise<unknown> =>
    requireSuccess(await runCli(options, args), what);

  return {
    async perform(action: BrowserAction): Promise<void> {
      await call(actionArgs(action), "操作の実行");
    },

    async snapshot(): Promise<Snapshot> {
      await call(["snapshot"], "Snapshot の取得");
      // 生データの解釈は core/element が担う。ここでは撮影時点だけを渡す。
      return { capturedAt: new Date().toISOString() };
    },

    async screenshot(): Promise<Screenshot> {
      const data = readRecord(
        await call(["screenshot", discardPath], "スクリーンショットの取得"),
        "スクリーンショットの取得",
      );
      const path = data["path"];
      if (typeof path !== "string") {
        throw new AgentBrowserError(
          "browser/unresponsive",
          "スクリーンショットの応答に path がありません",
        );
      }
      const { readFile } = await import("node:fs/promises");
      return { bytes: new Uint8Array(await readFile(path)) };
    },

    async observeElements(): Promise<readonly ObservedElement[]> {
      // box は Accessibility Snapshot の応答に含まれない。注釈スクリーンショット
      // の応答から得る。**生成された注釈済み画像は保存せず捨てる。** 残すと
      // 成果物の注釈画像と紛らわしく、差分検知の対象を誤らせる。
      return readObservedElements(
        await call(["--annotate", "screenshot", discardPath], "要素一覧の取得"),
      );
    },

    async currentUrl(): Promise<string> {
      const data = readRecord(await call(["get", "url"], "現在 URL の取得"), "現在 URL の取得");
      const url = data["url"] ?? data["result"];
      if (typeof url !== "string") {
        throw new AgentBrowserError("browser/unresponsive", "現在 URL の応答の形が想定と違います");
      }
      return url;
    },

    async setViewport(size): Promise<void> {
      await call(["set", "viewport", String(size.width), String(size.height)], "viewport の変更");
    },

    async captureStorageState(): Promise<StorageState> {
      const cookies = readRecord(
        await call(["cookies", "get"], "認証状態の取得"),
        "認証状態の取得",
      );
      const storage = readRecord(
        await call(["storage", "local"], "認証状態の取得"),
        "認証状態の取得",
      );
      return {
        cookies: Array.isArray(cookies["cookies"]) ? cookies["cookies"] : [],
        // `storage local` は `data` の下に入れて返す (実測)。
        localStorage:
          typeof storage["data"] === "object" && storage["data"] !== null
            ? (storage["data"] as Record<string, unknown>)
            : {},
      };
    },

    async restoreStorageState(state): Promise<void> {
      // **注入してから対象を開く。** 開いた後に入れても、既に描画された画面は
      // 未ログインのままである。
      if (state.cookies.length > 0) {
        await call(["cookies", "set", JSON.stringify(state.cookies)], "認証状態の注入");
      }
      for (const [key, value] of Object.entries(state.localStorage)) {
        await call(["storage", "local", "set", key, JSON.stringify(value)], "認証状態の注入");
      }
    },

    async consoleMessages(): Promise<readonly unknown[]> {
      const data = readRecord(await call(["console"], "コンソールの取得"), "コンソールの取得");
      return Array.isArray(data["messages"]) ? data["messages"] : [];
    },

    async stream(): Promise<StreamHandle> {
      const data = readRecord(
        await call(["stream", "status"], "配信ハンドルの取得"),
        "配信ハンドルの取得",
      );
      const port = data["port"];
      if (typeof port !== "number") {
        throw new AgentBrowserError(
          "browser/unresponsive",
          "配信ハンドルの応答に port がありません",
        );
      }
      return { endpoint: `ws://127.0.0.1:${String(port)}` };
    },

    async keepalive(): Promise<void> {
      // 軽い問い合わせで daemon のアイドル計測を進ませない。一時停止中も
      // セッションを生存させるための呼び出しである。
      await call(["session"], "セッションの生存確認");
    },

    async close(): Promise<void> {
      // 回収するのはセッションまでで、daemon は落とさない。daemon は他の
      // 利用とも共有される資源である (ADR-0027)。
      await call(["close"], "セッションの終了");
    },
  };
}
