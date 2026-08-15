import type { createApiApp } from "@screen-contract/api";

/**
 * Web UI の入口。TanStack Start (SPA モード) を後で導入する。
 *
 * server 機能は使わない。API ロジックは Workflow Server が唯一の backend で
 * ある (context/architecture.md の Runtime Boundary)。api からは型だけを
 * 参照し、値を import しない。
 */
export type ApiApp = ReturnType<typeof createApiApp>;
