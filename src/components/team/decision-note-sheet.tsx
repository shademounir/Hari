"use client";

import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

// Small client island embedded in the (server-rendered) leave history table: a
// ghost Info button that slides out the full approver decision note. Only the
// note text + employee name cross to the client — nothing else.
export function DecisionNoteSheet({ note, employeeName }: { note: string; employeeName: string }) {
  const t = useTranslations("team");
  const tc = useTranslations("common");

  return (
    <Sheet>
      <SheetTrigger render={<Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" />}>
        <Info className="size-3.5" />
        {t("viewNote")}
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>{tc("decisionNote")}</SheetTitle>
          <SheetDescription>{t("decisionNoteFor", { name: employeeName })}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{note}</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
