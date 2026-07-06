"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type ServerAction = (formData: FormData) => void | Promise<void>;
type Status = "DRAFT" | "PUBLISHED" | "ARCHIVED";

// Lifecycle buttons for the editor's settings sidebar. Client onClick (not a
// nested <form>) so they can sit inside the main document <form> alongside Save.
// They act on the saved document — Save commits content edits separately.
export function DocumentLifecycle({
  id,
  status,
  publish,
  unpublish,
  archive,
}: {
  id: string;
  status: Status;
  publish: ServerAction;
  unpublish: ServerAction;
  archive: ServerAction;
}) {
  const t = useTranslations("kb");
  const [pending, start] = useTransition();

  const run = (action: ServerAction, message: string) =>
    start(async () => {
      const fd = new FormData();
      fd.set("id", id);
      await action(fd);
      toast.success(message);
    });

  return (
    <div className="flex flex-wrap gap-2">
      {status !== "PUBLISHED" && (
        <Button type="button" size="sm" disabled={pending} onClick={() => run(publish, t("toastPublished"))}>
          {t("publish")}
        </Button>
      )}
      {status === "PUBLISHED" && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(unpublish, t("toastUnpublished"))}
        >
          {t("unpublish")}
        </Button>
      )}
      {status !== "ARCHIVED" && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(archive, t("toastArchived"))}
        >
          {t("archive")}
        </Button>
      )}
    </div>
  );
}
