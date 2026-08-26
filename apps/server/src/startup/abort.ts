/**
 * 起動を中止する理由と対処。
 *
 * **満たさなければ理由と対処を出して中止する** (context/infrastructure.md)。
 * 起動してから実行時に失敗させない。実行の途中で落ちると、どこまで進んだかの
 * 後始末が要る。起動時なら何も始まっていない。
 *
 * 文言に**入力値そのものを含めない** (context/testing.md の負例テスト)。
 * 置き場のパスや接続先ファイルの中身は secret を含み、これらは端末とログへ残る。
 */
export class StartupAbort extends Error {
  constructor(
    readonly reason: string,
    readonly remedy: string,
  ) {
    super(`${reason}\n対処: ${remedy}`);
    this.name = "StartupAbort";
  }
}
