"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { initialsOf } from "@/lib/utils";

// Mirrors components/kb/image-field.tsx: compress client-side, upload, and hand
// the returned same-origin URL back. Squared rather than 1280-wide, because an
// avatar is only ever rendered in a circle.
const MAX_SOURCE_BYTES = 15_000_000; // generous source cap — photos compress way down
const MAX_STORED_BYTES = 1_000_000; // enforced on the COMPRESSED upload
const AVATAR_PX = 512;
const WEBP_QUALITY = 0.85;
const RASTER_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Center-crop to a square and re-encode to a compact WebP before uploading. */
async function toSquareWebp(file: File): Promise<Blob> {
  if (!RASTER_TYPES.includes(file.type)) return file;
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_PX;
  canvas.height = AVATAR_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", WEBP_QUALITY),
  );
  return blob ?? file; // engines without WebP encoding fall back to the original
}

export function AvatarField({
  name,
  value,
  onChange,
  disabled,
}: {
  /** For the initials fallback while there's no picture. */
  name: string;
  value: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("profile");
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError(t("imageInvalid"));
    if (file.size > MAX_SOURCE_BYTES) return setError(t("imageTooLarge"));

    setError(null);
    setUploading(true);
    try {
      const blob = await toSquareWebp(file);
      // The cap applies to the COMPRESSED result: a 4 MB photo that shrinks to
      // 80 KB is fine; a still-too-large blob is not.
      if (blob.size > MAX_STORED_BYTES) {
        setError(t("imageTooLarge"));
        return; // finally{} clears `uploading`
      }
      const fd = new FormData();
      fd.append("file", blob, "avatar.webp");
      const res = await fetch("/api/avatars/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error(`upload failed: ${res.status}`);
      const { url } = (await res.json()) as { url: string };
      onChange(url);
    } catch {
      setError(t("imageUploadFailed"));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = ""; // allow re-picking the same file
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-16">
        {value && <AvatarImage src={value} alt="" />}
        <AvatarFallback className="text-lg">{initialsOf(name || "?")}</AvatarFallback>
      </Avatar>

      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={onPick}
            disabled={disabled || uploading}
            aria-label={t("changePhoto")}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : (
              <ImagePlus aria-hidden className="size-4" />
            )}
            {value ? t("changePhoto") : t("addPhoto")}
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || uploading}
              onClick={() => onChange(null)}
            >
              <X aria-hidden className="size-4" />
              {t("removePhoto")}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t("photoHint")}</p>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
