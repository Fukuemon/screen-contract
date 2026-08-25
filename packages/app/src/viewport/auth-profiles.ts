/**
 * 認証プロファイルの保管 Port。
 *
 * Baseline は `(screen, state, authProfile, generation)` で識別される
 * (ADR-0022)。**generation は取り込みの世代**であり、同じ名前へ別のアカウントを
 * 入れ直したときに権限の違う結果が混ざらないようにする。
 *
 * 暗号化と置き場は adapter の責務である。app は名前と世代しか知らない。
 */

import type { StorageState } from "@screen-contract/core-execution";

export interface AuthProfileStore {
  /** 規則に合う名前か。合わなければ投げる。 */
  assertName(name: string): void;
  list(): readonly string[];
  /**
   * 取り込む。**呼ぶたびに generation を 1 つ進める。**
   *
   * 進めないと、同じ名前へ別のアカウントを入れた瞬間から、権限の違う結果が
   * 同じ Baseline へ混ざる (ADR-0022)。
   *
   * @returns 取り込んだ後の generation
   */
  save(name: string, state: StorageState): number;
  /** 復号した認証状態。**app はこれを Port へ渡さない** — 解決は adapter が担う。 */
  load(name: string): StorageState | undefined;
  /** 取り込みの世代。まだ無ければ 0。 */
  generation(name: string): number;
  remove(name: string): void;
}
