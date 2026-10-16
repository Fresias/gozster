"use client";

import * as React from "react";
import { useAthleteStore } from "@/store/use-athlete-store";
import { MembershipPaywall } from "@/components/athlete/membership-paywall";
import { LiveWorkout } from "@/components/athlete/live-workout";
import { RestTimer } from "@/components/athlete/rest-timer";
import { AthleteChat } from "@/components/athlete/athlete-chat";

export default function AthleteAppPage() {
  const { membershipStatus } = useAthleteStore();

  return (
    <>
      {membershipStatus === "EXPIRED_PAYMENT_PENDING" ? (
        <MembershipPaywall />
      ) : (
        <>
          <LiveWorkout />
          <RestTimer />
        </>
      )}
      <AthleteChat />
    </>
  );
}

