import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { AuthProfileStore, StorageState } from "@screen-contract/app";
import type { Keystore } from "./keystore.js";
import { open, parseEnvelope, seal } from "./sealed.js";

/**
 * 認証プロファイルの保管。
 *
 * Baseline は `(screen, state, authProfile)` で識別される (ADR-0022)。
 * 実体は `auth/<authProfile>.enc` で、**鍵は OS キーストアにのみ置く**。
 */

/** 現在の鍵の版。鍵を入れ替えるときに上げる。 */
const KEY_VERSION = 1;
const EXTENSION = ".enc";

/**
 * プロファイル名。
 *
 * 保存先のパスの一部になるため、`core-execution` の `AuthProfileName` と同じ
 * 規則で縛る。**小文字だけ**にするのは、macOS と Windows の既定ファイル
 * システムが大文字小文字を区別せず `Admin` と `admin` が同じファイルを指す
 * ためである。
 */
const PROFILE_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/**
 * Windows が予約しているデバイス名。**拡張子を付けても予約されたまま**である。
 *
 * `core-execution` の `isPortablePathSegment` と同じ規則を持つが、参照しない。
 * adapter は Port の型だけを参照でき、実行時の値を共有できない
 * (context/architecture.md)。規則を変えるときは両方を直す。
 */
const RESERVED = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  ...Array.from({ length: 10 }, (_, i) => `com${String(i)}`),
  ...Array.from({ length: 10 }, (_, i) => `lpt${String(i)}`),
]);

/**
 * 予約語。匿名実行を表す内部表現と衝突するため使わせない。
 *
 * 予約しないと `authContextKey` が両者を同じ鍵へ潰し、匿名実行の結果が
 * 認証済みの Baseline を上書きする (ADR-0022)。
 */
const RESERVED_NAMES = new Set(["anonymous"]);

function isPortable(name: string): boolean {
  // Windows は末尾のドットと空白を落とす。`a.` と `a` が同じファイルを指す。
  return !/[. ]$/.test(name) && !RESERVED.has((name.split(".")[0] ?? "").toLowerCase());
}

export class AuthProfileError extends Error {
  /** 検証由来であることの印。interface 層が構造で分類する。 */
  readonly failure = "validation";

  constructor(message: string) {
    super(message);
    this.name = "AuthProfileError";
  }
}

export interface AuthProfileStoreOptions {
  /** `$XDG_STATE_HOME/screen-contract`。起動時検査を通した値を渡す。 */
  readonly stateDir: string;
  readonly keystore: Keystore;
}

function assertName(name: string): void {
  if (!PROFILE_NAME.test(name) || RESERVED_NAMES.has(name) || !isPortable(name)) {
    // 拒否した値をメッセージへ入れない。ログや応答へ外部入力が反射する。
    throw new AuthProfileError(
      "認証プロファイル名の規則に合いません (小文字英数で始まり、. _ - を含む 64 文字以内)",
    );
  }
}

/**
 * 復号した中身を Storage State として読む。
 *
 * **形を信用しない。** 保存形式を変えたときに、古いファイルが型だけ通って
 * 中身が空のまま「認証済み」として実行されるのを防ぐ。
 */
function asStorageState(value: unknown): StorageState {
  const raw = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  const local = raw["localStorage"];
  return {
    cookies: Array.isArray(raw["cookies"]) ? raw["cookies"] : [],
    localStorage:
      typeof local === "object" && local !== null && !Array.isArray(local)
        ? (local as Record<string, unknown>)
        : {},
  };
}

export function createAuthProfileStore(options: AuthProfileStoreOptions): AuthProfileStore {
  const directory = join(options.stateDir, "auth");

  function pathOf(name: string): string {
    assertName(name);
    return join(directory, `${name}${EXTENSION}`);
  }

  /**
   * 取り込みの世代。まだ無ければ 0。
   *
   * **復号を通して読む。** 世代は封筒の平文にあるため、読むだけでは改ざんを
   * 検知できない。AAD は暗号文と世代の組を固定するだけで、復号しない読み手には
   * 何も保証しない (ADR-0022)。
   */
  function generationOf(name: string): number {
    let raw: string;
    try {
      raw = readFileSync(pathOf(name), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // まだ取り込んでいない。破損と区別する。
        return 0;
      }
      throw new AuthProfileError("認証状態を読めません");
    }
    const envelope = parseEnvelope(raw);
    // 復号が通らなければ投げる。0 を返すと、破損したプロファイルが匿名の
    // Baseline へ黙って潰れる。
    open(envelope, options.keystore.loadOrCreate(), name);
    return envelope.generation;
  }

  return {
    assertName,

    list(): readonly string[] {
      if (!existsSync(directory)) {
        return [];
      }
      return (
        readdirSync(directory)
          .filter((entry) => entry.endsWith(EXTENSION))
          .map((entry) => entry.slice(0, -EXTENSION.length))
          // 一覧と操作の規則を揃える。揃えないと、一覧に出るのに開けない名前が残る。
          .filter(
            (name) => PROFILE_NAME.test(name) && !RESERVED_NAMES.has(name) && isPortable(name),
          )
          .sort()
      );
    },

    generation: generationOf,

    save(name: string, state: unknown): number {
      const target = pathOf(name);
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      // **取り込みのたびに世代を進める** (ADR-0022)。進めないと、同じ名前へ
      // 別のアカウントを入れた瞬間から権限の違う結果が同じ Baseline へ混ざる。
      const generation = generationOf(name) + 1;
      const envelope = seal(
        JSON.stringify(state),
        options.keystore.loadOrCreate(),
        KEY_VERSION,
        name,
        generation,
      );
      // 一時ファイルへ書いてから置き換える。途中で落ちても壊れた状態を残さない。
      const temporary = `${target}.${String(process.pid)}.tmp`;
      writeFileSync(temporary, JSON.stringify(envelope), { encoding: "utf8", mode: 0o600 });
      try {
        renameSync(temporary, target);
      } catch (error) {
        rmSync(temporary, { force: true });
        throw error;
      }
      // rename は元ファイルの権限を引き継ぐ。作り直したときのために揃える。
      chmodSync(target, 0o600);
      return generation;
    },

    load(name: string): StorageState | undefined {
      const target = pathOf(name);
      let raw: string;
      try {
        raw = readFileSync(target, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return undefined;
        }
        throw new AuthProfileError("認証状態を読めません");
      }
      // **認証に失敗したら中止する** (fail closed)。部分的に読めても続行しない。
      const decoded: unknown = JSON.parse(
        open(parseEnvelope(raw), options.keystore.loadOrCreate(), name),
      );
      return asStorageState(decoded);
    },

    remove(name: string): void {
      rmSync(pathOf(name), { force: true });
    },
  };
}
