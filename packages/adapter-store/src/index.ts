export { createOriginsConfig } from "./origins-config.js";
export { generateKey, SealError, type SealedEnvelope } from "./sealed.js";
export {
  createAuthProfileStore,
  AuthProfileError,
  type AuthProfileStoreOptions,
} from "./auth-profiles.js";
export { createKeystore, KeystoreError, type Keystore } from "./keystore.js";

import {
  constants,
  closeSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import type { StoreKey, StorePort, StoreSpace } from "@screen-contract/app";

/**
 * ファイルシステムへの保存。
 *
 * Store Port は app が定義する。adapter は型だけを参照する (ADR-0023)。
 */

export interface FsStoreOptions {
  /** 保存先のルート。ここから外へ書かない。 */
  readonly root: string;
}

/**
 * 置き場ごとにディレクトリを分ける。
 *
 * draft と正本を同一ファイルの版として持つ形では、分離が実装の約束になり
 * 「別のものとして保存されている」ことを構造で示せない (ADR-0017)。
 */
const DIRECTORIES: Readonly<Record<StoreSpace, string>> = {
  draft: "drafts",
  authoritative: "authoritative",
  // 実行履歴は正本と分ける。混ぜると、鍵を合わせた run.start が承認を経ずに
  // 正本を上書きできる (ADR-0017)。
  history: "history",
};

/** 一時ファイルの置き場。鍵の名前空間と重ならないよう先頭ドットにする。 */
const TEMPORARY_DIR = ".tmp";

export type StoreErrorCode = "outside-root" | "io";

/**
 * 保存の失敗。
 *
 * **メッセージへパスと鍵を入れない。** Node の `ErrnoException` は利用者名を
 * 含む絶対パスを載せるため、そのまま外へ出さない (context/testing.md)。
 */
export class StoreError extends Error {
  readonly code: StoreErrorCode;

  constructor(code: StoreErrorCode, cause?: unknown) {
    super(
      code === "outside-root"
        ? "保存先が保存ルートの外を指しています"
        : "保存先の読み書きに失敗しました",
    );
    this.name = "StoreError";
    this.code = code;
    // 元の errno だけを残す。message は捨てる。
    this.cause = (cause as NodeJS.ErrnoException | undefined)?.code;
  }
}

function within(realBase: string, candidate: string): boolean {
  return candidate === realBase || candidate.startsWith(realBase + sep);
}

/**
 * 既に存在する最も深い祖先を解決する。
 *
 * ディレクトリを作る**前に**検査するためである。先に作ってから検査すると、
 * 保存ルート内のシンボリックリンクを辿った先 (ルート外) に空ディレクトリを
 * 残したまま拒否することになる。
 *
 * `existsSync` を使わない。権限で見えない祖先を「無い」と扱ってさらに上へ登り、
 * 上位の祖先で検査を通してしまう。
 */
function realpathOfExistingAncestor(path: string, stopAt: string): string {
  let current = path;
  while (current.length >= stopAt.length) {
    try {
      lstatSync(current);
      return realpathSync(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new StoreError("io", error);
      }
    }
    current = dirname(current);
  }
  throw new StoreError("outside-root");
}

function baseDir(root: string, space: StoreSpace, create: boolean): string | undefined {
  const base = join(root, DIRECTORIES[space]);
  try {
    if (create) {
      mkdirSync(base, { recursive: true, mode: 0o700 });
    }
    return realpathSync(base);
  } catch (error) {
    if (!create && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw new StoreError("io", error);
  }
}

/**
 * 鍵から絶対パスを作り、**解決後に**保存先の配下であることを検査する。
 *
 * `StoreKey` は生成経路を縛るだけで、実装側の検証を免除しない
 * (context/infrastructure.md)。文字列検査だけではシンボリックリンクを通す。
 *
 * **レースは閉じていない。** `realpath` と `open` の間に祖先を差し替えられれば
 * すり抜ける。Node に `openat` が無いため、実際の防御は保存ルートを 0700 に
 * 保つこと (= 同一利用者のみが触れること) である。
 */
function resolveForWrite(root: string, space: StoreSpace, key: StoreKey): string {
  const realBase = baseDir(root, space, true) as string;
  const target = resolve(realBase, key);
  const parent = dirname(target);

  // 作る前に、既存の祖先が保存ルートの配下であることを確かめる。
  if (!within(realBase, realpathOfExistingAncestor(parent, realBase))) {
    throw new StoreError("outside-root");
  }
  try {
    mkdirSync(parent, { recursive: true, mode: 0o700 });
  } catch (error) {
    throw new StoreError("io", error);
  }
  // 作ったあとに再検査しない。既存の祖先が配下であることを確かめた以上、
  // mkdir が作る階層も配下である。**レースを閉じる事後検査は書けない**
  // (Node に openat が無い)。誤解を招くだけの検査は置かない。
  return join(realpathSync(parent), basename(target));
}

function resolveForRead(root: string, space: StoreSpace, key: StoreKey): string | undefined {
  const realBase = baseDir(root, space, false);
  if (realBase === undefined) {
    return undefined;
  }
  const target = resolve(realBase, key);
  const parent = dirname(target);
  let realParent: string;
  try {
    realParent = realpathSync(parent);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw new StoreError("io", error);
  }
  if (!within(realBase, realParent)) {
    throw new StoreError("outside-root");
  }
  return join(realParent, basename(target));
}

let temporaryCounter = 0;

/** 書きかけを読ませない。同じファイルシステム上の一時ファイルへ書いてから rename する。 */
function writeAtomic(root: string, target: string, value: string): void {
  const directory = join(root, TEMPORARY_DIR);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  temporaryCounter += 1;
  // 名前を呼び出しごとに変える。固定名だと、前回の異常終了で残ったファイルに
  // `wx` が当たり、以後の保存が恒久的に失敗する。
  const temporary = join(directory, `${String(process.pid)}.${String(temporaryCounter)}.tmp`);
  const fd = openSync(temporary, "wx", 0o600);
  try {
    // writeFileSync は全量を書き切るまで繰り返す。writeSync は部分書き込みを
    // 返すことがあり、返り値を捨てると壊れた内容が原子的に正本になる。
    writeFileSync(fd, value, "utf8");
    fsyncSync(fd);
  } catch (error) {
    closeSync(fd);
    rmSync(temporary, { force: true });
    throw new StoreError("io", error);
  }
  closeSync(fd);

  try {
    renameSync(temporary, target);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw new StoreError("io", error);
  }
  // ディレクトリエントリの更新も耐久化する。ファイルだけ fsync しても、
  // クラッシュ時に確定したはずの正本が消えうる。
  const dirFd = openSync(dirname(target), "r");
  try {
    fsyncSync(dirFd);
  } finally {
    closeSync(dirFd);
  }
}

export function createFsStore(options: FsStoreOptions): StorePort {
  return {
    async save(space: StoreSpace, key: StoreKey, value: string): Promise<void> {
      writeAtomic(options.root, resolveForWrite(options.root, space, key), value);
    },

    async load(space: StoreSpace, key: StoreKey): Promise<string | undefined> {
      // 読み取りでディレクトリを作らない。無いものを問い合わせただけで
      // 保存先の構造が変わるのは、読み取りの契約から外れる。
      const target = resolveForRead(options.root, space, key);
      if (target === undefined) {
        return undefined;
      }
      let fd: number;
      try {
        // **最終要素の symlink を辿らない。** 辿ると、保存ルート内に張られた
        // `drafts/x -> ../runtime.json` のようなリンクでトークンを読み出せる。
        fd = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        // 無いことだけを undefined にする。権限エラーを握り潰すと、保存できて
        // いないのに「まだ無い」と読める。ELOOP は symlink を拒否した結果。
        if (code === "ENOENT") {
          return undefined;
        }
        throw new StoreError(code === "ELOOP" ? "outside-root" : "io", error);
      }
      try {
        if (!fstatSync(fd).isFile()) {
          throw new StoreError("io");
        }
        return readFileSync(fd, "utf8");
      } finally {
        closeSync(fd);
      }
    },
  };
}
