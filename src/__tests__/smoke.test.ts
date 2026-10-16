import { beforeEach, describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

describe("GOZSter Base Smoke Suite", () => {
  beforeEach(() => {
    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [],
    });
  });

  it("concatenates class names cleanly without external dependencies", () => {
    expect(cn("bg-background", false && "hidden", undefined, "text-foreground")).toBe(
      "bg-background text-foreground",
    );
  });

  it("enqueues and clears offline workout events in Zustand store", () => {
    const store = useOfflineQueueStore.getState();
    store.setOnlineStatus(false);
    store.enqueueEvent({
      id: "evt-1",
      action: "WORKOUT_SET_COMPLETED",
      payload: { weightKg: 120, reps: 5, rpe: 8.5 },
    });

    const updated = useOfflineQueueStore.getState();
    expect(updated.isOnline).toBe(false);
    expect(updated.pendingEvents).toHaveLength(1);
    expect(updated.pendingEvents[0]?.id).toBe("evt-1");
    expect(updated.pendingEvents[0]?.action).toBe("WORKOUT_SET_COMPLETED");

    updated.removeEvent("evt-1");
    expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);
  });
});
