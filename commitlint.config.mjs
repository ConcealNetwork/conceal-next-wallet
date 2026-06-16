// Conventional Commits check (run in CI by wagoid/commitlint-github-action).
// Mirrors the repo's commit style: <type>: <description>.
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "refactor", "docs", "test", "chore", "perf", "ci", "build", "revert"],
    ],
    // Allow longer subjects than the 72-char default for descriptive commits.
    "header-max-length": [2, "always", 100],
  },
};
