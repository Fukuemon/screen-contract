/**
 * 対象の URL と viewport サイズ。
 *
 * **origin は列挙したものから選ぶ。** 実行してよい origin をプロダクト設定で
 * 列挙する規則は変えない (ADR-0017)。パスは自由に入れられる。
 */

/**
 * 入力から対象 URL を作る。
 *
 * **path の直打ちを受ける。** `/settings` や `settings?a=1` のように origin を
 * 省いた入力を、いま見ている画面の origin へ解決する。省けないと、対象を切り替える
 * たびに origin を打ち直すことになる。
 *
 * `//evil.test/` のような入力で origin が入れ替わらないことを確かめる。入れ替わる
 * と、列挙という安全装置を URL 欄から迂回できる (ADR-0017)。
 *
 * @param base - いま見ている画面。ここの origin へ寄せる。
 */
export function resolveTarget(input: string, base: string): string | undefined {
  const trimmed = input.trim();
  if (trimmed === "") {
    return undefined;
  }
  if (originOf(trimmed) !== undefined) {
    return trimmed;
  }
  const origin = originOf(base);
  if (origin === undefined) {
    return undefined;
  }
  let resolved: URL;
  try {
    resolved = new URL(trimmed, origin);
  } catch {
    return undefined;
  }
  // origin が入れ替わる入力は受けない。`//evil.test/` がこれに当たる。
  return resolved.origin === origin ? resolved.toString() : undefined;
}

/** 入力から origin を取り出す。取り出せなければ undefined。 */
export function originOf(raw: string): string | undefined {
  try {
    return new URL(raw).origin;
  } catch {
    return undefined;
  }
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

/**
 * 実行してよい寸法か。
 *
 * **`packages/app` の `isValidViewport` と同じ規則を持つ。** `apps/web` は
 * `packages/app` を参照できない (context/architecture.md の Runtime Boundary)
 * ため、値を共有できない。**片方だけ変えない。** 判定の正本は server 側であり、
 * ここは押す前に弾くための写しである。
 */
export function isValidViewport(size: {
  readonly width: number;
  readonly height: number;
}): boolean {
  const ok = (value: number): boolean => Number.isInteger(value) && value >= 200 && value <= 4096;
  return ok(size.width) && ok(size.height);
}
