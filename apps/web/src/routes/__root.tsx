import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

export const Route = createRootRoute({
  head: () => ({
    meta: [{ charSet: "utf-8" }, { name: "viewport", content: "width=device-width" }],
  }),
  shellComponent: RootDocument,
});

/** 視覚デザインは skeleton の範囲外。構造だけを置く。 */
function RootDocument({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

export function RootOutlet() {
  return <Outlet />;
}
