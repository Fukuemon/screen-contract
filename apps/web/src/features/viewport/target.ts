/**
 * 対象の URL と viewport サイズ。
 *
 * **origin は列挙したものから選ぶ。** 実行してよい origin をプロダクト設定で
 * 列挙する規則は変えない (ADR-0017)。パスは自由に入れられる。
 */

export type TargetRejection = "unknown-origin" | "bad-path" | "empty-origin";

export interface TargetInput {
  readonly origin: string;
  readonly path: string;
}

/**
 * 対象 URL を組み立てる。
 *
 * 列挙外の origin を弾く。弾かないと、設定の列挙という安全装置が UI から
 * 迂回できることになる。
 */
export function buildTargetUrl(
  input: TargetInput,
  allowed: readonly string[],
): { readonly url: string } | { readonly rejection: TargetRejection } {
  if (input.origin.length === 0) {
    return { rejection: "empty-origin" };
  }
  if (!allowed.includes(input.origin)) {
    return { rejection: "unknown-origin" };
  }
  let url: URL;
  try {
    // path 側に origin を書かれても、base の origin を保つ。
    url = new URL(input.path === "" ? "/" : input.path, input.origin);
  } catch {
    return { rejection: "bad-path" };
  }
  if (url.origin !== input.origin) {
    // `//evil.test/` のような入力で origin が入れ替わる。
    return { rejection: "bad-path" };
  }
  return { url: url.toString() };
}

export interface ViewportPreset {
  readonly id: string;
  readonly label: string;
  readonly width: number;
  readonly height: number;
}

/**
 * viewport のプリセット。
 *
 * 幅の区切りは Tailwind の breakpoint に合わせる。実機の画素ではなく
 * **CSS ピクセル**であり、対象アプリの responsive の分岐と対応する。
 */
export const VIEWPORT_PRESETS: readonly ViewportPreset[] = [
  { id: "mobile", label: "モバイル", width: 375, height: 667 },
  { id: "tablet", label: "タブレット", width: 768, height: 1024 },
  { id: "laptop", label: "ノート", width: 1280, height: 720 },
  { id: "desktop", label: "デスクトップ", width: 1440, height: 900 },
];

/** 実行してよい寸法か。0 以下や桁外れを対象へ渡さない。 */
export function isValidViewport(size: {
  readonly width: number;
  readonly height: number;
}): boolean {
  const ok = (value: number): boolean => Number.isInteger(value) && value >= 200 && value <= 4096;
  return ok(size.width) && ok(size.height);
}
