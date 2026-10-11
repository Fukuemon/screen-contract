// E2E は未整備である。黙って成功させると、Playwright を入れ忘れたまま
// 検査が緑になる (context/testing.md の Test Types and Guarantees)。
console.error("E2E は未整備です。Playwright を導入していません。");
console.error("経緯と着手条件は context/testing.md を参照してください。");
process.exit(1);
