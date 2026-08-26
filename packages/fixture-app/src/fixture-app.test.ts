import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startFixtureApp, type FixtureApp } from "./index.js";

const opened: FixtureApp[] = [];
const created: string[] = [];

async function start(): Promise<FixtureApp> {
  const app = await startFixtureApp();
  opened.push(app);
  return app;
}

afterEach(async () => {
  for (const app of opened.splice(0)) {
    await app.close();
  }
  for (const path of created.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("startFixtureApp", () => {
  it("OS が割り当てたポートで配信し、HTML を返す", async () => {
    const app = await start();
    expect(app.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    const response = await fetch(app.origin);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("設定を開く");
  });

  it("操作対象を role が読める要素として持つ", async () => {
    // 文字列の出現回数だけを見ると、button を div に変えても緑のままになる。
    // 一意に解決できることの本当の確認は agent-browser を実起動する統合層で行う。
    const html = await (await fetch((await start()).origin)).text();
    expect(html).toContain('<button type="button" id="open-settings"');
    expect(html).toContain('<dialog id="settings" aria-label="設定">');
    expect(html).toContain('<button type="button" id="close-settings"');
  });

  it("同じ accessible name の操作要素を 2 つ置かない", async () => {
    const html = await (await fetch((await start()).origin)).text();
    expect(html.match(/>設定を開く</g)).toHaveLength(1);
    expect(html.match(/>閉じる</g)).toHaveLength(1);
  });

  it("外部リソースを参照しない", async () => {
    // 読み込み順や通信の有無で状態が変わると、こちらの変更と相手の変更を
    // 区別できなくなる。
    const html = await (await fetch((await start()).origin)).text();
    expect(html).not.toMatch(/<(?:link|img|iframe|object|embed)\b/i);
    expect(html).not.toMatch(/<script[^>]*\ssrc=/i);
    expect(html).not.toContain("//cdn");
    expect(html).not.toMatch(/@import/i);
  });

  it("同時に 2 つ立てても両方が配信する", async () => {
    const first = await start();
    const second = await start();
    expect(second.origin).not.toBe(first.origin);
    expect((await fetch(first.origin)).status).toBe(200);
    expect((await fetch(second.origin)).status).toBe(200);
  });

  it("閉じると接続を拒否する", async () => {
    const app = await start();
    const origin = app.origin;
    await app.close();
    await expect(fetch(origin)).rejects.toMatchObject({
      cause: expect.objectContaining({ code: "ECONNREFUSED" }),
    });
  });

  it("二重に閉じても失敗しない", async () => {
    // 後始末は afterEach と個別の finally の両方から呼ばれうる。
    const app = await start();
    await app.close();
    await expect(app.close()).resolves.toBeUndefined();
  });

  it.each([
    // URL の正規化は `..` と `%2e%2e` を潰すため、これらはサーバへ届く前に
    // `/package.json` になる。区切りまで符号化した形だけが正規化を通過し、
    // 配信範囲の判定へ到達する。
    ["符号化した区切りを含む親ディレクトリ", "/%2e%2e%2f%2e%2e%2fpackage.json"],
    ["符号化した区切りで repo ルートへ", "/%2e%2e%2f%2e%2e%2f%2e%2e%2fknip.json"],
  ])("配信範囲の外を読み出させない: %s", async (_name, path) => {
    const response = await fetch(`${(await start()).origin}${path}`);
    expect(response.status).toBe(404);
  });

  it("symlink で配信範囲の外へ出させない", async () => {
    // path.resolve は字句の正規化しか行わない。実体パスで判定しないと、
    // 配信ディレクトリに外を指すリンクが 1 本あれば任意のファイルを配信できる。
    const outside = mkdtempSync(join(tmpdir(), "sc-fixture-"));
    created.push(outside);
    writeFileSync(join(outside, "secret.html"), "<html>secret</html>");
    const publicDir = fileURLToPath(new URL("../public/base/", import.meta.url));
    const link = join(publicDir, "escape.html");
    created.push(link);
    symlinkSync(join(outside, "secret.html"), link);

    const response = await fetch(`${(await start()).origin}/escape.html`);
    expect(response.status).toBe(404);
  });

  it("扱わない拡張子を配信しない", async () => {
    // 拡張子の判定を存在確認より先に置く。後ろに置くと 404 に隠れて
    // この分岐へ到達せず、テストが理由違いで通る。
    const publicDir = fileURLToPath(new URL("../public/base/", import.meta.url));
    const path = join(publicDir, "note.txt");
    created.push(path);
    writeFileSync(path, "text");
    expect((await fetch(`${(await start()).origin}/note.txt`)).status).toBe(415);
  });
});
