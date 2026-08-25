import {
  closeSync,
  fstatSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";
import { StartupAbort } from "./abort.js";

/**
 * 待受アドレス・ポート・トークン・プロセス ID を 1 つのファイルへ原子的に置く。
 *
 * 別々に書くと、片方だけ新しい状態を読むクライアントが出る
 * (context/infrastructure.md)。MCP ブリッジと JSON-RPC のクライアントは
 * 別プロセスであり、トークンだけでは接続先が決まらない。
 *
 * **寿命をプロセスに結びつけるのは listen を入れる段である。** 起動時に書き、
 * 終了時に削除する契約だが、ポートは OS に割り当てさせるため、待受アドレスが
 * 決まらないと書けない。ここでは読み書きと削除の手段までを用意し、`exit` /
 * `SIGINT` / `SIGTERM` への結線は listen と同時に行う。
 *
 * **フォーマットの正本は context/infrastructure.md である。** 読む側の
 * `apps/mcp-bridge` は何にも依存しない契約のため、この型と検証を独立に実装する。
 */
export interface RuntimeFile {
  readonly address: string;
  readonly port: number;
  readonly token: string;
  readonly pid: number;
}

/** ループバック以外へ bind しない (ADR-0021)。読み戻しでも表記を絞る。 */
const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);

/**
 * 一時ファイルへ書いてから rename で置き換える。
 *
 * 最終パスを直接開かないのは 2 つの理由による。`"w"` は既存ファイルをその場で
 * 切り詰めるため、書き込み中に落ちると途中まで書かれた JSON が残る。加えて
 * `"w"` は symlink を解決するため、最終パスに symlink を置かれるとトークンが
 * 任意の場所へ書き出される。`"wx"` は新規作成のみで、どちらも起きない。
 */
export function writeRuntimeFile(stateDir: string, value: RuntimeFile): void {
  const path = runtimeFilePath(stateDir);
  const tmp = join(stateDir, `runtime.json.${String(process.pid)}.tmp`);
  const fd = openSync(tmp, "wx", 0o600);
  try {
    // 開いた fd 自身の権限を見る。path 経由の stat は、その間に差し替えられた
    // 別のファイルを見ているかもしれない。
    const mode = fstatSync(fd).mode & 0o777;
    if (mode !== 0o600) {
      throw new StartupAbort(
        "接続先ファイルの権限が 0600 になりません",
        "umask を確認してください",
      );
    }
    writeSync(fd, `${JSON.stringify(value, null, 2)}\n`);
    fsyncSync(fd);
  } catch (error) {
    closeSync(fd);
    rmSync(tmp, { force: true });
    throw error;
  }
  closeSync(fd);
  renameSync(tmp, path);
}

export function runtimeFilePath(stateDir: string): string {
  return join(stateDir, "runtime.json");
}

export function readRuntimeFile(stateDir: string): RuntimeFile | undefined {
  let raw: string;
  try {
    raw = readFileSync(runtimeFilePath(stateDir), "utf8");
  } catch {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 解析エラーをそのまま投げない。中身はトークンであり、例外の文言と
    // stack trace は端末とログに残る。
    throw new StartupAbort(
      "接続先ファイルを解析できません",
      "既存の runtime.json を削除してから起動し直してください",
    );
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new StartupAbort(
      "接続先ファイルがオブジェクトではありません",
      "既存の runtime.json を削除してから起動し直してください",
    );
  }
  const { address, port, token, pid } = parsed as Record<string, unknown>;
  const ok =
    typeof address === "string" &&
    LOOPBACK.has(address) &&
    typeof port === "number" &&
    Number.isInteger(port) &&
    port >= 1 &&
    port <= 65535 &&
    typeof token === "string" &&
    token.length > 0 &&
    typeof pid === "number" &&
    Number.isInteger(pid) &&
    pid > 0;
  if (!ok) {
    throw new StartupAbort(
      "接続先ファイルの内容が規則に合いません",
      "既存の runtime.json を削除してから起動し直してください",
    );
  }
  return { address, port, token, pid };
}

export function removeRuntimeFile(stateDir: string): void {
  rmSync(runtimeFilePath(stateDir), { force: true });
}

/**
 * 残っていてもプロセス ID で生存を確認できる (context/infrastructure.md)。
 *
 * **0 と負値を弾く。** `kill(0, 0)` は自分のプロセスグループを指して必ず成功し、
 * 負値もプロセスグループ指定になる。読み戻し側でも範囲を検証しているが、
 * ここでも弾いておく。シグナルを送る実装が後から入ったときの被害が違う。
 */
export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM は「他利用者のプロセスだが生きている」。生存として扱う。
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
