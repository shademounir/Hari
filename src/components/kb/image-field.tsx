"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ImagePlus, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const MAX_BYTES = 1_000_000; // 1 MB source cap (before client-side compression)
const MAX_COVER_WIDTH = 1280; // covers render small — cap the uploaded resolution
const WEBP_QUALITY = 0.82;
const RASTER_TYPES = ["image/png", "image/jpeg", "image/webp"];

// Downscale + re-encode a raster image to a compact WebP blob before upload, so
// what we store stays small. SVG/GIF pass through untouched (vector / animation).
async function toUploadBlob(file: File): Promise<Blob> {
  if (!RASTER_TYPES.includes(file.type)) return file;
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_COVER_WIDTH / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", WEBP_QUALITY),
  );
  return blob ?? file; // engines without WebP encoding fall back to the original
}

// Decorative cover-image picker for a collection. Compresses the chosen file
// client-side, uploads it to object storage (POST /api/kb/upload), and mirrors
// the returned same-origin URL into a hidden input so the existing server action
// stores it as text. An empty hidden value clears the image on save.
export function ImageField({ defaultValue }: { defaultValue?: string | null }) {
  const t = useTranslations("kb");
  const [value, setValue] = useState<string>(defaultValue ?? "");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(t("imageInvalid"));
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(t("imageTooLarge"));
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const blob = await toUploadBlob(file);
      const fd = new FormData();
      fd.append("file", blob, blob === file ? file.name : "cover.webp");
      const res = await fetch("/api/kb/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error(`upload failed: ${res.status}`);
      const { url } = (await res.json()) as { url: string };
      setValue(url);
    } catch {
      setError(t("imageUploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  function clear() {
    setValue("");
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-1 text-sm">
      <span className="font-medium">{t("fieldImage")}</span>
      {/* The actual stored value — a same-origin /api/kb/images/… URL (or empty to clear). */}
      <input type="hidden" name="image" value={value} />

      <div className="flex items-start gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- small form preview; the value may still be a legacy data: URL
          <img
            src={value}
            alt=""
            className="h-20 w-32 shrink-0 rounded-md border object-cover"
          />
        ) : (
          <div className="flex h-20 w-32 shrink-0 items-center justify-center rounded-md border border-dashed text-muted-foreground">
            {uploading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <ImagePlus className="size-5" />
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={onPick}
            className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:bg-muted disabled:opacity-60"
          />
          {uploading && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> {t("imageUploading")}
            </span>
          )}
          {value && !uploading && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={clear}
              className="w-fit text-muted-foreground"
            >
              <X className="size-3.5" /> {t("imageRemove")}
            </Button>
          )}
        </div>
      </div>

      <span className="block text-xs text-muted-foreground">{t("fieldImageHint")}</span>
      {error && <span className="block text-xs text-destructive">{error}</span>}
    </div>
  );
}
