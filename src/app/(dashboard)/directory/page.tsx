import { getTranslations, getLocale } from "next-intl/server";
import { getRoleLabels } from "@/lib/rbac-server";
import { requireUser } from "@/lib/session";
import { getEmployeeDirectory, getEmployeeDirectoryFacets } from "@/lib/hr";
import { can } from "@/lib/rbac";
import { formatCurrency } from "@/lib/utils";
import { getOrgSettings } from "@/lib/settings";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsOf } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DirectoryFilters } from "@/components/directory/filters";

type Props = {
  searchParams: Promise<{
    status?: string | string[];
    search?: string;
    dept?: string | string[];
    city?: string | string[];
  }>;
};

const STATUS_VARIANT = {
  ACTIVE: "default",
  ON_LEAVE: "secondary",
  TERMINATED: "destructive",
} as const;

const asArray = (v: string | string[] | undefined): string[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

export default async function DirectoryPage({ searchParams }: Props) {
  const user = await requireUser();
  const params = await searchParams;
  const caller = user;

  const t = await getTranslations("directory");
  const roleLabels = await getRoleLabels(await getTranslations("roles"));
  const tc = await getTranslations("common");
  const tStatus = await getTranslations("employmentStatus");
  const tType = await getTranslations("employmentTypeLabel");
  const locale = await getLocale();
  const { currency } = await getOrgSettings();

  const showSalary = can(user, "salary:read:all");
  // A caller with team-scope (but not company-wide) sees self + direct reports —
  // label the non-self rows so their perimeter is explicit (SCRUM-043).
  const isManagerScope =
    can(user, "directory:read:team") && !can(user, "directory:read:all");
  const scope = can(user, "directory:read:all")
    ? t("scopeAll")
    : can(user, "directory:read:team")
      ? t("scopeTeam")
      : t("scopeSelf");

  // Filters + facet options both go through the role-scoped data layer (lib/hr.ts),
  // so a caller can never see — or filter by — anyone outside their scope. Invalid
  // status values are dropped server-side (see getEmployeeDirectory).
  const [directory, facets] = await Promise.all([
    getEmployeeDirectory(caller, {
      search: typeof params.search === "string" ? params.search : undefined,
      status: asArray(params.status),
      departments: asArray(params.dept),
      cities: asArray(params.city),
    }),
    getEmployeeDirectoryFacets(caller),
  ]);

  const colCount = showSalary ? 8 : 7;

  return (
    <>
      <PageHeader title={t("title")} description={scope} />
      <div className="space-y-6 p-4 md:p-8">
        <DirectoryFilters departments={facets.departments} cities={facets.cities} />

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("jobTitle")}</TableHead>
                <TableHead>{t("department")}</TableHead>
                <TableHead>{t("location")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead>{t("employmentType")}</TableHead>
                <TableHead>{t("manager")}</TableHead>
                {showSalary && <TableHead className="text-right">{t("salary")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {directory.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Avatar className="size-7">
                        {e.avatarUrl && <AvatarImage src={e.avatarUrl} alt="" />}
                        <AvatarFallback className="text-[10px]">{initialsOf(e.name)}</AvatarFallback>
                      </Avatar>
                      {e.name}
                      {e.isSelf && <Badge variant="outline">{tc("you")}</Badge>}
                      {isManagerScope && !e.isSelf && (
                        <Badge variant="outline" className="text-[10px]">
                          {t("directReport")}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-[10px]">
                        {roleLabels[e.role] ?? e.role}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{e.email}</span>
                  </TableCell>
                  <TableCell>{e.title}</TableCell>
                  <TableCell>{e.department}</TableCell>
                  <TableCell>{e.location}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[e.status]}>{tStatus(e.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{tType(e.employmentType)}</TableCell>
                  <TableCell>{e.managerName ?? tc("none")}</TableCell>
                  {showSalary && (
                    <TableCell className="text-right tabular-nums">
                      {e.salary != null ? formatCurrency(e.salary, currency, locale) : tc("none")}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {directory.length === 0 && (
                <TableRow>
                  <TableCell colSpan={colCount} className="py-12 text-center text-sm text-muted-foreground">
                    {t("noResults")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}
