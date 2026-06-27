"use client";

import { Loader2, Wrench, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Citations } from "./generative/citations";
import { DirectoryCards } from "./generative/directory";
import {
  LeaveBalances,
  LeaveRequestCard,
  ApprovalResultCard,
  PendingApprovals,
} from "./generative/leave";
import { Payslip } from "./generative/payslip";

type ToolPart = {
  type: string; // "tool-<name>"
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
  input?: unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  output?: any;
  errorText?: string;
};

// Silent utility tools — the agent uses them internally (date math) and states
// the result in its answer; there's nothing meaningful to render. Mirrors the
// `permission: null` utility rows in TOOL_CATALOGUE (lib/ai/tools.ts) — kept as a
// small client-side list so this client component doesn't import server-only
// tool code. Add a calendar/utility tool there → add its name here.
const SILENT_TOOLS = new Set(["getCurrentDateTime", "getDateInfo", "businessDaysBetween"]);

export function ToolCall({ part, streaming }: { part: ToolPart; streaming: boolean }) {
  const t = useTranslations("tools");
  const name = part.type.replace(/^tool-/, "");
  if (SILENT_TOOLS.has(name)) return null;
  // `name` is dynamic; narrow the key to the translator's expected type.
  const statusKey = `status.${name}` as Parameters<typeof t>[0];
  const label = t.has(statusKey) ? t(statusKey) : name;
  const running = part.state === "input-streaming" || part.state === "input-available";

  return (
    <div className="space-y-2">
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 text-xs text-muted-foreground"
      >
        {running ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Wrench className="size-3.5" />
        )}
        <span>{label}</span>
        <code className="rounded bg-muted px-1 py-0.5 text-[10px] text-foreground">{name}</code>
      </div>

      {part.state === "output-error" && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive"
        >
          <AlertTriangle className="size-3.5" /> {part.errorText ?? t("error")}
        </div>
      )}

      {part.state === "output-available" && (
        <ToolOutput name={name} output={part.output} streaming={streaming} />
      )}
    </div>
  );
}

function ToolOutput({
  name,
  output,
  streaming,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}: { name: string; output: any; streaming: boolean }) {
  if (!output) return null;
  // Scope refusals are intentionally invisible — the agent works with the
  // authorized data and explains in prose; we don't surface an error.
  if (output.refused) return null;
  if (output.error)
    return (
      <p className="rounded-lg border border-dashed p-2 text-xs text-muted-foreground">
        {output.error}
      </p>
    );

  switch (name) {
    case "searchHandbook":
      return <Citations query={output.query} results={output.results} streaming={streaming} />;
    case "getEmployeeDirectory":
      return <DirectoryCards people={output.people} />;
    case "getLeaveBalance":
      return <LeaveBalances balances={output.balances} />;
    case "requestTimeOff":
      return <LeaveRequestCard request={output.request} />;
    case "listPendingApprovals":
      return <PendingApprovals pending={output.pending} />;
    case "approveLeave":
      return <ApprovalResultCard result={output.result} />;
    case "getPayslip":
      return <Payslip payslip={output.payslip} />;
    default:
      return (
        <pre className="overflow-x-auto rounded-lg border bg-muted p-2 text-[11px]">
          {JSON.stringify(output, null, 2)}
        </pre>
      );
  }
}
