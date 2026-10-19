"use client";

import * as React from "react";
import { useAthleteStore } from "@/store/use-athlete-store";
import { MembershipExpiredNotice } from "@/components/athlete/membership-paywall";
import { LiveWorkout } from "@/components/athlete/live-workout";
import { RestTimer } from "@/components/athlete/rest-timer";
import { AthleteChat } from "@/components/athlete/athlete-chat";

export default function AthleteAppPage() {
  const { membershipStatus } = useAthleteStore();

  // ADR-001: una suscripción vencida NO bloquea la app. El alumno mantiene
  // acceso completo (entrenamiento, historial y chat) y sólo recibe un aviso
  // prominente al inicio con acceso rápido al Chat GOZS.
  const isExpired = membershipStatus === "EXPIRED_PAYMENT_PENDING";

  return (
    <>
      {isExpired && <MembershipExpiredNotice />}
      <LiveWorkout />
      <RestTimer />
      <AthleteChat />
    </>
  );
}
