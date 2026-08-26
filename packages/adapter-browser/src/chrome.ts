import { accessSync, constants, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Browser, computeExecutablePath, detectBrowserPlatform } from "@puppeteer/browsers";

/**
 * ブラウザ本体 (Chrome for Testing) の版と置き場を解決する。
 *
 * 版を固定するのは、ブラウザが更新されると描画が変わり画像差分に出るためである
 * (ADR-0027)。実行時は必ずここで解決したパスを明示し、実行基盤の自動検出に
 * 任せない。任せるとシステムの Chrome が使われ、どの版で撮ったかが記録に残らない。
 *
 * 「ブラウザ本体が使えるか」の定義も本 adapter が持つ。合成ルートは結果を
 * 受け取るだけで、置き場や版の解決規則を知らない (context/architecture.md)。
 */

const VERSION_FILE_URL = new URL("../chrome-version.json", import.meta.url);

// Chrome for Testing の build id は 4 つの数値。実行するバイナリの path を
// 決める値であるため、`../` を含む値でキャッシュ外を指されないよう完全一致で絞る。
const BUILD_ID = /^\d+(?:\.\d+){3}$/;

export interface ChromeInstall {
  readonly buildId: string;
  readonly cacheDir: string;
  readonly executablePath: string;
}

function readVersionFile(): { buildId: string; cacheDir: string } {
  const raw = readFileSync(fileURLToPath(VERSION_FILE_URL), "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("ブラウザ本体の版ファイルがオブジェクトではありません");
  }
  const { buildId, cacheDir } = parsed as { buildId?: unknown; cacheDir?: unknown };
  if (typeof buildId !== "string" || !BUILD_ID.test(buildId)) {
    throw new Error("ブラウザ本体の版ファイルの buildId が版の形式ではありません");
  }
  if (typeof cacheDir !== "string" || cacheDir.length === 0 || cacheDir.includes("..")) {
    throw new Error("ブラウザ本体の版ファイルの cacheDir が相対パスの形式ではありません");
  }
  return { buildId, cacheDir };
}

export function resolveChromeInstall(home: string): ChromeInstall {
  const { buildId, cacheDir: relativeCacheDir } = readVersionFile();
  const platform = detectBrowserPlatform();
  if (platform === undefined) {
    throw new Error("このプラットフォーム向けのブラウザ本体を解決できません");
  }
  const cacheDir = join(home, relativeCacheDir);
  return {
    buildId,
    cacheDir,
    executablePath: computeExecutablePath({ browser: Browser.CHROME, buildId, cacheDir, platform }),
  };
}

/**
 * **存在するだけでは足りない。** 取得が途中で中断すると 0 バイトのファイルや
 * ディレクトリが残る。実行できることまで確かめないと、起動は通って最初の run で落ちる。
 */
export function isChromeAvailable(executablePath: string): boolean {
  try {
    if (!statSync(executablePath).isFile()) {
      return false;
    }
    accessSync(executablePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
