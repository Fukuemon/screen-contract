const aiAttribution = [
  /^co-authored-by:\s*(claude|codex|chatgpt|copilot|cursor)/im,
  /^claude-session:/im,
  /^\W*generated with \[?claude code/im,
];

export default {
  extends: ["@commitlint/config-conventional"],
  plugins: [
    {
      rules: {
        "subject-no-japanese-full-stop": ({ subject }) => [
          !/。(\s*#\d+)?$/.test(subject ?? ""),
          "要約の末尾に句点を付けない",
        ],
        "no-ai-attribution": ({ raw }) => [
          !aiAttribution.some((pattern) => pattern.test(raw ?? "")),
          "AI の帰属表示を付けない",
        ],
      },
    },
  ],
  rules: {
    "subject-case": [0],
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
    "header-max-length": [2, "always", 72],
    "subject-no-japanese-full-stop": [2, "always"],
    "no-ai-attribution": [2, "always"],
  },
};
