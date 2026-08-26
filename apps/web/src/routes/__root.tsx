import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import styles from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [{ charSet: "utf-8" }, { name: "viewport", content: "width=device-width" }],
    links: [{ rel: "stylesheet", href: styles }],
  }),
  shellComponent: RootDocument,
});

/** 画面の外枠。中身は route が持つ。 */
function RootDocument({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <HeadContent />
      </head>
      <body // 拡大やフォントサイズの変更ではみ出したとき、横だけはたどれるようにする。
        className="h-dvh overflow-x-auto overflow-y-hidden"
      >
        {children}
        <Scripts />
      </body>
    </html>
  );
}
