import { Text } from "@react-pdf/renderer";
import { DocumentLayout, styles } from "./layout";
import type { TemplateDataByType } from "../types";

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });

export function WorkCertificatePdf({ profile }: TemplateDataByType["WORK_CERTIFICATE"]) {
  const now = new Date();
  return (
    <DocumentLayout
      title="Work Certificate"
      issuedAt={fmt(now)}
      reference={`WORK-CERT-${profile.name.replace(/\s+/g, "-").toUpperCase()}`}
    >
      <Text style={styles.paragraph}>
        This is to certify that <Text style={styles.label}>{profile.name}</Text> has been
        employed by HARI as <Text style={styles.label}>{profile.title}</Text> in the{" "}
        <Text style={styles.label}>{profile.department}</Text> department since{" "}
        <Text style={styles.label}>{fmt(profile.startDate)}</Text>.
      </Text>
      <Text style={styles.paragraph}>
        This certificate is issued at the employee&apos;s request for administrative purposes.
      </Text>
    </DocumentLayout>
  );
}
