import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";

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

export interface AllowedOriginsOptions {
  readonly configPath: string;
  readonly initial: readonly string[];
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
      // 設定ファイルの他の項目を消さない。読み直してから足す。
      let config: Record<string, unknown>;
      try {
        config = JSON.parse(readFileSync(options.configPath, "utf8")) as Record<string, unknown>;
      } catch {
        config = {};
      }
      config["allowedOrigins"] = next;
      // 一時ファイルへ書いてから置き換える。途中で落ちても壊れた設定を残さない。
      const temporary = `${options.configPath}.${String(process.pid)}.tmp`;
      writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, "utf8");
      try {
        renameSync(temporary, options.configPath);
      } catch (error) {
        rmSync(temporary, { force: true });
        throw error;
      }
      origins = next;
      return [...origins];
    },
  };
}
