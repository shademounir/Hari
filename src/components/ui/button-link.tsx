import Link from "next/link";
import type { ComponentProps } from "react";
import { Button } from "./button";

// A Button that navigates: renders Base UI's Button as a Next.js <Link>. Sets
// `nativeButton={false}` so Base UI doesn't expect a native <button> (the
// rendered element is an <a>), keeping correct link semantics and a11y.
export function ButtonLink({
  href,
  ...props
}: { href: string } & Omit<ComponentProps<typeof Button>, "render" | "nativeButton">) {
  return <Button nativeButton={false} render={<Link href={href} />} {...props} />;
}
