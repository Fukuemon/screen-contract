/**
 * 出力先の格納範囲の検査と、成果物のファイル配置。
 *
 * 出力先は Screen 文書で指定でき、Screen 文書はエージェントが `screen.save_draft`
 * で編集できる。制約が無いと `../../../.git/hooks/pre-commit` や `~/.zshrc` を
 * 指定して任意のファイルを書き換えられる (artifact-generation feature)。
 *
 * 検査は 2 段である。**文字列検査だけではシンボリックリンクを通してしまう。**
 * 2 段目はパスの解決を要するため、解決済みのパスを引数に取る形にして core を
 * 純粋計算のままに保つ (解決は app が Store Port 側で行う)。
 */

export type PathRejection =
  | "absolute"
  | "parent-traversal"
  | "home-expansion"
  | "empty"
  | "unsafe-segment"
  | "outside-root";

/**
 * 検証エラー。`code` は機械可読で、`at` はどの宣言が原因かを指す
 * (`core-workflow` の `WorkflowError` と揃える)。
 *
 * **メッセージへ入力値を入れない。** 解決済みの絶対パスはローカルの構成を
 * そのまま露出する (context/testing.md)。
 */
export class ArtifactPathError extends Error {
  /** 検証由来であることの印。interface 層が構造で分類する。 */
  readonly failure = "validation";

  readonly code: PathRejection;
  readonly at: string | undefined;

  constructor(code: PathRejection, at?: string) {
    super(MESSAGES[code]);
    this.name = "ArtifactPathError";
    this.code = code;
    this.at = at;
  }
}

const MESSAGES: Readonly<Record<PathRejection, string>> = {
  absolute: "出力先に絶対パスは使えません",
  "parent-traversal": "出力先に `..` は使えません",
  "home-expansion": "出力先に `~` 始まりのパスは使えません",
  empty: "出力先が空です",
  "unsafe-segment": "パスのセグメントに使えない文字か予約名が含まれます",
  "outside-root": "出力先がプロジェクトルートの外を指しています",
};

/**
 * パスの 1 セグメントとして安全な識別子。
 *
 * 生成経路を `parseArtifactSegment` に限り、未検証の文字列からパスが組み上がる
 * 経路を型で塞ぐ (`core-execution` の `AuthProfileName` と同じ考え方)。
 */
export type ArtifactSegment = string & { readonly __brand: "ArtifactSegment" };

const SEGMENT = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
/** Windows が予約しているデバイス名。拡張子を付けても予約されたままである。 */
const RESERVED = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  ...Array.from({ length: 10 }, (_, i) => `com${i}`),
  ...Array.from({ length: 10 }, (_, i) => `lpt${i}`),
]);

/**
 * `core-execution` の `isPortablePathSegment` と同じ規則を持つが、参照しない。
 * core 同士は型の参照のみ許可され、実行時の値を共有できない
 * (context/architecture.md)。規則を変えるときは両方を直す。
 */
export function parseArtifactSegment(raw: string, at?: string): ArtifactSegment {
  if (
    !SEGMENT.test(raw) ||
    /[. ]$/.test(raw) ||
    RESERVED.has((raw.split(".")[0] ?? "").toLowerCase())
  ) {
    throw new ArtifactPathError("unsafe-segment", at);
  }
  return raw as ArtifactSegment;
}

/** 1 段目: 文字列の検査。プロジェクトルートからの相対パスだけを通す。 */
export function assertOutputPath(value: string): void {
  if (value.length === 0) {
    throw new ArtifactPathError("empty");
  }
  if (value.startsWith("~")) {
    throw new ArtifactPathError("home-expansion");
  }
  // Windows のドライブレターと UNC も絶対パスとして弾く。
  if (value.startsWith("/") || value.startsWith("\\") || /^[A-Za-z]:/.test(value)) {
    throw new ArtifactPathError("absolute");
  }
  if (value.split(/[/\\]/).includes("..")) {
    throw new ArtifactPathError("parent-traversal");
  }
}

/**
 * 2 段目: 解決後の格納範囲の検査。`resolvedRoot` / `resolvedPath` は
 * シンボリックリンクを解決済みの絶対パスであること。
 *
 * 区切りは呼び出し側の環境に合わせて渡す (既定は POSIX)。
 */
export function assertResolvedWithinRoot(
  resolvedRoot: string,
  resolvedPath: string,
  separator = "/",
): void {
  const root = resolvedRoot.endsWith(separator) ? resolvedRoot : `${resolvedRoot}${separator}`;
  // ルート自身は出力先ではない。`artifacts-evil/` が `artifacts/` を通らないよう
  // 区切り文字まで含めて比べる。
  if (!resolvedPath.startsWith(root)) {
    throw new ArtifactPathError("outside-root");
  }
}

/**
 * 既定の配置。認証プロファイルごとに分ける (ADR-0022)。
 *
 * `authKey` は `core-execution` の `authContextKey` が返す正規化キー
 * (`anon` / `profile.<name>`) を検証したものを渡す。混ぜると、権限差で見える
 * 範囲の違う画像とテーブルが同じファイルを上書きし合う。
 */
export function defaultArtifactDir(screenId: ArtifactSegment, authKey: ArtifactSegment): string {
  return `artifacts/screens/${screenId}/${authKey}`;
}

export function annotatedImageName(stateId: ArtifactSegment): string {
  return `${stateId}.svg`;
}

export function rawImageName(stateId: ArtifactSegment): string {
  return `${stateId}.raw.png`;
}
