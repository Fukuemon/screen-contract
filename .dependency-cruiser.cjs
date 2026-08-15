/**
 * 依存境界の正本 (context/engineering.md の Repository Quality Gate)。
 *
 * ルールは context/architecture.md の禁止経路と 1 対 1 で対応させる。
 * oxlint には層やディレクトリ単位のゾーン制約がないため、方向の強制はここが担う。
 * type-only と value の import を区別できるのが本ツールを選んだ理由である。
 *
 * パッケージ間の import は package.json の exports 経由で
 * `packages/<name>/dist/index.d.ts` に解決される (Compiled Package 戦略)。
 * ルールの path はパッケージ名までの前置き一致なので、src と dist のどちらに
 * 解決されても同じ判定になる。dist を exclude すると辺が消えて検査が空になるため除外しない。
 * 走査の起点は src だけに絞る (package.json の boundaries スクリプト)。
 */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "循環依存を禁じる。",
      from: {},
      to: { circular: true },
    },
    {
      name: "packages-not-to-apps",
      severity: "error",
      comment: "apps は依存グラフの終端。packages から参照しない (ADR-0023)。",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "interface-not-to-core-adapter",
      severity: "error",
      comment: "interface は app のみに依存する。use case を経由せず境界が崩れるため。",
      from: { path: "^packages/(api|agent)/" },
      to: { path: "^packages/(core-|adapter-|domain)" },
    },
    {
      name: "web-not-to-inner",
      severity: "error",
      comment:
        "Web UI は別プロセスで動く。内部層を参照するとブラウザ束に backend が混入する (context/architecture.md の Runtime Boundary)。",
      from: { path: "^apps/web/" },
      to: { path: "^packages/(core-|app/|adapter-|agent/|domain)" },
    },
    {
      name: "web-to-api-type-only",
      severity: "error",
      comment:
        "Web UI が api から取ってよいのは型だけである。値を import すると実装がブラウザ束へ入る。",
      from: { path: "^apps/web/" },
      to: { path: "^packages/api/", dependencyTypesNot: ["type-only"] },
    },
    {
      name: "app-not-to-adapter",
      severity: "error",
      comment:
        "app は adapter を参照しない。Store Port が app にあるため循環し、fake の差し替えが実行時分岐になる (ADR-0023)。",
      from: { path: "^packages/app/" },
      to: { path: "^packages/adapter-" },
    },
    {
      name: "core-not-outward",
      severity: "error",
      comment: "core は adapter / app / interface へ依存しない。Port の逆流を防ぐ。",
      from: { path: "^packages/core-" },
      to: { path: "^packages/(adapter-|app/|api/|agent/)" },
    },
    {
      name: "core-cross-module-type-only",
      severity: "error",
      comment: "core 同士と core → domain は型の参照のみ許可する (context/architecture.md)。",
      from: { path: "^packages/core-([a-z-]+)/" },
      to: {
        path: "^packages/(core-|domain/)",
        pathNot: "^packages/core-$1/",
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "domain-not-outward",
      severity: "error",
      comment: "domain は依存グラフの起点。他のパッケージへ依存しない。",
      from: { path: "^packages/domain/" },
      to: { path: "^(packages|apps)/", pathNot: "^packages/domain/" },
    },
    {
      name: "adapter-only-port-types",
      severity: "error",
      comment:
        "adapter は自身が実装する Port を定義するモジュール (core / app) と domain の型だけを参照する。",
      from: { path: "^packages/adapter-" },
      to: {
        path: "^packages/(core-|app/|domain/)",
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "not-unresolvable",
      severity: "error",
      comment:
        "解決できない依存を許さない。解決に失敗すると辺そのものが消えるため、境界の検査が違反ゼロで空振りする。",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "no-non-package-json",
      severity: "error",
      comment: "外部依存は最寄りの package.json へ宣言する。",
      from: {},
      to: { dependencyTypes: ["npm-no-pkg", "npm-unknown"] },
    },
    {
      name: "not-to-dev-dep",
      severity: "error",
      comment:
        "ランタイムコードは devDependencies を参照しない。テストと設定ファイル、および設定だけを配る packages/config は対象外。",
      from: {
        path: "^(apps|packages)/",
        pathNot: "(\\.(test|config)\\.ts$|^packages/config/)",
      },
      to: { dependencyTypes: ["npm-dev"] },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "types", "default"],
    },
    // node_modules は辿らない (葉として記録するだけ)。
    // includeOnly で外部依存を絞ってはならない。解決できなかった依存の resolved は
    // モジュール指定子のまま (例 "lodash") になり、path で絞ると
    // not-unresolvable と no-non-package-json が評価前に落ちて死んだルールになる。
    doNotFollow: { path: "node_modules" },
  },
};
