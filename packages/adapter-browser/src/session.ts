import type {
  ConsoleMessage,
  SemanticLocator,
  StorageRestoreReport,
  StorageState,
  BoundingBox,
  BrowserAction,
  BrowserSession,
  ObservedElement,
  Screenshot,
} from "@screen-contract/core-execution";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { AgentBrowserError } from "./error.js";
import { connectStream, type StreamClient } from "./stream.js";
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

function actionArgs(action: BrowserAction): readonly string[] | undefined {
  switch (action.kind) {
    case "open":
      return ["open", action.url];
    case "click":
      // Semantic Locator で解決する。一時的な要素参照は撮影ごとに振り直される
      // ため、DSL にも実行履歴にも持ち越せない。
      return ["find", "role", action.locator.role, "click", "--name", action.locator.name];
    case "fill":
      // 値を argv へ載せられないため、CLI 1 本では書けない。
      return undefined;
  }
}

/** 入力の反映を待つ回数と間隔。待ち切れなければ失敗させる。 */
const VALUE_ATTEMPTS = 20;
const VALUE_INTERVAL_MS = 100;

/** 配信の接続先を持つ、Port へ出す前のセッション。 */
export type RawSession = Omit<BrowserSession, "connect" | "restoreReport"> & {
  streamEndpoint(): Promise<string>;
};

/** box をまとめて引くときの同時実行数。1 件ずつ待つと要素数に比例して伸びる。 */
const BOX_CONCURRENCY = 32;

