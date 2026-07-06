"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

// Fires a success toast once after a save redirect (`/kb/admin?saved=1`), then
// clears the query param so it doesn't re-toast on refresh. `show` is read
// server-side from searchParams, so this avoids a useSearchParams Suspense bailout.
export function SavedToast({ show, message }: { show: boolean; message: string }) {
  const router = useRouter();
  const fired = useRef(false);
  useEffect(() => {
    if (show && !fired.current) {
      fired.current = true;
      toast.success(message);
      router.replace("/kb/admin");
    }
  }, [show, message, router]);
  return null;
}
