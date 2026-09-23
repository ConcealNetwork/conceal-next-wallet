// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

/**
 * Shallow DTO hygiene: copy without password fields. Never mutates input.
 * @see openspec/changes/envelope-3-sdk/specs/wallet-onboarding/spec.md
 */

const PASSWORD_KEYS = ["password", "currentPassword", "newPassword", "backupPassword"] as const;

type PasswordKey = (typeof PASSWORD_KEYS)[number];

/** Shallow copy of `input` without password / currentPassword / newPassword / backupPassword. */
export function omitPassword<T extends object>(input: T): Omit<T, PasswordKey> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if ((PASSWORD_KEYS as readonly string[]).includes(key)) continue;
    result[key] = value;
  }
  return result as Omit<T, PasswordKey>;
}
