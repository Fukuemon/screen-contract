import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { StartupAbort } from "./abort.js";
import { runStartupChecks, type StartupCheckInput } from "./checks.js";
import { loadProductConfig } from "./config.js";
import {
  isProcessAlive,
  readRuntimeFile,
  removeRuntimeFile,
  runtimeFilePath,
  writeRuntimeFile,
} from "../runtime/runtime-file.js";
import { ensureStateDir, resolveStateDir } from "./state-dir.js";
import { generateLocalToken } from "./token.js";

// pid の上限 (Linux は /proc/sys/kernel/pid_max、macOS は 99999) を超えるため、
// この pid のプロセスは存在しえない。ESRCH で「死んでいる」と判定される。
const UNREACHABLE_PID = 0x7fff_fffe;

const created: string[] = [];

function tempDir(mode = 0o700): string {
  const dir = mkdtempSync(join(tmpdir(), "sc-startup-"));
  chmodSync(dir, mode);
  created.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function checkInput(overrides: Partial<StartupCheckInput> = {}): StartupCheckInput {
  return {
    stateDir: tempDir(),
    forbiddenRoots: [],
    isBrowserAvailable: () => true,
    allowedOrigins: ["http://127.0.0.1:5173"],
    browserInstallCommand: "pnpm browser:install",
    productConfigName: "screen-contract.config.json",
    ...overrides,
  };
}

function expectAbort(run: () => unknown): StartupAbort {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(StartupAbort);
    return error as StartupAbort;
  }
  // 検査そのものが消えたときに緑にならないよう、到達したら失敗させる。
  expect.unreachable("中止しなかった");
}

describe("runStartupChecks", () => {
  it("3 件すべてを満たせば解決済みの置き場を返す", () => {
    // macOS の /var は /private/var への symlink であり、戻り値は解決後になる。
    // 呼び出し側がこの戻り値だけを使うことで、検査したパスと書き込むパスが揃う。
    const input = checkInput();
    expect(runStartupChecks(input)).toBe(realpathSync(input.stateDir));
  });

  it("ブラウザ本体が使えなければ単独で中止し、導入コマンドを案内する", () => {
    const abort = expectAbort(() =>
      runStartupChecks(checkInput({ isBrowserAvailable: () => false })),
    );
    expect(abort.reason).toContain("ブラウザ本体");
    expect(abort.remedy).toContain("pnpm browser:install");
  });

  it("origin の列挙が空なら単独で中止し、設定への追記を案内する", () => {
    // 既定が空であること自体が安全装置であり、fixture の origin を既定値にしない。
    const abort = expectAbort(() => runStartupChecks(checkInput({ allowedOrigins: [] })));
    expect(abort.reason).toContain("origin");
    expect(abort.remedy).toContain("allowedOrigins");
  });

  it("生きたプロセスを指す接続先ファイルがあれば単独で中止し、停止対象を案内する", () => {
    const stateDir = tempDir();
    writeRuntimeFile(stateDir, {
      address: "127.0.0.1",
      port: 1234,
      token: "t",
      pid: process.pid,
    });
    const abort = expectAbort(() => runStartupChecks(checkInput({ stateDir })));
    expect(abort.reason).toContain("二重起動");
    expect(abort.remedy).toContain(String(process.pid));
  });

  it("死んだプロセスを指す接続先ファイルは二重起動としない", () => {
    const stateDir = tempDir();
    writeRuntimeFile(stateDir, {
      address: "127.0.0.1",
      port: 1234,
      token: "t",
      pid: UNREACHABLE_PID,
    });
    expect(() => runStartupChecks(checkInput({ stateDir }))).not.toThrow();
  });

  it("置き場の検証を最初に行う (ブラウザが使えても中止する)", () => {
    // 置き場を通してから他を見る。順序が逆だと、検証していない場所へ
    // 接続先ファイルを読み書きしうる。
    const repo = tempDir();
    const inside = join(repo, "state");
    mkdirSync(inside, { mode: 0o700 });
    const abort = expectAbort(() =>
      runStartupChecks(checkInput({ stateDir: inside, forbiddenRoots: [repo] })),
    );
    expect(abort.reason).toContain("リポジトリ");
  });
});

