/** テストが操作する対象アプリ。内容を固定する (context/testing.md)。 */
export const fixtureVariants = ["base", "changed"] as const;

export type FixtureVariant = (typeof fixtureVariants)[number];
