import { Text } from "@react-pdf/renderer";
import { DocumentLayout, styles } from "./layout";
import type { TemplateDataByType } from "../types";

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });

export function LeaveConfirmationPdf({
  profile,
  leaveType,
  startDate,
  endDate,
  days,
}: TemplateDataByType["LEAVE_CONFIRMATION"]) {
  const now = new Date();
  return (
    <DocumentLayout
      title="Leave Confirmation"
      issuedAt={fmt(now)}
      reference={`LEAVE-CONF-${profile.name.replace(/\s+/g, "-").toUpperCase()}`}
    >
      <Text style={styles.paragraph}>
        This confirms that <Text style={styles.label}>{profile.name}</Text> (
        {profile.title}, {profile.department}) has been granted{" "}
        <Text style={styles.label}>{leaveType.toLowerCase()}</Text> leave from{" "}
        <Text style={styles.label}>{fmt(startDate)}</Text> to{" "}
        <Text style={styles.label}>{fmt(endDate)}</Text> ({days} day{days > 1 ? "s" : ""}).
      </Text>
      <Text style={styles.paragraph}>This leave was reviewed and approved through the HARI platform.</Text>
    </DocumentLayout>
  );
}
