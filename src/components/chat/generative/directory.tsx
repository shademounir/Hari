import { Mail, MapPin, Briefcase } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTranslations, useLocale } from "next-intl";
import { type Role } from "@/lib/rbac";
import { formatCurrency } from "@/lib/utils";
import { useOrgSettings } from "@/components/org-settings-provider";

type Person = {
  id: string;
  name: string;
  email: string;
  title: string;
  department: string;
  location: string;
  role: Role;
  managerName: string | null;
  isSelf: boolean;
  salary: number | null;
};

export function DirectoryCards({ people }: { people: Person[] }) {
  const t = useTranslations("directoryCard");
  const tCommon = useTranslations("common");
  const tRoles = useTranslations("roles");
  const locale = useLocale();
  const { currency } = useOrgSettings();
  if (people.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        {t("empty")}
      </p>
    );
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {people.map((p) => {
        const initials = p.name
          .split(" ")
          .map((s) => s[0])
          .join("")
          .slice(0, 2)
          .toUpperCase();
        return (
          <div key={p.id} className="rounded-lg border bg-card p-3 text-sm">
            <div className="flex items-center gap-3">
              <Avatar className="size-9">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-medium">{p.name}</span>
                  {p.isSelf && <Badge variant="outline" className="text-[10px]">{tCommon("you")}</Badge>}
                </div>
                <p className="truncate text-xs text-muted-foreground">{p.title}</p>
              </div>
            </div>
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <p className="flex items-center gap-1.5">
                <Briefcase className="size-3" /> {p.department}
                <Badge variant="secondary" className="ml-1 text-[10px]">
                  {tRoles(p.role)}
                </Badge>
              </p>
              <p className="flex items-center gap-1.5">
                <MapPin className="size-3" /> {p.location}
              </p>
              <p className="flex items-center gap-1.5 truncate">
                <Mail className="size-3" /> {p.email}
              </p>
              {p.salary != null && (
                <p className="font-medium text-foreground">
                  {formatCurrency(p.salary, currency, locale)} {t("perYear")}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
