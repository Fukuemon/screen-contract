import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { arch, platform } from "node:os";
import { promisify } from "node:util";
import { AgentBrowserError } from "./error.js";

/**
 * agent-browser の CLI を子プロセスとして呼ぶ。
 *
 * **ネイティブバイナリを直接 spawn する。** 同梱の JS wrapper 経由は呼び出し
 * ごとに node の起動が挟まり、実測で 1 回あたり約 94ms の差が出る。記録も実行も
 * 1 操作で複数回呼ぶため、差が回数に比例して効く ([adr/0027](../../../adr/0027-agent-browser-bundling.md))。
 *
 * **引数は配列で渡す。** 文字列を連結してシェルに解釈させない。
 */

const execFileAsync = promisify(execFile);

/** agent-browser が配布するバイナリの命名。musl は libc の実装で分かれる。 */
function binaryName(): string {
  const cpu = arch() === "arm64" ? "arm64" : "x64";
  switch (platform()) {
    case "darwin":
      return `agent-browser-darwin-${cpu}`;
    case "win32":
      // Windows ARM64 向けのビルドは無く、x64 が emulation で動く。
      return "agent-browser-win32-x64.exe";
    case "linux":
      return isMusl() ? `agent-browser-linux-musl-${cpu}` : `agent-browser-linux-${cpu}`;
    default:
      throw new Error(`このプラットフォーム向けの実行基盤がありません: ${platform()}`);
  }
}

/** Alpine 等の musl 環境では別のバイナリが要る。 */
function isMusl(): boolean {
  const report = process.report?.getReport();
  if (typeof report !== "object" || report === null) {
    return false;
  }
  const header = (report as { header?: { glibcVersionRuntime?: unknown } }).header;
  // glibc の版が取れないときは musl とみなす。取れる環境では必ず入っている。
  return header?.glibcVersionRuntime === undefined;
}

export function resolveCliPath(): string {
  // pnpm は依存を隔離して置くため、リポジトリルートからの相対では解決できない。
  // 本 package の位置から module 解決に任せる。agent-browser は exports を
  // 持たず bin だけを公開するため、bin の実体を直接指す。
  const require = createRequire(import.meta.url);
  let path: string;
  try {
    path = require.resolve(`agent-browser/bin/${binaryName()}`);
  } catch {
    throw new Error("実行基盤のバイナリが見つかりません。pnpm install を実行してください");
  }
  if (!existsSync(path)) {
    throw new Error("実行基盤のバイナリが見つかりません。pnpm install を実行してください");
  }
  return path;
}

export interface CliOptions {
  readonly cliPath: string;
  /** ブラウザ本体の実行ファイル。常に明示する。自動検出に任せない。 */
  readonly executablePath: string;
  /** セッション名。run ごとに分ける。 */
  readonly session: string;
  /** state と socket を隔離する名前。テストが利用者の状態を触らないようにする。 */
  readonly namespace: string | undefined;
}

/** `--json` の応答。成功か失敗かは success で判別する。 */
export interface CliResponse {
  readonly success: boolean;
  readonly data: unknown;
  readonly error: string | null;
}

export async function runCli(options: CliOptions, args: readonly string[]): Promise<CliResponse> {
  const base = [
    "--session",
    options.session,
    "--executable-path",
    options.executablePath,
    "--json",
  ];
  if (options.namespace !== undefined) {
    base.push("--namespace", options.namespace);
  }
  try {
    const { stdout } = await execFileAsync(options.cliPath, [...base, ...args], {
      maxBuffer: 64 * 1024 * 1024,
    });
    return parseCliResponse(stdout);
  } catch (error) {
    // CLI は失敗時に非ゼロで終了するが、`--json` の応答は標準出力へ出ている。
    // 例外をそのまま投げると、失敗の理由が実行基盤の終了コードに化けて
    // 呼び出し側が構造化エラーへ写せない。
    const stdout = (error as { stdout?: unknown }).stdout;
    if (typeof stdout === "string" && stdout.length > 0) {
      return parseCliResponse(stdout);
    }
    throw new AgentBrowserError("browser/unresponsive", "実行基盤の呼び出しに失敗しました", {
      cause: error,
    });
  }
}

export function parseCliResponse(stdout: string): CliResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    // 応答の中身をそのまま例外へ載せない。ページの内容やトークンが混ざりうる。
    throw new Error("実行基盤の応答を JSON として読めません");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("実行基盤の応答がオブジェクトではありません");
  }
  const { success, data, error } = parsed as Record<string, unknown>;
  if (typeof success !== "boolean") {
    throw new Error("実行基盤の応答に success がありません");
  }
  return {
    success,
    data: data ?? null,
    error: typeof error === "string" ? error : null,
  };
}
