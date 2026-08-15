import type { StartRunInput, UseCases } from "@screen-contract/app";

/**
 * HTTP 層が公開する操作。
 *
 * use case を戻り値へ出さない。出すと認可の掛け所が無くなり、この値を得た
 * 任意のコードが use case へ直接届く (ADR-0021 は認可を interface 層に閉じると定める)。
 */
export interface ApiApp {
  startRun(input: StartRunInput): Promise<void>;
}

/** listen しない。プロセスにするのは合成ルート (ADR-0023)。 */
export function createApiApp(useCases: UseCases): ApiApp {
  return {
    async startRun(input: StartRunInput): Promise<void> {
      // 認可はここに入る。ローカルトークンの検証と Origin 検査を通してから
      // use case を呼ぶ (ADR-0021 / context/infrastructure.md)。
      // HTTP framework が未確定のため、検証は listen の実装と同時に入れる。
      await useCases.startRun(input);
    },
  };
}