export function createSession(options: CliOptions, discardPath: string): RawSession {
  /**
   * 文字を送るための配信への接続。
   *
   * **argv を通さずに文字を渡す唯一の経路である。** 使うまで開かない — 開くと
   * 使わないセッションでも socket を 1 本掴む。
   */
  let typingRelay: StreamClient | undefined;
  const call = async (args: readonly string[], what: string): Promise<unknown> =>
    requireSuccess(await runCli(options, args), what);

  async function streamEndpoint(): Promise<string> {
    const data = readRecord(
      await call(["stream", "status"], "配信ハンドルの取得"),
      "配信ハンドルの取得",
    );
    const port = data["port"];
    if (typeof port !== "number") {
      throw new AgentBrowserError("browser/unresponsive", "配信ハンドルの応答に port がありません");
    }
    return `ws://127.0.0.1:${String(port)}`;
  }

  async function typing(): Promise<StreamClient> {
    typingRelay ??= connectStream({ endpoint: await streamEndpoint(), onFrame: () => undefined });
    // 開くのを待つ。待たずに送ると「配信への接続が開いていません」で落ちる。
    await typingRelay.ready();
    return typingRelay;
  }

  /**
   * 入力欄を埋める。
   *
   * **値を argv へ載せない。** argv は同一利用者の任意プロセスから `ps` で
   * 読め、Linux では `/proc/<pid>/cmdline` が他利用者にも見える。資格情報が
   * 入りうるため、`fill <selector> <text>` は使えない
   * (context/infrastructure.md)。
   *
   * 代わりに「クリックで焦点を当てる → 全選択 → 配信ソケットで文字を送る」で
   * 埋める。焦点と全選択は argv でよい (秘密を含まない)。
   */
  async function fill(locator: SemanticLocator, value: string): Promise<void> {
    // **空文字で埋めて消す。** 全選択のキーは環境で意味が変わり、効かないと
    // 既存の値へ追記されて入力が二重になる (実際にそうなった)。空文字は秘密では
    // ないため argv でよく、焦点も残る (実測)。
    await call(["find", "role", locator.role, "fill", "--name", locator.name, ""], "入力欄の消去");
    await settleValue(locator, 0);
    const relay = await typing();
    for (const character of value) {
      relay.send({
        kind: "key",
        phase: "text",
        text: character,
        modifiers: { alt: false, ctrl: false, meta: false, shift: false },
      });
    }
    await settleValue(locator, value.length);
  }

  /**
   * 入力が反映されるまで待つ。
   *
   * 文字は配信ソケットへ投げるだけで、届いたかどうかは返らない。待たずに次へ
   * 進むと、**入力される前に送信ボタンを押す**。
   *
   * **長さだけを見る。** 値そのものを比べる必要は無く、比べると秘密の扱いが
   * 増えるだけである。
   */
  async function settleValue(locator: SemanticLocator, length: number): Promise<void> {
    for (let attempt = 0; attempt < VALUE_ATTEMPTS; attempt += 1) {
      const ref = await refFor(locator);
      if (ref !== undefined) {
        const data = readRecord(
          await call(["get", "value", `@${ref}`], "入力値の確認"),
          "入力値の確認",
        );
        const current = data["value"];
        if (typeof current === "string" && current.length === length) {
          return;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, VALUE_INTERVAL_MS));
    }
    // 待ち切れないことを黙らせない。次の手順は入力前の画面で動くことになる。
    throw new AgentBrowserError("browser/unresponsive", "入力が反映されません");
  }

  /** Locator に対応する一時的な要素参照。`snapshot` ごとに振り直される。 */
  async function refFor(locator: SemanticLocator): Promise<string | undefined> {
    const data = readRecord(await call(["snapshot"], "要素の取得"), "要素の取得");
    const refs = data["refs"];
    if (typeof refs !== "object" || refs === null) {
      return undefined;
    }
    for (const [ref, value] of Object.entries(refs as Record<string, unknown>)) {
      const entry = (typeof value === "object" && value !== null ? value : {}) as Record<
        string,
        unknown
      >;
      if (entry["role"] === locator.role && entry["name"] === locator.name) {
        return ref;
      }
    }
    return undefined;
  }

  return {
    async perform(action: BrowserAction): Promise<void> {
      const args = actionArgs(action);
      if (action.kind === "fill") {
        // 値を argv へ載せられないため、別経路で埋める。
        await fill(action.locator, action.value);
        return;
      }
      if (args === undefined) {
        throw new AgentBrowserError("browser/unresponsive", "扱えない操作です");
      }
      await call(args, "操作の実行");
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

    /**
     * box 付きの要素一覧。
     *
     * **注釈スクリーンショットを使わない。** `--annotate` は box を返す代わりに
     * **対象ページへ赤い枠と番号を描き込む** (agent-browser 0.34.0 で実測)。
     * その描画は配信の映像に映り、直後のクリックとも競合する。
     *
     * 代わりに `snapshot` で ref を取り、`get box` で 1 件ずつ引く。実測で
     * 518 要素 892ms (`--annotate` は 314ms) だが、描き込まない。
     */
    async observeElements(): Promise<readonly ObservedElement[]> {
      const data = readRecord(await call(["snapshot"], "要素一覧の取得"), "要素一覧の取得");
      const refs = data["refs"];
      if (typeof refs !== "object" || refs === null) {
        return [];
      }
      const entries = Object.entries(refs as Record<string, unknown>).flatMap(([ref, value]) => {
        const entry = (typeof value === "object" && value !== null ? value : {}) as Record<
          string,
          unknown
        >;
        return typeof entry["role"] === "string" && typeof entry["name"] === "string"
          ? [{ ref, role: entry["role"], name: entry["name"] }]
          : [];
      });

      const observed: ObservedElement[] = [];
      // まとめて投げる。1 件ずつ待つと要素数に比例して線形に伸びる。
      for (let at = 0; at < entries.length; at += BOX_CONCURRENCY) {
        const chunk = entries.slice(at, at + BOX_CONCURRENCY);
        const boxes = await Promise.all(
          chunk.map(async (entry) => {
            try {
              return readRecord(
                await call(["get", "box", `@${entry.ref}`], "要素の位置の取得"),
                "要素の位置の取得",
              );
            } catch {
              // 1 件取れないだけで一覧を落とさない。画面から消えた要素は
              // ref が無効になる。
              return undefined;
            }
          }),
        );
        for (const [index, raw] of boxes.entries()) {
          const entry = chunk[index];
          const box = readBox(raw);
          if (entry === undefined || box === undefined) {
            continue;
          }
          observed.push({ role: entry.role, name: entry.name, box });
        }
      }
      return observed;
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

    /**
     * 認証状態を注入する。開いた後に入れても、既に描画された画面は未ログインの
     * ままなので、必ず対象を開く前に呼ぶ。
     *
     * **値を argv へ載せない。** argv は同一利用者の任意プロセスから `ps` で
     * 読め、Linux では `/proc/<pid>/cmdline` が他利用者にも見える。暗号化して
     * 保管した意味が注入の 1 ホップで消える。cookie は 0600 の一時ファイル経由。
     *
     * **Web Storage は入れない。** `storage local set <key> <value>` は値を
     * argv で受ける口しか持たず、`@file` も `-` も文字列として保存される
     * (agent-browser 0.34.0 で実測)。JWT やリフレッシュトークンを localStorage
     * へ置く対象は珍しくないため、通すと資格情報そのものが argv に載る。
     * 入らなかったことは戻り値で返し、黙って落とさない。
     */
    async restoreStorageState(state): Promise<StorageRestoreReport> {
      if (state.cookies.length > 0) {
        const file = join(mkdtempSync(join(tmpdir(), "sc-auth-")), "cookies.json");
        writeFileSync(file, JSON.stringify(state.cookies), { encoding: "utf8", mode: 0o600 });
        try {
          await call(["cookies", "set", "--curl", file], "認証状態の注入");
        } finally {
          rmSync(dirname(file), { recursive: true, force: true });
        }
      }
      const skippedKeys = Object.keys(state.localStorage);
      return skippedKeys.length === 0
        ? { skippedKeys: [] }
        : {
            skippedKeys,
            reason:
              "localStorage は復元していません (実行基盤が値を argv でしか受けず、秘密が他プロセスから読めるため)。cookie だけで認証が通らない対象では、手でログインし直してください",
          };
    },

    /**
     * 可視な要素の Locator。
     *
     * **`snapshot` を使う。** `--annotate screenshot` は box を返す代わりに
     * 対象ページへ枠と番号を描き込む (実測)。box が要らない用途で使うと、
     * 描画が配信へ映り、操作の邪魔になる。
     */
    async observeVisible(): Promise<readonly SemanticLocator[]> {
      const data = readRecord(await call(["snapshot"], "要素の取得"), "要素の取得");
      const refs = data["refs"];
      if (typeof refs !== "object" || refs === null) {
        return [];
      }
      const locators: SemanticLocator[] = [];
      for (const value of Object.values(refs as Record<string, unknown>)) {
        const entry = (typeof value === "object" && value !== null ? value : {}) as Record<
          string,
          unknown
        >;
        if (typeof entry["role"] === "string" && typeof entry["name"] === "string") {
          locators.push({ role: entry["role"], name: entry["name"] });
        }
      }
      return locators;
    },

    async consoleMessages(): Promise<readonly ConsoleMessage[]> {
      const data = readRecord(await call(["console"], "コンソールの取得"), "コンソールの取得");
      if (!Array.isArray(data["messages"])) {
        return [];
      }
      // 実行基盤の生の形をここで畳む。畳まないと CDP の語彙が interface 層まで
      // 漏れる (ADR-0013)。
      return data["messages"].map((raw): ConsoleMessage => {
        const message = (typeof raw === "object" && raw !== null ? raw : {}) as Record<
          string,
          unknown
        >;
        const level = message["level"] ?? message["type"];
        const text = message["text"] ?? message["message"];
        return {
          level: typeof level === "string" ? level : "log",
          text: typeof text === "string" ? text : JSON.stringify(raw),
        };
      });
    },

    streamEndpoint,

    async keepalive(): Promise<void> {
      // 軽い問い合わせで daemon のアイドル計測を進ませない。一時停止中も
      // セッションを生存させるための呼び出しである。
      await call(["session"], "セッションの生存確認");
    },

    async close(): Promise<void> {
      // 文字を送るための接続も閉じる。残すと socket が漏れる。
      typingRelay?.close();
      typingRelay = undefined;
      // 回収するのはセッションまでで、daemon は落とさない。daemon は他の
      // 利用とも共有される資源である (ADR-0027)。
      await call(["close"], "セッションの終了");
    },
  };
}
