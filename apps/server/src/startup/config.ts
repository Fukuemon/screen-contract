import { readFileSync } from "node:fs";
import { StartupAbort } from "./abort.js";

/**
 * 実行してよい origin の列挙。
 *
 * **既定は空とする。** 1 つも列挙していなければ実行できない
 * (context/infrastructure.md)。「何でも実行できる」を既定にしない。
 * 既定が空であること自体が、意図しない対象への実行を防ぐ安全装置である。
 *
 * secret ではないため、リポジトリ内のレビューできる場所に置く。
 *
 * **読み取りは合成ルートの責務に留める。** 列挙外への `open` を拒否するのは
 * core/execution であり、その判定に使う型は Port の定義元へ置く。ここで
 * 型まで抱え込むと実施側で二重定義になる (context/architecture.md)。
 * 拒否の実装を入れる段で、型と検証を packages 側へ移す。
 */
export interface ProductConfig {
  readonly allowedOrigins: readonly string[];
  /**
   * 待受ポート。省略すると OS に割り当てさせる。
   *
   * **既定は割り当てさせる側である** (context/infrastructure.md)。固定すると他の
   * アプリと衝突する。それでも固定したいのは、ブックマークや外部ツールの設定に
   * 書きたいときである。指定した番号が使えなければ**起動を中止する** — 黙って
   * 別のポートへ逃げると、固定した意味が無い。
   */
  readonly port?: number | undefined;
}

function parseOrigin(value: unknown): string {
  if (typeof value !== "string") {
    throw new StartupAbort(
      "プロダクト設定の allowedOrigins に文字列でない要素があります",
      "allowedOrigins は origin の文字列だけを並べてください",
    );
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new StartupAbort(
      "プロダクト設定の allowedOrigins に origin として解釈できない要素があります",
      "http://host:port の形式で書いてください (パスやワイルドカードは使えません)",
    );
  }
  // origin と完全一致でなければ、パス付き・末尾スラッシュ・認証情報付きが混ざる。
  // 比較の実装が前方一致で書かれたときに、意図より広い範囲を許してしまう。
  if (url.origin !== value || (url.protocol !== "http:" && url.protocol !== "https:")) {
    throw new StartupAbort(
      "プロダクト設定の allowedOrigins に origin ではない要素があります",
      "http:// または https:// の origin のみを書いてください",
    );
  }
  return value;
}

/**
 * 待受ポート。
 *
 * **well-known port を避ける。** 1024 未満は特権が要り、指定できても起動しない。
 */
function parsePort(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1024 || value > 65_535) {
    throw new StartupAbort(
      "プロダクト設定の port が待受ポートとして使えません",
      "1024 以上 65535 以下の整数を書いてください (省略すると OS に割り当てさせます)",
    );
  }
  return value;
}

export function loadProductConfig(path: string): ProductConfig {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    // 「無い」だけを空扱いにする。権限不足や破損まで空にすると、原因と案内が
    // 食い違う (「追記してください」と言いながら読めていない)。
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { allowedOrigins: [] };
    }
    throw new StartupAbort(
      "プロダクト設定を読めません",
      "設定ファイルの権限と内容を確認してください",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new StartupAbort(
      "プロダクト設定を解析できません",
      "設定ファイルが JSON として正しいか確認してください",
    );
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new StartupAbort(
      "プロダクト設定がオブジェクトではありません",
      "設定ファイルの内容を確認してください",
    );
  }
  const { allowedOrigins, port } = parsed as { allowedOrigins?: unknown; port?: unknown };
  const origins =
    allowedOrigins === undefined
      ? []
      : Array.isArray(allowedOrigins)
        ? allowedOrigins.map(parseOrigin)
        : (() => {
            throw new StartupAbort(
              "プロダクト設定の allowedOrigins が配列ではありません",
              "allowedOrigins は origin の文字列の配列です",
            );
          })();
  return { allowedOrigins: origins, port: parsePort(port) };
}
