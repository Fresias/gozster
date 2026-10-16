import * as React from "react";
import { StudioShell } from "@/components/coach/studio-shell";

export default function CoachStudioLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <StudioShell>{children}</StudioShell>;
}
