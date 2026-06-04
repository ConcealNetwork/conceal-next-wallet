export type ContactAvatar = {
  id: string;
  label: string;
};

/** Built-in avatar slugs — each maps to `/brand/contacts/{id}.png` (256×256). */
export const CONTACT_AVATARS: ContactAvatar[] = [
  { id: "kraken", label: "Kraken" },
  { id: "alice", label: "Alice" },
  { id: "john", label: "John" },
  { id: "mining-pool", label: "Mining pool" },
  { id: "cold-storage", label: "Cold storage" },
];

export function contactAvatarPath(avatarId: string): string {
  return `/brand/contacts/${avatarId}.png`;
}

export function isContactAvatarId(avatarId: string | undefined): avatarId is string {
  if (!avatarId) return false;
  return CONTACT_AVATARS.some((avatar) => avatar.id === avatarId);
}
