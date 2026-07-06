"use server";

import { requireUser } from "@/lib/session";
import { submitArticleFeedback } from "@/lib/kb";

// Reader-side action: any signed-in user may rate an article they can see. The
// data layer verifies the doc is published + within the caller's tier, and returns
// false if the vote was rejected (e.g. the doc was just unpublished) so the UI can
// avoid a false "thanks".
export async function articleFeedbackAction(documentId: string, helpful: boolean): Promise<boolean> {
  const user = await requireUser();
  return submitArticleFeedback({ role: user.role, id: user.id }, documentId, helpful);
}
