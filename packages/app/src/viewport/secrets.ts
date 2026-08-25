/**
 * 入力値の secret。
 *
 * **DSL にも実行履歴にも値を持たせない** (workflow-dsl feature / ADR-0011)。
 * DSL は正本として commit され、実行履歴は永続化されるため、一度入ると後から
 * 取り除けない。記録は名前だけを残し、値はここへ入れる。
 *
 * 暗号化と置き場は adapter の責務である (context/infrastructure.md)。
 */
export interface SecretStore {
  /** 規則に合う名前か。合わなければ投げる。 */
  assertName(name: string): void;
  /** 登録済みの名前。**値は返さない。** */
  list(): readonly string[];
  save(name: string, value: string): void;
  load(name: string): string | undefined;
  remove(name: string): void;
}

/**
 * 入力欄から secret の名前を作る。
 *
 * **名前に値を混ぜない。** 画面と要素 ID だけから作る。同じ欄へ入れ直したときに
 * 同じ名前になることで、記録を取り直しても参照が切れない。
 *
 * **表示名を使わない。** 名前は保存先のパスの一部になるため ASCII に落とす必要が
 * あり、日本語のラベルは落とすと消えて衝突する。要素 ID は既に不透明な連番で
 * あり、そのまま使える (ADR-0012)。
 */
export function secretNameOf(stateUrl: string, elementId: string): string {
  const host = (() => {
    try {
      return new URL(stateUrl).host;
    } catch {
      return "target";
    }
  })();
  const slug = `${host}-${elementId}`
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length === 0 ? "secret" : slug.slice(0, 64).replace(/-+$/, "");
}
