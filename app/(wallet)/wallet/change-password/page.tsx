"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, SectionCard } from "@/components/wallet/common";
import { services } from "@/lib/services";
import { walletCopy } from "@/lib/ui/wallet-copy";
import { cn } from "@/lib/utils";

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "Use at least 8 characters"),
    confirmPassword: z.string().min(8, "Confirm the new password"),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "Passwords must match",
    path: ["confirmPassword"],
  });

type PasswordForm = z.infer<typeof passwordSchema>;

function strength(password: string) {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return score;
}

const STRENGTH = [
  { label: "Too short", className: "bg-wallet-outgoing" },
  { label: "Weak", className: "bg-wallet-outgoing" },
  { label: "Fair", className: "bg-primary" },
  { label: "Good", className: "bg-primary" },
  { label: "Strong", className: "bg-wallet-incoming" },
];

export default function ChangePasswordPage() {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const form = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const newPassword = useWatch({ control: form.control, name: "newPassword" }) || "";
  const score = strength(newPassword);

  async function submit(values: PasswordForm) {
    try {
      await services.wallet.changePassword(values);
      toast.success(walletCopy.passwordChanged);
      router.push("/wallet/settings");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to change password.");
    }
  }

  return (
    <>
      <PageHeader title="Change Password" subtitle="Update the local mock wallet password" />
      <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100">
        <SectionCard
          className="max-w-xl"
          title="Wallet password"
          description="Choose a strong password for this mock wallet"
        >
          <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                type={show ? "text" : "password"}
                {...form.register("currentPassword")}
              />
              {form.formState.errors.currentPassword && (
                <p className="text-sm text-wallet-outgoing">
                  {form.formState.errors.currentPassword.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="newPassword">New password</Label>
                <button
                  type="button"
                  onClick={() => setShow((value) => !value)}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-sm text-xs text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  {show ? "Hide" : "Show"}
                </button>
              </div>
              <Input
                id="newPassword"
                type={show ? "text" : "password"}
                {...form.register("newPassword")}
              />
              {newPassword.length > 0 && (
                <div className="space-y-1">
                  <div className="flex gap-1" aria-hidden="true">
                    {Array.from({ length: 4 }, (_, index) => (
                      <span
                        key={index}
                        className={cn(
                          "h-1 flex-1 rounded-full transition-colors duration-200",
                          index < score ? STRENGTH[score].className : "bg-secondary",
                        )}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">Strength: {STRENGTH[score].label}</p>
                </div>
              )}
              {form.formState.errors.newPassword && (
                <p className="text-sm text-wallet-outgoing">
                  {form.formState.errors.newPassword.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type={show ? "text" : "password"}
                {...form.register("confirmPassword")}
              />
              {form.formState.errors.confirmPassword && (
                <p className="text-sm text-wallet-outgoing">
                  {form.formState.errors.confirmPassword.message}
                </p>
              )}
            </div>
            <Button type="submit" className="active:scale-[0.98] motion-reduce:active:scale-100">
              Change Password
            </Button>
          </form>
        </SectionCard>
      </div>
    </>
  );
}
