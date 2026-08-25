import type { ElementId, SemanticLocator } from "@screen-contract/domain";

/**
 * 台帳へ持ち越す要素。
 *
 * `ElementDef` より狭い形を要求する。**要るのは ID と探し方だけ**であり、
 * 表示名や種別まで求めると、まだ定義が起きていない要素を持ち越せない。
 */
export interface KnownElement {
  readonly id: ElementId;
  readonly locator: SemanticLocator;
}

/**
 * 永続要素 ID の採番。
 *
 * **名称を識別子にしない** ([adr/0012](../../../adr/0012-element-identity.md))。
 * 名称は仕様の改善で変わり、重複も許したい (同名ボタンが複数ある画面) ため、
 * `role` と `name` から導くと次の 2 つが同時に壊れる。
 *
 * - 文言を直した瞬間に別の要素になり、版をまたいだ追跡が切れる
 * - 同じ画面の同名要素が同じ ID へ潰れ、片方が黙って消える
 *
 * Locator (`role` + `name`) は**探し方**であって同一性ではない。ID は不透明な
 * 連番とし、Locator との対応をこの台帳が持つ。
 */

const PREFIX = "el-";
/** 桁を揃える。揃えないと辞書順の並びが番号順と食い違う。 */
const DIGITS = 4;

export interface ElementIdRegistry {
  /**
   * Locator へ ID を割り当てる。
   *
   * **同じ Locator には同じ ID を返す。** 一度割り当てた ID は変更しない
   * (element-mapping feature)。
   */
  idFor(locator: SemanticLocator): ElementId;
  /** 割り当て済みの Locator。台帳を持ち越すために読む。 */
  entries(): readonly { readonly id: ElementId; readonly locator: SemanticLocator }[];
  /** ID から探し方を引く。期待状態が指す要素の定義を起こすために要る。 */
  locatorOf(id: ElementId): SemanticLocator | undefined;
}

function keyOf(locator: SemanticLocator): string {
  return `${locator.role}\u0000${locator.name}`;
}

/** 既に振ってある連番。数えないと、持ち越した ID と衝突する。 */
function sequenceOf(id: string): number {
  const rest = id.startsWith(PREFIX) ? id.slice(PREFIX.length) : "";
  return /^\d+$/.test(rest) ? Number(rest) : 0;
}

/**
 * 台帳を作る。
 *
 * @param known - 既に ID を持つ定義。**これで持ち越す。** 渡さないと、
 *   記録を止めて再開したときに同じ要素へ別の ID が振られる。
 */
export function createElementIdRegistry(known: readonly KnownElement[] = []): ElementIdRegistry {
  const byLocator = new Map<string, ElementId>();
  const locators = new Map<ElementId, SemanticLocator>();
  let sequence = 0;

  for (const element of known) {
    byLocator.set(keyOf(element.locator), element.id);
    locators.set(element.id, element.locator);
    sequence = Math.max(sequence, sequenceOf(element.id));
  }

  return {
    idFor(locator: SemanticLocator): ElementId {
      const key = keyOf(locator);
      const existing = byLocator.get(key);
      if (existing !== undefined) {
        return existing;
      }
      sequence += 1;
      const id = `${PREFIX}${String(sequence).padStart(DIGITS, "0")}` as ElementId;
      byLocator.set(key, id);
      locators.set(id, locator);
      return id;
    },

    entries: () => [...locators].map(([id, locator]) => ({ id, locator })),
    locatorOf: (id) => locators.get(id),
  };
}
