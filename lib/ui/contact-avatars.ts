export type ContactAvatar = {
  id: string;
  label: string;
};

/** Built-in avatar slugs — each maps to `/brand/contacts/{id}.png` (256×256). */
export const CONTACT_AVATARS: ContactAvatar[] = [
  { id: "alice", label: "Alice" },
  { id: "cham", label: "Cham" },
  { id: "cold-storage", label: "Cold storage" },
  { id: "conceal", label: "Conceal" },
  { id: "hot-wallet", label: "Hot wallet" },
  { id: "jay", label: "Jay" },
  { id: "john", label: "John" },
  { id: "kraken", label: "Kraken" },
  { id: "mining-pool", label: "Mining pool" },
];

export function contactAvatarPath(avatarId: string): string {
  return `/brand/contacts/${avatarId}.png`;
}

export function isContactAvatarId(avatarId: string | undefined): avatarId is string {
  if (!avatarId) return false;
  return CONTACT_AVATARS.some((avatar) => avatar.id === avatarId);
}
