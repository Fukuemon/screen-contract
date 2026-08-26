import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { chmodSync, renameSync } from "node:fs";
import { join } from "node:path";
import type { SecretStore } from "@screen-contract/app";
import type { Keystore } from "./keystore.js";
import { open, parseEnvelope, seal } from "./sealed.js";

/**
 * 入力値の secret の保管。
 *
 * **Storage State と同じ方式で暗号化する** (context/infrastructure.md)。実体は
 * `secrets/<名前>.enc` で、鍵は OS キーストアにのみ置く。
 *
 * 値は DSL にも実行履歴にも入らない。ここだけが持つ。
 */

/** 現在の鍵の版。鍵を入れ替えるときに上げる。 */
const KEY_VERSION = 1;
const EXTENSION = ".enc";

/**
 * secret の名前。
 *
 * 保存先のパスの一部になるため、認証プロファイルと同じ規則で縛る。**小文字
 * だけ**にするのは、macOS と Windows の既定ファイルシステムが大文字小文字を
 * 区別しないためである。
 */
const SECRET_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;

const RESERVED = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  ...Array.from({ length: 10 }, (_, i) => `com${String(i)}`),
  ...Array.from({ length: 10 }, (_, i) => `lpt${String(i)}`),
]);

function isPortable(name: string): boolean {
  // Windows は末尾のドットと空白を落とす。`a.` と `a` が同じファイルを指す。
  return !/[. ]$/.test(name) && !RESERVED.has((name.split(".")[0] ?? "").toLowerCase());
}

export class SecretError extends Error {
  /** 検証由来であることの印。interface 層が構造で分類する。 */
  readonly failure = "validation";

  constructor(message: string) {
    super(message);
    this.name = "SecretError";
  }
}

function assertName(name: string): void {
  if (!SECRET_NAME.test(name) || !isPortable(name)) {
    // 拒否した値をメッセージへ入れない。ログや応答へ外部入力が反射する。
    throw new SecretError(
      "secret の名前の規則に合いません (小文字英数で始まり、. _ - を含む 64 文字以内)",
    );
  }
}

export interface SecretStoreOptions {
  /** `$XDG_STATE_HOME/screen-contract`。起動時検査を通した値を渡す。 */
  readonly stateDir: string;
  readonly keystore: Keystore;
}

export function createSecretStore(options: SecretStoreOptions): SecretStore {
  const directory = join(options.stateDir, "secrets");

  function pathOf(name: string): string {
    assertName(name);
    return join(directory, `${name}${EXTENSION}`);
  }

  return {
    assertName,

    list(): readonly string[] {
      if (!existsSync(directory)) {
        return [];
      }
      return readdirSync(directory)
        .filter((entry) => entry.endsWith(EXTENSION))
        .map((entry) => entry.slice(0, -EXTENSION.length))
        .filter((name) => SECRET_NAME.test(name) && isPortable(name))
        .sort();
    },

    save(name: string, value: string): void {
      const target = pathOf(name);
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      // 世代は持たない。secret は Baseline の識別に入らない (ADR-0022 の
      // generation は認証プロファイルの話である)。
      const envelope = seal(value, options.keystore.loadOrCreate(), KEY_VERSION, name, 1);
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
    },

    load(name: string): string | undefined {
      const target = pathOf(name);
      let raw: string;
      try {
        raw = readFileSync(target, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return undefined;
        }
        throw new SecretError("入力値を読めません");
      }
      // **認証に失敗したら中止する** (fail closed)。部分的に読めても続行しない。
      return open(parseEnvelope(raw), options.keystore.loadOrCreate(), name);
    },

    remove(name: string): void {
      rmSync(pathOf(name), { force: true });
    },
  };
}
