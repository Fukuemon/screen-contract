/**
 * 実行してよい origin の列挙。
 *
 * **列挙は残す。** 列挙しない限り何も操作しないという安全装置が、UI から任意の
 * URL を開けるようにしても崩れないようにする (ADR-0017)。UI から足せるのは
 * 「明示的な追加操作」であり、**設定ファイルへ書き戻して記録に残す**。
 */

export interface AllowedOrigins {
  list(): readonly string[];
  /** 追加して設定ファイルへ書き戻す。既にあれば何もしない。 */
  add(origin: string): readonly string[];
  has(origin: string): boolean;
}

export class OriginError extends Error {
  /** 検証由来であることの印。interface 層が構造で分類する。 */
  readonly failure = "validation";

  constructor(message: string) {
    super(message);
    this.name = "OriginError";
  }
}

/**
 * origin として受け付ける形か。
 *
 * `new URL()` の `origin` と一致することを見る。パスや query を含む文字列を
 * origin として登録すると、以後の照合が通らなくなる。
 */
export function parseOrigin(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new OriginError("URL として解釈できません");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new OriginError("http または https だけを登録できます");
  }
  if (url.origin !== raw.replace(/\/$/, "")) {
    // 末尾のスラッシュだけは許す。それ以外の差は登録しない。
    throw new OriginError("origin だけを指定してください (パスや query は含めない)");
  }
  return url.origin;
}

/**
 * 列挙の置き場。
 *
 * **app はファイルを読まない。** 追加を記録に残す先はプロダクト設定であり、
 * その読み書きは adapter が担う (context/architecture.md)。
 */
export interface OriginsConfigPort {
  /** 設定の中身。**丸ごと読む** — 他の項目を消さずに書き戻すために要る。 */
  read(): Record<string, unknown>;
  write(config: Record<string, unknown>): void;
}

export interface AllowedOriginsOptions {
  readonly config: OriginsConfigPort;
  readonly initial: readonly string[];
  /**
   * 追加を記録する先。
   *
   * **黙って広げない。** ADR-0017 は「拒否した実行は理由付きで記録する」と定める
   * が、対象の範囲を広げたこと自体も同じだけ重い。利用者が気付く契機が設定
   * ファイルの差分しか無い状態にしない。
   */
  readonly onAdded?: ((origin: string) => void) | undefined;
}

export function createAllowedOrigins(options: AllowedOriginsOptions): AllowedOrigins {
  let origins = [...options.initial];

  return {
    list: () => [...origins],
    has: (origin) => origins.includes(origin),

    add(origin: string): readonly string[] {
      const parsed = parseOrigin(origin);
      if (origins.includes(parsed)) {
        return [...origins];
      }
      const next = [...origins, parsed];
      // 設定の他の項目を消さない。読み直してから足す。
      options.config.write({ ...options.config.read(), allowedOrigins: next });
      origins = next;
      options.onAdded?.(parsed);
      return [...origins];
    },
  };
}
