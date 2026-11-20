"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/push-notifications";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV === "production" &&
      typeof window !== "undefined" &&
      "serviceWorker" in navigator
    ) {
      void registerServiceWorker();
    }
  }, []);

  return null;
}
