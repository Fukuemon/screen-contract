import { execFileSync } from "node:child_process";
import { generateKey } from "./sealed.js";

/**
 * 暗号鍵の置き場。
 *
 * **鍵は OS のキーストアにのみ置く** (context/infrastructure.md)。ファイルへ
 * 書くと、暗号化した意味が無くなる (同じディレクトリに鍵と暗号文が並ぶ)。
 */

/** キーストアの識別子。契約で固定されている。 */
const SERVICE = "screen-contract";
const ACCOUNT = "storage-state-key";

export interface Keystore {
  /** 無ければ作って返す。**呼ぶたびに作り直さない。** */
  loadOrCreate(): Buffer;
}

export class KeystoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeystoreError";
  }
}

/** macOS Keychain。`security` は標準で入っている。 */
function macKeychain(): Keystore {
  return {
    loadOrCreate(): Buffer {
      try {
        const found = execFileSync(
          "security",
          ["find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"],
          { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
        ).trim();
        if (found.length > 0) {
          return Buffer.from(found, "base64");
        }
      } catch {
        // 見つからないときも非 0 で返る。作成へ進む。
      }
      const key = generateKey();
      try {
        execFileSync(
          "security",
          [
            "add-generic-password",
            "-s",
            SERVICE,
            "-a",
            ACCOUNT,
            "-w",
            key.toString("base64"),
            "-U",
          ],
          { stdio: ["ignore", "ignore", "ignore"] },
        );
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
 * **ファイルへ退避しない。** 退避すると、暗号文と鍵が同じディスクに並び、
 * 暗号化が守っているものが無くなる。認証プロファイルの機能だけを使えなくする。
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
  // 鍵は 1 プロセスで 1 度だけ取り出す。キーストアの呼び出しは遅く、
  // 環境によっては都度ダイアログが出る。
  let cached: Buffer | undefined;
  const backend = platform === "darwin" ? macKeychain() : unsupported(platform);
  return {
    loadOrCreate(): Buffer {
      cached ??= backend.loadOrCreate();
      return cached;
    },
  };
}
