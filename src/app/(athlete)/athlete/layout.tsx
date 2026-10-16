import * as React from "react";
import { AthleteShell } from "@/components/athlete/athlete-shell";

export default function AthleteAppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AthleteShell>{children}</AthleteShell>;
}
