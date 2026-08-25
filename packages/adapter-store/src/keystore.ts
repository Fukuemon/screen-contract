import { execFileSync } from "node:child_process";
import { generateKey } from "./sealed.js";

/** キーストアの識別子。契約で固定されている (context/infrastructure.md)。 */
const SERVICE = "screen-contract";
const ACCOUNT = "storage-state-key";

/** `security` が「見つからない」を表す終了コード。 */
const NOT_FOUND = 44;

export interface Keystore {
  /** 無ければ作って返す。呼ぶたびに作り直さない。 */
  loadOrCreate(): Buffer;
}

export class KeystoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeystoreError";
  }
}

function exitCodeOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

/**
 * macOS Keychain。
 *
 * **鍵を argv へ載せない。** argv は同一利用者の任意プロセスから `ps` で読め、
 * Linux では `/proc/<pid>/cmdline` が他利用者にも見える。載せた時点で、
 * キーストアの ACL も暗号化も意味を失う。`-w` を値なしで渡すと標準入力から
 * 読み、確認のため 2 度要求する。
 */
function macKeychain(): Keystore {
  return {
    loadOrCreate(): Buffer {
      try {
        return Buffer.from(
          execFileSync("security", ["find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
          }).trim(),
          "base64",
        );
      } catch (error) {
        // 見つからない以外を「無い」と読まない。読むと、鍵を作り直して既存の
        // 認証状態を全て復号不能にする。改ざんの発覚も遅れる。
        if (exitCodeOf(error) !== NOT_FOUND) {
          throw new KeystoreError("OS キーストアから鍵を読めませんでした");
        }
      }

      const key = generateKey();
      const encoded = key.toString("base64");
      try {
        execFileSync("security", ["add-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"], {
          input: `${encoded}\n${encoded}\n`,
          stdio: ["pipe", "ignore", "ignore"],
        });
      } catch {
        // 鍵を置けないまま暗号化しない。置けなければ次回に復号できない。
        throw new KeystoreError("OS キーストアへ鍵を保存できませんでした");
      }
      return key;
    },
  };
}

/**
 * 未対応のプラットフォーム。
 *
 * **ファイルへ退避しない。** 退避すると暗号文と鍵が同じディスクに並び、
 * 暗号化が守っているものが無くなる。
 */
function unsupported(platform: string): Keystore {
  return {
    loadOrCreate(): never {
      throw new KeystoreError(
        `このプラットフォーム (${platform}) の OS キーストアにまだ対応していません`,
      );
    },
  };
}

export function createKeystore(platform: string = process.platform): Keystore {
  // 鍵は 1 プロセスで 1 度だけ取り出す。キーストアの呼び出しは遅く、環境に
  // よっては都度ダイアログが出る。
  let cached: Buffer | undefined;
  const backend = platform === "darwin" ? macKeychain() : unsupported(platform);
  return {
    loadOrCreate(): Buffer {
      cached ??= backend.loadOrCreate();
      return cached;
    },
  };
}
