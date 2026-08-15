import type { StoreKey, StorePort } from "@screen-contract/app";

/**
 * Store Port は app が定義する。adapter は型だけを参照する (ADR-0023)。
 *
 * 実装するときは、鍵から組み立てた絶対パスが保存先ディレクトリの配下に収まることを
 * `path.resolve` の**あとに**検証する。`StoreKey` は生成経路を縛るだけで、
 * 実装側の検証を免除しない (context/infrastructure.md)。
 */
export function createFsStore(): StorePort {
  return {
    async save(_key: StoreKey, _value: string): Promise<void> {
      throw new Error("not implemented");
    },
  };
}
