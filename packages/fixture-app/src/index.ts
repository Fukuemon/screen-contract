import { createReadStream, realpathSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

/**
 * テストが操作する対象アプリを静的 HTTP で配信する。
 *
 * 内容を固定し、外部サイトを対象にしない ([context/testing.md](../../../context/testing.md) の
 * 「fixture 対象アプリ」)。固定するのは再現性・決定性を最優先とするためで、
 * 外部サイトだとこちらの変更と相手の変更を区別できない。
 */

export interface FixtureApp {
  /** 対象アプリの origin。`url` の Expectation はこの下の path で書ける。 */
  readonly origin: string;
  /** 何度呼んでも安全。後始末が二重に走っても失敗しない。 */
  close(): Promise<void>;
}

// 実際に配信するファイルの拡張子だけを持つ。使うものが増えた時点で足す。
const CONTENT_TYPES = new Map([[".html", "text/html; charset=utf-8"]]);

/** 末尾に区切りを含む実体パス。配信範囲の前方一致に使う。 */
function documentRoot(): string {
  return realpathSync(fileURLToPath(new URL("../public/base/", import.meta.url)));
}

/**
 * 配信範囲の外を指す要求を弾く。
 *
 * 字句の正規化だけでは足りない。`path.resolve` は symlink を解決しないため、
 * 配信ディレクトリに外を指すリンクが 1 本あれば任意のファイルを配信できる。
 * 実体パスへ解決してから前方一致で判定する。
 */
function resolveTarget(root: string, pathname: string): string | undefined {
  let relative: string;
  try {
    relative = decodeURIComponent(pathname === "/" ? "/index.html" : pathname).slice(1);
  } catch {
    return undefined;
  }
  try {
    const target = realpathSync(resolve(root, relative));
    return target.startsWith(root) ? target : undefined;
  } catch {
    return undefined;
  }
}

export interface FixtureAppOptions {
  /**
   * 待受ポート。既定は 0 (OS に割り当てさせる)。
   *
   * 手動確認では固定したい。プロダクト設定の `allowedOrigins` へ書く origin が
   * 起動のたびに変わると、確認手順が組めない。
   */
  readonly port?: number | undefined;
}

export async function startFixtureApp(options: FixtureAppOptions = {}): Promise<FixtureApp> {
  const root = documentRoot();

  const server: Server = createServer((request, response) => {
    const requested = new URL(request.url ?? "/", "http://127.0.0.1");
    const target = resolveTarget(root, requested.pathname);
    if (target === undefined) {
      response.writeHead(404).end();
      return;
    }
    const contentType = CONTENT_TYPES.get(extname(target));
    if (contentType === undefined) {
      response.writeHead(415).end();
      return;
    }
    const stat = statSync(target, { throwIfNoEntry: false });
    if (stat === undefined || !stat.isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": contentType });
    // pipe は読み側の失敗を購読せず、下流の破棄も上流へ伝えない。fd が残る。
    void pipeline(createReadStream(target), response).catch(() => {
      response.destroy();
    });
  });

  // 127.0.0.1 のみに bind する。テストの対象アプリを他のマシンから触らせない。
  // ポートは OS に割り当てさせる。固定すると同時に走るテストや他のアプリと衝突する。
  await new Promise<void>((done, fail) => {
    // listen の callback は成功時にしか呼ばれない。error を購読しないと、
    // 失敗が uncaught exception になり呼び出し側からは原因不明の死に見える。
    const onError = (error: Error): void => {
      fail(error);
    };
    server.once("error", onError);
    server.listen(options.port ?? 0, "127.0.0.1", () => {
      server.removeListener("error", onError);
      done();
    });
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("対象アプリの待受アドレスを取得できません");
  }

  let closed = false;
  return {
    origin: `http://127.0.0.1:${String(address.port)}`,
    async close(): Promise<void> {
      if (closed) {
        return;
      }
      closed = true;
      // 接続が残ると close が返らない。テストが終わってもポートが解放されない。
      server.closeAllConnections();
      await new Promise<void>((done, fail) => {
        server.close((error) => {
          if (error === undefined) {
            done();
          } else {
            fail(error);
          }
        });
      });
    },
  };
}
