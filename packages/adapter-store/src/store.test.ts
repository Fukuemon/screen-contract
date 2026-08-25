import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StoreKey } from "@screen-contract/app";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFsStore } from "./index.js";

/**
 * adapter は Port の**型**だけを参照でき、app の実行時の値を import できない
 * (context/architecture.md の `adapter-only-port-types`)。鍵の検証そのものは
 * app 側の負例テスト (`packages/app/src/store-key.test.ts`) が持つ。ここは
 * 検証を通った鍵を受けた adapter の振る舞いだけを見る。
 */
function key(raw: string): StoreKey {
  return raw as StoreKey;
}

let root: string;
let outside: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "sc-store-"));
  outside = mkdtempSync(join(tmpdir(), "sc-outside-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

const KEY = key("screens/login");

describe("draft と正本の分離", () => {
  it("別のディレクトリへ保存する", async () => {
    // 同一ファイルの版として持つと、分離が実装の約束にしかならない (ADR-0017)。
    const store = createFsStore({ root });
    await store.save("draft", KEY, "draft の内容");
    await store.save("authoritative", KEY, "正本の内容");
    expect(readdirSync(root).sort()).toEqual([".tmp", "authoritative", "drafts"]);
    expect(readFileSync(join(root, "drafts", "screens", "login"), "utf8")).toBe("draft の内容");
    expect(readFileSync(join(root, "authoritative", "screens", "login"), "utf8")).toBe(
      "正本の内容",
    );
  });

  it("正本を書いても draft を上書きしない", async () => {
    const store = createFsStore({ root });
    await store.save("draft", KEY, "draft の内容");
    await store.save("authoritative", KEY, "確定した内容");
    expect(await store.load("draft", KEY)).toBe("draft の内容");
  });

  it("片方に無いものをもう片方から読まない", async () => {
    const store = createFsStore({ root });
    await store.save("draft", KEY, "draft の内容");
    expect(await store.load("authoritative", KEY)).toBeUndefined();
  });

  it("保存していない鍵は undefined を返す", async () => {
    expect(await createFsStore({ root }).load("draft", KEY)).toBeUndefined();
  });

  it("読み取りでディレクトリを作らない", async () => {
    await createFsStore({ root }).load("draft", KEY);
    expect(readdirSync(root)).toEqual([]);
  });

  it("上書き保存で一時ファイルを残さない", async () => {
    const store = createFsStore({ root });
    await store.save("draft", KEY, "1 回目");
    await store.save("draft", KEY, "2 回目");
    expect(await store.load("draft", KEY)).toBe("2 回目");
    expect(readdirSync(join(root, "drafts", "screens"))).toEqual(["login"]);
    // 一時ファイルは鍵の名前空間と重ならない場所へ置き、書き終えたら消す。
    expect(readdirSync(join(root, ".tmp"))).toEqual([]);
  });

  it("実行履歴を正本とも draft とも別の置き場へ入れる", async () => {
    // 混ぜると、鍵を合わせた run.start が承認を経ずに正本を上書きできる。
    const store = createFsStore({ root });
    await store.save("history", KEY, "snapshot");
    expect(await store.load("authoritative", KEY)).toBeUndefined();
    expect(await store.load("draft", KEY)).toBeUndefined();
    expect(await store.load("history", KEY)).toBe("snapshot");
  });

  it("保存したファイルを 0600 で作る", async () => {
    await createFsStore({ root }).save("draft", KEY, "x");
    expect(statSync(join(root, "drafts", "screens", "login")).mode & 0o777).toBe(0o600);
  });

  it("大きな内容も全量書き切る", async () => {
    // writeSync の返り値を捨てると、部分書き込みが原子的に正本になる。
    const store = createFsStore({ root });
    const big = "あ".repeat(2_000_000);
    await store.save("draft", KEY, big);
    expect(await store.load("draft", KEY)).toBe(big);
  });

  it("保存先を 0700 で作る", async () => {
    await createFsStore({ root }).save("draft", KEY, "x");
    expect(statSync(join(root, "drafts")).mode & 0o777).toBe(0o700);
  });
});

describe("解決後の格納範囲", () => {
  it("保存ルート内のシンボリックリンク越しに外へ書かない", async () => {
    // 文字列検査だけでは通してしまう。鍵自体は `../` を含まない。
    const store = createFsStore({ root });
    await store.save("draft", key("seed"), "x");
    mkdirSync(join(outside, "target"), { recursive: true });
    symlinkSync(join(outside, "target"), join(root, "drafts", "escape"));
    await expect(store.save("draft", key("escape/pwned"), "x")).rejects.toThrow("保存ルートの外");
    expect(readdirSync(join(outside, "target"))).toEqual([]);
  });

  it("拒否する前にルート外へディレクトリを作らない", async () => {
    const store = createFsStore({ root });
    await store.save("draft", key("seed"), "x");
    mkdirSync(join(outside, "target"), { recursive: true });
    symlinkSync(join(outside, "target"), join(root, "drafts", "escape"));
    await expect(store.save("draft", key("escape/deep/deeper/pwned"), "x")).rejects.toThrow();
    expect(readdirSync(join(outside, "target"))).toEqual([]);
  });

  it("最終要素がシンボリックリンクの draft を読まない", async () => {
    // 保存ルートには runtime.json (トークン) や auth/<profile>.enc が同居する。
    // 辿ると `drafts/leak -> ../runtime.json` でトークンを読み出せる。
    const store = createFsStore({ root });
    await store.save("draft", key("seed"), "x");
    writeFileSync(join(root, "secret"), "トークン");
    symlinkSync(join(root, "secret"), join(root, "drafts", "leak"));
    await expect(store.load("draft", key("leak"))).rejects.toThrow("保存ルートの外");
  });

  it("シンボリックリンク越しの読み取りも拒否する", async () => {
    const store = createFsStore({ root });
    await store.save("draft", key("seed"), "x");
    mkdirSync(join(outside, "target"), { recursive: true });
    writeFileSync(join(outside, "target", "secret"), "秘密");
    symlinkSync(join(outside, "target"), join(root, "drafts", "escape"));
    await expect(store.load("draft", key("escape/secret"))).rejects.toThrow("保存ルートの外");
  });

  it("例外メッセージに絶対パスと鍵を含めない", async () => {
    // Node の ErrnoException は利用者名を含む絶対パスを載せる。
    const store = createFsStore({ root });
    await store.save("draft", key("seed"), "x");
    mkdirSync(join(outside, "target"), { recursive: true });
    symlinkSync(join(outside, "target"), join(root, "drafts", "escape"));
    await expect(store.save("draft", key("escape/pwned"), "x")).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining(outside) as unknown as string,
      }),
    );
  });

  it("ルート自体がシンボリックリンクでも通常どおり保存できる", async () => {
    // realpath はルート側にも掛ける。掛けないと、ルートを symlink にした
    // 環境で常に「外」と判定されて何も保存できない。
    const link = join(outside, "link-to-root");
    symlinkSync(root, link);
    const store = createFsStore({ root: link });
    await store.save("draft", KEY, "x");
    expect(await store.load("draft", KEY)).toBe("x");
  });
});