describe("runtime.json", () => {
  it("0600 で書き、読み戻せる", () => {
    const stateDir = tempDir();
    const value = { address: "127.0.0.1", port: 51234, token: "abc", pid: process.pid };
    writeRuntimeFile(stateDir, value);
    expect(statSync(runtimeFilePath(stateDir)).mode & 0o777).toBe(0o600);
    expect(readRuntimeFile(stateDir)).toEqual(value);
  });

  it("削除できる", () => {
    const stateDir = tempDir();
    writeRuntimeFile(stateDir, { address: "127.0.0.1", port: 1, token: "a", pid: process.pid });
    removeRuntimeFile(stateDir);
    expect(readRuntimeFile(stateDir)).toBeUndefined();
  });

  it("一時ファイルを残さない", () => {
    const stateDir = tempDir();
    writeRuntimeFile(stateDir, { address: "127.0.0.1", port: 1, token: "a", pid: process.pid });
    expect(readFileSync(runtimeFilePath(stateDir), "utf8")).toContain("127.0.0.1");
  });

  it("既にある緩い権限のファイルを rename で置き換え、権限を持ち越さない", () => {
    // 最終パスを直接開かない。既存ファイルの権限が残ると secret が他利用者に読める。
    const stateDir = tempDir();
    const path = runtimeFilePath(stateDir);
    writeFileSync(path, "{}", { mode: 0o644 });
    chmodSync(path, 0o644);
    writeRuntimeFile(stateDir, { address: "127.0.0.1", port: 1, token: "a", pid: process.pid });
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it("無いファイルを読んでも例外にしない", () => {
    expect(readRuntimeFile(tempDir())).toBeUndefined();
  });

  it.each([
    ["項目が欠けている", { address: "127.0.0.1" }],
    ["ループバック以外の address", { address: "10.0.0.1", port: 1, token: "a", pid: 1 }],
    ["範囲外の port", { address: "127.0.0.1", port: 0, token: "a", pid: 1 }],
    ["整数でない port", { address: "127.0.0.1", port: 1.5, token: "a", pid: 1 }],
    ["空のトークン", { address: "127.0.0.1", port: 1, token: "", pid: 1 }],
    // pid 0 と負値はプロセスグループを指す。kill(0, 0) は必ず成功して
    // 「生存」と誤判定され、常に二重起動で起動できなくなる。
    ["pid が 0", { address: "127.0.0.1", port: 1, token: "a", pid: 0 }],
    ["pid が負値", { address: "127.0.0.1", port: 1, token: "a", pid: -1 }],
    ["pid が整数でない", { address: "127.0.0.1", port: 1, token: "a", pid: 1.5 }],
  ])("規則に合わない接続先ファイルを拒否する: %s", (_name, value) => {
    const stateDir = tempDir();
    writeFileSync(runtimeFilePath(stateDir), JSON.stringify(value));
    expectAbort(() => readRuntimeFile(stateDir));
  });

  it("壊れた接続先ファイルの案内に中身を含めない", () => {
    // 中身はトークンそのものである。例外の文言と stack trace は端末とログに残る。
    const stateDir = tempDir();
    const token = "9f2a1c4e8b7d6a5f3e2d1c0b9a8f7e6d";
    writeFileSync(runtimeFilePath(stateDir), `{"token":"${token}",`);
    const abort = expectAbort(() => readRuntimeFile(stateDir));
    expect(abort.message).not.toContain(token);
  });

  it("自分のプロセスを生存と判定し、0 と負値は生存としない", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
    expect(isProcessAlive(0)).toBe(false);
    expect(isProcessAlive(-1)).toBe(false);
    expect(isProcessAlive(UNREACHABLE_PID)).toBe(false);
  });
});

describe("ensureStateDir", () => {
  it("0700 でリポジトリ外なら解決済みパスを返す", () => {
    const dir = tempDir();
    expect(ensureStateDir({ stateDir: dir, forbiddenRoots: [tempDir()] })).toContain("sc-startup-");
  });

  it("未作成なら 0700 で作る", () => {
    // 初回起動は必ずこの経路を通る。作らずに検査すると生の ENOENT で落ちる。
    const dir = join(tempDir(), "deep", "state");
    ensureStateDir({ stateDir: dir, forbiddenRoots: [] });
    expect(statSync(dir).mode & 0o777).toBe(0o700);
  });

  it("相対パスを拒否する", () => {
    expectAbort(() => ensureStateDir({ stateDir: "./state", forbiddenRoots: [] }));
  });

  it("権限が緩ければ拒否する", () => {
    const dir = tempDir(0o755);
    expectAbort(() => ensureStateDir({ stateDir: dir, forbiddenRoots: [] }));
  });

  it("リポジトリ配下を拒否する", () => {
    const repo = tempDir();
    const inside = join(repo, "state");
    mkdirSync(inside, { mode: 0o700 });
    expectAbort(() => ensureStateDir({ stateDir: inside, forbiddenRoots: [repo] }));
  });

  it("symlink でリポジトリ外を装っても拒否する", () => {
    // 文字列の検査だけでは symlink で外へ出られる。解決後のパスで判定する。
    const repo = tempDir();
    const inside = join(repo, "state");
    mkdirSync(inside, { mode: 0o700 });
    const link = join(tempDir(), "link");
    symlinkSync(inside, link);
    expectAbort(() => ensureStateDir({ stateDir: link, forbiddenRoots: [repo] }));
  });

  it("拒否の案内に入力値そのものを含めない", () => {
    const abort = expectAbort(() =>
      ensureStateDir({ stateDir: "relative/path", forbiddenRoots: [] }),
    );
    expect(abort.message).not.toContain("relative/path");
  });
});

describe("resolveStateDir", () => {
  it("XDG_STATE_HOME を使う", () => {
    expect(resolveStateDir("/x/state", "/home/u")).toBe("/x/state/screen-contract");
  });

  it("未設定なら XDG の既定へ落ちる", () => {
    expect(resolveStateDir(undefined, "/home/u")).toBe("/home/u/.local/state/screen-contract");
    expect(resolveStateDir("", "/home/u")).toBe("/home/u/.local/state/screen-contract");
  });

  it("正規化してから返す", () => {
    // 文字列連結のままだと、正規化前提の比較 (リポジトリ配下の判定) をすり抜ける。
    expect(resolveStateDir("/tmp/../home/u/state", "/home/u")).toBe(
      "/home/u/state/screen-contract",
    );
  });

  it("相対パスを絶対化しない", () => {
    // 絶対化すると実行ディレクトリ次第で置き場が変わる。契約が禁じた挙動を
    // こちらで作り込まないよう、相対のまま渡して ensureStateDir に弾かせる。
    const relative = resolveStateDir("relative", "/home/u");
    expect(relative).toBe("relative/screen-contract");
    expectAbort(() => ensureStateDir({ stateDir: relative, forbiddenRoots: [] }));
  });
});

describe("loadProductConfig", () => {
  it("ファイルが無ければ列挙は空", () => {
    expect(loadProductConfig(join(tempDir(), "absent.json"))).toEqual({ allowedOrigins: [] });
  });

  it("allowedOrigins を読む", () => {
    const path = join(tempDir(), "config.json");
    writeFileSync(path, JSON.stringify({ allowedOrigins: ["http://127.0.0.1:5173"] }));
    expect(loadProductConfig(path)).toEqual({ allowedOrigins: ["http://127.0.0.1:5173"] });
  });

  it.each([
    ["文字列でない要素", { allowedOrigins: [1] }],
    ["配列でない", { allowedOrigins: "http://127.0.0.1:5173" }],
    ["空文字", { allowedOrigins: [""] }],
    ["ワイルドカード", { allowedOrigins: ["*"] }],
    // 比較が前方一致で書かれたときに、意図より広い範囲を許してしまう。
    ["パス付き", { allowedOrigins: ["http://127.0.0.1:5173/app"] }],
    ["末尾スラッシュ", { allowedOrigins: ["http://127.0.0.1:5173/"] }],
    ["scheme が http / https でない", { allowedOrigins: ["file:///etc"] }],
  ])("origin として解釈できない列挙を拒否する: %s", (_name, value) => {
    const path = join(tempDir(), "config.json");
    writeFileSync(path, JSON.stringify(value));
    expectAbort(() => loadProductConfig(path));
  });

  it("読めないことを「無い」と同一視しない", () => {
    // 権限不足を空扱いにすると、既に列挙済みでも「追記してください」と案内が出る。
    const dir = tempDir();
    expectAbort(() => loadProductConfig(dir));
  });
});

describe("ローカルトークン", () => {
  it("32 バイト以上を生成し、毎回変わる", () => {
    const a = generateLocalToken();
    expect(a).toHaveLength(64);
    expect(a).not.toBe(generateLocalToken());
  });
});

describe("待受ポートの設定", () => {
  /** 設定を書いて読み直す。 */
  function load(config: Record<string, unknown>) {
    const path = join(tempDir(), `port-${String(Math.abs(JSON.stringify(config).length))}.json`);
    writeFileSync(path, JSON.stringify(config));
    return loadProductConfig(path);
  }

  it("省略すると OS に割り当てさせる", () => {
    // 既定は割り当てさせる側である。固定すると他のアプリと衝突する。
    expect(load({ allowedOrigins: [] }).port).toBeUndefined();
  });

  it("指定した番号を返す", () => {
    expect(load({ allowedOrigins: [], port: 5900 }).port).toBe(5900);
  });

  it.each([
    ["特権ポート", 80],
    ["範囲外", 70_000],
    ["0", 0],
    ["負", -1],
    ["小数", 5900.5],
    ["文字列", "5900"],
  ])("%s を拒否する", (_label, port) => {
    // 使えない番号を通すと、起動時ではなく listen の失敗として現れる。
    expect(() => load({ allowedOrigins: [], port })).toThrow(StartupAbort);
  });
});
