jest.mock(
  "@calcom/platform-libraries",
  () => ({
    getBusyCalendarTimes: jest.fn(),
    getConnectedDestinationCalendarsAndEnsureDefaultsInDb: jest.fn(),
    credentialForCalendarServiceSelect: {},
  }),
  { virtual: true }
);

import { UnifiedCalendarService } from "./unified-calendar.service";
import { createGoogleCalendarEventFixture } from "../pipes/__fixtures__/google-calendar-event.fixture";

describe("UnifiedCalendarService.listEvents calBookingUid", () => {
  const build = (refs: Array<{ uid: string; booking: { uid: string } | null }>, events: unknown[]) => {
    const findMany = jest.fn().mockResolvedValue(refs);
    const google = { listEventsForUser: jest.fn().mockResolvedValue(events) };
    const service = new UnifiedCalendarService(
      google as never,
      {} as never,
      {} as never,
      { prisma: { bookingReference: { findMany } } } as never
    );
    return { service, findMany };
  };

  it("sets calBookingUid for events created by a Cal booking and null otherwise", async () => {
    const { service, findMany } = build(
      [{ uid: "g1", booking: { uid: "bk-1" } }],
      [createGoogleCalendarEventFixture({ id: "g1" }), createGoogleCalendarEventFixture({ id: "g2" })]
    );

    const result = await service.listEvents("google", 1, "primary", "a", "b");

    expect(result.map((e) => e.calBookingUid)).toEqual(["bk-1", null]);
    expect(findMany).toHaveBeenCalledWith({
      where: { type: "google_calendar", uid: { in: ["g1", "g2"] } },
      select: { uid: true, booking: { select: { uid: true } } },
    });
  });

  it("skips the DB lookup when there are no events", async () => {
    const { service, findMany } = build([], []);
    expect(await service.listEvents("google", 1, "primary", "a", "b")).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
