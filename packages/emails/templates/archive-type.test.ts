import { describe, expect, it, vi } from "vitest";

import type { CalendarEvent, Person } from "@calcom/types/Calendar";

// Fork-only (ADR-0067): archiveType must be a class field on each attendee template,
// not `this.name` — reschedule/cancel otherwise inherit SEND_BOOKING_CONFIRMATION's
// type from the scheduled template they extend. Mocks mirror email-manager.test.ts.
vi.mock("@calcom/prisma", () => ({
  prisma: {},
}));

vi.mock("../lib/archiveCopy", () => ({
  archiveCopy: vi.fn(),
}));

vi.mock("../lib/generateIcsFile", () => ({
  default: vi.fn(() => "mock-ical-content"),
  GenerateIcsRole: {
    ATTENDEE: "ATTENDEE",
  },
}));

vi.mock("../src/renderEmail", () => ({
  default: vi.fn(() => Promise.resolve("<html>mock-email</html>")),
}));

vi.mock("@calcom/lib/getReplyToHeader", () => ({
  getReplyToHeader: vi.fn(() => ({})),
}));

vi.mock("@calcom/lib/CalEventParser", () => ({
  getRichDescription: vi.fn(() => "mock-description"),
}));

vi.mock("./_base-email", () => {
  return {
    default: class MockBaseEmail {
      getMailerOptions() {
        return { from: "test@cal.com" };
      }
    },
  };
});

import AttendeeCancelledEmail from "./attendee-cancelled-email";
import AttendeeCancelledSeatEmail from "./attendee-cancelled-seat-email";
import AttendeeRescheduledEmail from "./attendee-rescheduled-email";
import AttendeeScheduledEmail from "./attendee-scheduled-email";

const createMockPerson = (name: string, email: string): Person => ({
  name,
  email,
  timeZone: "America/New_York",
  language: {
    translate: vi.fn((key: string) => key),
    locale: "en",
  },
});

const createMockCalendarEvent = (): CalendarEvent =>
  ({
    title: "Test Event",
    type: "Test Event Type",
    startTime: "2024-01-01T10:00:00Z",
    endTime: "2024-01-01T11:00:00Z",
    uid: "booking-uid-1",
    organizer: createMockPerson("Organizer", "organizer@example.com"),
    attendees: [createMockPerson("Alice", "alice@example.com")],
  }) as CalendarEvent;

describe("attendee template archiveType", () => {
  it("gives scheduled, rescheduled and cancelled their own, distinct archiveType", () => {
    const calEvent = createMockCalendarEvent();
    const attendee = calEvent.attendees[0];

    const scheduled = new AttendeeScheduledEmail(calEvent, attendee);
    const rescheduled = new AttendeeRescheduledEmail(calEvent, attendee);
    const cancelled = new AttendeeCancelledEmail(calEvent, attendee);

    expect((scheduled as unknown as { archiveType: string }).archiveType).toBe("potvrzeni");
    expect((rescheduled as unknown as { archiveType: string }).archiveType).toBe("prelozeno");
    expect((cancelled as unknown as { archiveType: string }).archiveType).toBe("zruseno");

    const types = [scheduled, rescheduled, cancelled].map(
      (email) => (email as unknown as { archiveType: string }).archiveType
    );
    expect(new Set(types).size).toBe(3);
  });

  // Regression (fix round 1): AttendeeCancelledSeatEmail extends AttendeeScheduledEmail
  // but used to set no archiveType of its own, so it silently inherited "potvrzeni"
  // through the real class hierarchy (not the mocked BaseEmail). This exercises that
  // real chain directly, so removing the override makes this fail again.
  it("does not let a subclass silently inherit AttendeeScheduledEmail's archiveType", () => {
    const calEvent = createMockCalendarEvent();
    const attendee = calEvent.attendees[0];

    const cancelledSeat = new AttendeeCancelledSeatEmail(calEvent, attendee);

    expect((cancelledSeat as unknown as { archiveType: string }).archiveType).toBe("zruseno");
    expect((cancelledSeat as unknown as { archiveType: string }).archiveType).not.toBe("potvrzeni");
  });
});
