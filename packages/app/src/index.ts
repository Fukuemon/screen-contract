import {
  authContextKey,
  parseAuthProfileName,
  parseRunId,
  type AuthContext,
  type BrowserPort,
  type RunId,
} from "@screen-contract/core-execution";

/**
 * 保存の鍵。
 *
 * 実装は adapter/store のファイルシステムであり、鍵は run や画面の識別子として
 * 外部入力 (HTTP / JSON-RPC / エージェント) 由来になる。検証していない文字列を
 * そのままパス組み立てへ渡すと、`../` で任意のファイルを上書きできる。
 * 生成経路を parseStoreKey に限ることで、未検証の値を型で弾く。
 */
export type StoreKey = string & { readonly __brand: "StoreKey" };

// 先頭を英数字に縛ることで `.` と `..` のセグメントも同時に弾く。
const STORE_KEY_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function parseStoreKey(raw: string): StoreKey {
  if (!raw.split("/").every((segment) => STORE_KEY_SEGMENT.test(segment))) {
    throw new Error("保存の鍵の規則に合いません (英数字で始まるセグメントを / で連結する)");
  }
  return raw as StoreKey;
}

/**
 * 保存は機能横断のため app が Port を定義する。実装は adapter/store。
 *
 * 実装側は、鍵から組み立てた絶対パスが保存先ディレクトリの配下に収まることを
 * 解決後にもう一度検証する。型は生成経路を縛るだけで、実装の検証を免除しない。
 */
export interface StorePort {
  save(key: StoreKey, value: string): Promise<void>;
}

export interface UseCaseDeps {
  readonly browser: BrowserPort;
  readonly store: StorePort;
}

export interface StartRunInput {
  readonly runId: RunId;
  readonly auth: AuthContext;
}

/**
 * interface 層 (api / agent) が外部入力を use case の入力へ変換する唯一の経路。
 *
 * **interface 層で必ずこれを通す。** branded type は実行時の保証を持たないため、
 * 型アサーションで持ち上げると `{kind:"profile", name:"../../.ssh/id_rsa"}` が
 * そのまま保存先のパス組み立てまで届く。
 *
 * interface 層は core / domain を参照できない (context/architecture.md) ため、
 * AuthContext を自力で組み立てられない。app がこの変換を提供する。
 */
export function parseStartRunInput(raw: unknown): StartRunInput {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("run の開始入力がオブジェクトではありません");
  }
  const { runId, authProfile } = raw as { runId?: unknown; authProfile?: unknown };
  if (typeof runId !== "string") {
    throw new Error("run の開始入力に runId がありません");
  }
  if (authProfile !== undefined && authProfile !== null && typeof authProfile !== "string") {
    throw new Error("認証プロファイル名は文字列で指定します");
  }
  const auth: AuthContext =
    authProfile === undefined || authProfile === null
      ? { kind: "anonymous" }
      : { kind: "profile", name: parseAuthProfileName(authProfile) };
  return { runId: parseRunId(runId), auth };
}

export interface UseCases {
  startRun(input: StartRunInput): Promise<void>;
}

/** adapter の具象を受け取らない。合成ルートが注入する (ADR-0023)。 */
export function createUseCases(deps: UseCaseDeps): UseCases {
  return {
    async startRun(input: StartRunInput): Promise<void> {
      const session = await deps.browser.createSession(input.auth);
      try {
        const snapshot = await session.snapshot();
        // 鍵に run と認証コンテキストを含める。含めないと権限の異なる実行結果が
        // 同じ場所へ混ざり、Baseline を (screen, state, authProfile) で
        // 識別する前提が壊れる (ADR-0022)。
        const key = parseStoreKey(`run/${input.runId}/${authContextKey(input.auth)}/snapshot`);
        await deps.store.save(key, JSON.stringify(snapshot));
      } finally {
        // close の失敗で元のエラーを握り潰さない。finally 内で reject すると
        // try 内の例外が置き換わり、本当の失敗理由が消える。
        await session.close().catch(() => undefined);
      }
    },
  };
}
