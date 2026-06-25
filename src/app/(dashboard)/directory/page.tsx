import { requireUser } from "@/lib/session";
import { getDirectory, filterDirectory } from "@/lib/hr";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const { q } = await searchParams;

  const fullDirectory = await getDirectory({
    role: user.role,
    employeeId: user.employeeId,
  });
  const directory = filterDirectory(fullDirectory, q);
  const showSalary = can(user.role, "salary:read:all");
  const isManagerScope =
    can(user.role, "directory:read:team") && !can(user.role, "directory:read:all");

  const scope = can(user.role, "directory:read:all")
    ? "Everyone in the company."
    : can(user.role, "directory:read:team")
      ? "Your perimeter: you and your direct reports."
      : "Just your own profile — managers and HR see more.";

  return (
    <>
      <PageHeader title="Directory" description={scope} />
      <div className="p-8 space-y-4">
        <form className="max-w-sm">
          <Input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by name, department, or title…"
          />
        </form>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Manager</TableHead>
                {showSalary && <TableHead className="text-right">Salary</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {directory.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {e.name}
                      {e.isSelf && <Badge variant="outline">You</Badge>}
                      {isManagerScope && !e.isSelf && (
                        <Badge variant="outline" className="text-[10px]">
                          Direct report
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-[10px]">
                        {ROLE_LABELS[e.role]}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{e.email}</span>
                  </TableCell>
                  <TableCell>{e.title}</TableCell>
                  <TableCell>{e.department}</TableCell>
                  <TableCell>{e.location}</TableCell>
                  <TableCell>{e.managerName ?? "—"}</TableCell>
                  {showSalary && (
                    <TableCell className="text-right tabular-nums">
                      ${e.salary?.toLocaleString()}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {directory.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={showSalary ? 6 : 5}
                    className="text-center text-sm text-muted-foreground"
                  >
                    No matching employees.
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
