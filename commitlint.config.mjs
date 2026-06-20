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
    // Don't cap body line length: Dependabot's commit bodies (release notes, commit
    // links) legitimately exceed 100 chars, and wrapping detailed bodies adds no value
    // over the enforced header format. (Was failing every Dependabot PR.)
    "body-max-line-length": [0, "always", Number.POSITIVE_INFINITY],
  },
};
