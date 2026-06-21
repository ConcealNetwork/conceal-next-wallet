"use client";

import { NotebookPen } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTxNote } from "@/lib/hooks/use-tx-note";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { MAX_TX_NOTE_LENGTH } from "@/lib/storage/tx-note-format";
import { toast } from "@/lib/ui/toast";

/**
 * Private, device-local note attached to a transaction (by hash). Read view by
 * default; an explicit Edit/Add toggles a textarea so notes aren't changed by a
 * stray keystroke. Remount per hash (`key={hash}`) so editor state never leaks
 * between transactions.
 */
export function TransactionNote({ hash }: { hash: string }) {
  const { note, isLoading, save, isSaving } = useTxNote(hash);
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const fieldId = useId();

  function startEditing() {
    setDraft(note);
    setEditing(true);
  }

  async function handleSave() {
    try {
      await save(draft);
      setEditing(false);
      toast.success(draft.trim() ? t("toast.noteSaved") : t("toast.noteRemoved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("toast.noteSaveFailed"));
    }
  }

  const remaining = MAX_TX_NOTE_LENGTH - draft.length;

  return (
    <div className="rounded-xl border border-border bg-secondary/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <NotebookPen className="size-4" aria-hidden="true" />
          <span>{t("txNote.note")}</span>
        </div>
        <span className="text-xs text-muted-foreground">{t("txNote.localOnly")}</span>
      </div>

      {editing ? (
        <div className="mt-3 space-y-2">
          <Textarea
            id={fieldId}
            aria-label={t("txNote.aria")}
            value={draft}
            maxLength={MAX_TX_NOTE_LENGTH}
            placeholder={t("txNote.placeholder")}
            onChange={(event) => setDraft(event.target.value)}
            autoFocus
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {remaining} characters left
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditing(false)}
                disabled={isSaving}
              >
                {t("action.cancel")}
              </Button>
              <Button type="button" size="sm" onClick={handleSave} disabled={isSaving}>
                {isSaving ? t("action.saving") : t("action.save")}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("txNote.loading")}</p>
          ) : note ? (
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 whitespace-pre-wrap break-words text-sm text-foreground">
                {note}
              </p>
              <Button type="button" variant="ghost" size="sm" onClick={startEditing}>
                Edit
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="px-0 text-muted-foreground hover:text-foreground"
              onClick={startEditing}
            >
              Add a note
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
