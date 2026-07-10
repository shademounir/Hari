// Shared letterhead + page chrome for every generated HR document. Server-only
// (rendered via @react-pdf/renderer's renderToBuffer in lib/documents/pdf.ts) —
// never imported by a client component.
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";

export const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 56,
    paddingHorizontal: 56,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: "#1a1a1a",
  },
  header: {
    marginBottom: 32,
    borderBottom: "2pt solid #1a1a1a",
    paddingBottom: 12,
  },
  orgName: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
  },
  orgTagline: {
    fontSize: 9,
    color: "#555555",
    marginTop: 2,
  },
  title: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginBottom: 16,
    textTransform: "uppercase",
  },
  paragraph: {
    marginBottom: 10,
    lineHeight: 1.5,
  },
  label: {
    fontFamily: "Helvetica-Bold",
  },
  footer: {
    position: "absolute",
    bottom: 40,
    left: 56,
    right: 56,
    fontSize: 9,
    color: "#555555",
    borderTop: "0.5pt solid #cccccc",
    paddingTop: 8,
  },
});

/** Letterhead + generic page frame shared by every document template. */
export function DocumentLayout({
  title,
  issuedAt,
  reference,
  children,
}: {
  title: string;
  issuedAt: string;
  reference: string;
  children: ReactNode;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.orgName}>HARI</Text>
          <Text style={styles.orgTagline}>AI-powered HR platform</Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        {children}
        <View style={styles.footer} fixed>
          <Text>
            {reference} · {issuedAt}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
