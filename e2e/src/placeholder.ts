/**
 * E2E は Workflow Server を **プロセスとして起動する**。import しない。
 *
 * `apps/` は exports を持たないため、そもそもパッケージ名で import できない。
 * これはデプロイ単位を依存グラフの終端に保つための構造上の保証である
 * (context/architecture.md)。ビルド順だけは turbo の
 * `@screen-contract/server#build` で担保する。
 */
export {};
