"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PageHeader, SectionCard } from "@/components/wallet/common"
import { services } from "@/lib/services"

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "Use at least 8 characters"),
    confirmPassword: z.string().min(8, "Confirm the new password"),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "Passwords must match",
    path: ["confirmPassword"],
  })

type PasswordForm = z.infer<typeof passwordSchema>

export default function ChangePasswordPage() {
  const router = useRouter()
  const form = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  })

  async function submit(values: PasswordForm) {
    await services.wallet.changePassword(values)
    toast.success("Mock password changed.")
    router.push("/wallet/settings")
  }

  return (
    <>
      <PageHeader title="Change Password" subtitle="Update the local mock wallet password" />
      <SectionCard className="max-w-xl">
        <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
          <div className="space-y-2">
            <Label>Current password</Label>
            <Input type="password" {...form.register("currentPassword")} />
            {form.formState.errors.currentPassword && <p className="text-sm text-red-400">{form.formState.errors.currentPassword.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>New password</Label>
            <Input type="password" {...form.register("newPassword")} />
            {form.formState.errors.newPassword && <p className="text-sm text-red-400">{form.formState.errors.newPassword.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Confirm password</Label>
            <Input type="password" {...form.register("confirmPassword")} />
            {form.formState.errors.confirmPassword && <p className="text-sm text-red-400">{form.formState.errors.confirmPassword.message}</p>}
          </div>
          <Button type="submit">Change Password</Button>
        </form>
      </SectionCard>
    </>
  )
}
