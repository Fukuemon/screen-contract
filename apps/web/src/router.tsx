import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/** TanStack Start が探す名前は `getRouter` である。 */
export function getRouter() {
  return createRouter({ routeTree, scrollRestoration: true });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
