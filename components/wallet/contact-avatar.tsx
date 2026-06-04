import type { AddressEntry } from "@/lib/types";
import { contactAvatarPath, isContactAvatarId } from "@/lib/ui/contact-avatars";
import { cn, withBasePath } from "@/lib/utils";

export function ContactAvatar({ entry, className }: { entry: AddressEntry; className?: string }) {
  if (isContactAvatarId(entry.avatar)) {
    return (
      <img
        src={withBasePath(contactAvatarPath(entry.avatar))}
        alt=""
        className={cn("shrink-0 rounded-lg object-cover", className)}
      />
    );
  }
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center bg-primary/15 font-semibold text-primary",
        className,
      )}
    >
      {entry.label.charAt(0)}
    </span>
  );
}
