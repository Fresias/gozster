"use client";

import * as React from "react";
import { DEFAULT_ATHLETE_ID, useAthleteStore } from "@/store/use-athlete-store";
import { getStorageUser } from "@/lib/user-storage";
import { createClient } from "@/lib/supabase/browser";
import { MembershipExpiredNotice } from "@/components/athlete/membership-paywall";
import { LiveWorkout } from "@/components/athlete/live-workout";
import { RutinaDelDia } from "@/components/athlete/rutina-del-dia";
import { RestTimer } from "@/components/athlete/rest-timer";
import { AthleteChat } from "@/components/athlete/athlete-chat";
import { InicioMisDias } from "@/components/athlete/inicio-mis-dias";

export default function AthleteAppPage() {
  const {
    membershipStatus,
    diaActivoId,
    ejercicioAbiertoId,
    planAlumno,
    currentSession,
    nombrePreferido,
  } = useAthleteStore();

  const [authUserId, setAuthUserId] = React.useState<string | null>(() => getStorageUser());

  React.useEffect(() => {
    if (authUserId) return;
    let active = true;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (active && data?.user?.id) {
          setAuthUserId(data.user.id);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [authUserId]);

  const alumno = planAlumno?.alumnos[0];
  const sessionStudentId =
    currentSession.studentId && currentSession.studentId !== DEFAULT_ATHLETE_ID
      ? currentSession.studentId
      : undefined;
  const athleteId = alumno?.id || authUserId || sessionStudentId;
  const athleteName =
    nombrePreferido ||
    alumno?.nombre_completo ||
    (sessionStudentId ? currentSession.studentName : undefined);

  // ADR-001: una suscripción vencida NO bloquea la app. El alumno mantiene
  // acceso completo (entrenamiento, historial y chat) y sólo recibe un aviso
  // prominente al inicio con acceso rápido al Chat GOZS.
  const isExpired = membershipStatus === "EXPIRED_PAYMENT_PENDING";

  return (
    <>
      {isExpired && <MembershipExpiredNotice />}
      {diaActivoId ? (
        ejercicioAbiertoId ? (
          <LiveWorkout />
        ) : (
          <RutinaDelDia />
        )
      ) : (
        <InicioMisDias />
      )}
      <RestTimer />
      <AthleteChat athleteId={athleteId} athleteName={athleteName} />
    </>
  );
}
