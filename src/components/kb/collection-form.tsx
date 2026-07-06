import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SlugField } from "@/components/kb/slug-field";
import { ImageField } from "@/components/kb/image-field";

type Defaults = {
  id?: string;
  name?: string;
  slug?: string;
  description?: string | null;
  image?: string | null;
  order?: number;
};

export async function CollectionForm({
  action,
  submitLabel,
  defaults = {},
}: {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  defaults?: Defaults;
}) {
  const t = await getTranslations("kb");

  return (
    <form action={action} className="max-w-xl space-y-4">
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}

      <label className="block space-y-1 text-sm">
        <span className="font-medium">{t("fieldName")}</span>
        <Input name="name" defaultValue={defaults.name ?? ""} required />
      </label>

      <SlugField
        defaultValue={defaults.slug ?? ""}
        basePath="/kb/"
        originalSlug={defaults.slug}
        warnOnChange={!!defaults.id}
      />

      <label className="block space-y-1 text-sm">
        <span className="font-medium">{t("fieldDescription")}</span>
        <Textarea name="description" defaultValue={defaults.description ?? ""} rows={3} />
      </label>

      <ImageField defaultValue={defaults.image} />

      <label className="block space-y-1 text-sm">
        <span className="font-medium">{t("fieldOrder")}</span>
        <Input name="order" type="number" defaultValue={String(defaults.order ?? 0)} className="w-24" />
      </label>

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm">{submitLabel}</Button>
        <ButtonLink href="/kb/admin" size="sm" variant="ghost">
          {t("cancel")}
        </ButtonLink>
      </div>
    </form>
  );
}
