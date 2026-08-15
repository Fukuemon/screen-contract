import type { AuthContext } from "@screen-contract/domain";
import type { BrowserPort } from "@screen-contract/core-execution";

/**
 * 保存の鍵。
 *
 * 実装は adapter/store のファイルシステムであり、鍵は run や画面の識別子として
 * 外部入力 (HTTP / JSON-RPC / エージェント) 由来になる。検証していない文字列を
 * そのままパス組み立てへ渡すと、`../` で任意のファイルを上書きできる。
 * 生成経路を parseStoreKey に限ることで、未検証の値を型で弾く。
 */
export type StoreKey = string & { readonly __brand: "StoreKey" };

const STORE_KEY_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function parseStoreKey(raw: string): StoreKey {
  const segments = raw.split("/");
  const ok =
    segments.length > 0 &&
    segments.every((s) => STORE_KEY_SEGMENT.test(s) && s !== "." && s !== "..");
  if (!ok) {
    throw new Error(`保存の鍵として使えない文字列です: ${JSON.stringify(raw)}`);
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
  readonly auth: AuthContext;
}

export interface UseCases {
  startRun(input: StartRunInput): Promise<void>;
}

/** adapter の具象を受け取らない。合成ルートが注入する (ADR-0023)。 */
export function createUseCases(deps: UseCaseDeps): UseCases {
  return {
    async startRun(input: StartRunInput): Promise<void> {
      const session = await deps.browser.createSession(input.auth);
      // finally で必ず閉じる。session は復号した認証状態を保持するため、
      // 異常終了で生き残らせない。
      try {
        const snapshot = await session.snapshot();
        await deps.store.save(parseStoreKey("run/latest"), JSON.stringify(snapshot));
      } finally {
        await session.close();
      }
    },
  };
}
