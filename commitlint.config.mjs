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
    // Enforce the 100-char commit message length limit on both the whole header
    // and the subject portion. A 103-char header previously failed CI
    // ([header-max-length]); the companion subject-max-length keeps the limit
    // explicit and consistent across the entire commit message.
    "header-max-length": [2, "always", 100],
    "subject-max-length": [2, "always", 100],
    // Don't cap body line length: Dependabot's commit bodies (release notes, commit
    // links) legitimately exceed 100 chars, and wrapping detailed bodies adds no value
    // over the enforced header format. (Was failing every Dependabot PR.)
    "body-max-line-length": [0, "always", Number.POSITIVE_INFINITY],
  },
};
