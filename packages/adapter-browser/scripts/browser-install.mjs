#!/usr/bin/env node
// ブラウザ本体 (Chrome for Testing) を版指定で取得する。
//
// postinstall では取得しない (ADR-0027)。数百 MB のダウンロードが pnpm install に
// 入ると、CI・オフライン・プロキシ配下で install 全体が壊れる。利用者の 1 回の
// 明示操作とし、起動時検査が未取得を検出してこのコマンドを案内する。
//
// 版と置き場は起動時検査と同じ chrome-version.json から読む。二重定義にすると、
// 取得したのに検査が失敗し続ける状態が作れてしまう。
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Browser, install } from "@puppeteer/browsers";

const BUILD_ID = /^\d+(?:\.\d+){3}$/;

const versionFile = new URL("../chrome-version.json", import.meta.url);
const { buildId, cacheDir: relativeCacheDir } = JSON.parse(readFileSync(versionFile, "utf8"));

if (typeof buildId !== "string" || !BUILD_ID.test(buildId)) {
  throw new Error("chrome-version.json の buildId が版の形式ではありません");
}
if (
  typeof relativeCacheDir !== "string" ||
  relativeCacheDir.length === 0 ||
  relativeCacheDir.includes("..")
) {
  throw new Error("chrome-version.json の cacheDir が相対パスの形式ではありません");
}

const cacheDir = join(homedir(), relativeCacheDir);
const installed = await install({
  browser: Browser.CHROME,
  buildId,
  cacheDir,
  // 数百 MB のダウンロードで無反応にしない。自作のコールバックは既定の進捗表示より劣る。
  downloadProgressCallback: "default",
});

process.stderr.write(`Chrome for Testing ${buildId} を取得しました: ${installed.executablePath}\n`);
