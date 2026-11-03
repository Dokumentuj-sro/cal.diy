import {
  createBookingScenario,
  getBooker,
  getDate,
  getGoogleCalendarCredential,
  getOrganizer,
  getScenarioData,
  mockCalendar,
  TestData,
} from "@calcom/testing/lib/bookingScenario/bookingScenario";
import process from "node:process";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { getMockRequestDataForBooking } from "@calcom/testing/lib/bookingScenario/getMockRequestDataForBooking";
import { setupAndTeardown } from "@calcom/testing/lib/bookingScenario/setupAndTeardown";
import { test } from "@calcom/testing/lib/fixtures/fixtures";
import { describe, expect } from "vitest";
import { getNewBookingHandler } from "./getNewBookingHandler";

const timeout = process.env.CI ? 5000 : 20000;

describe("handleNewBooking", () => {
  setupAndTeardown();

  describe("Calendar check failures", () => {
    test(
      "refuses the booking as unavailable when the host's calendar can't be checked",
      async () => {
        const handleNewBooking = getNewBookingHandler();
        const booker = getBooker({ email: "booker@example.com", name: "Booker" });
        const organizer = getOrganizer({
          name: "Organizer",
          email: "organizer@example.com",
          id: 101,
          schedules: [TestData.schedules.IstWorkHours],
          credentials: [getGoogleCalendarCredential()],
          selectedCalendars: [TestData.selectedCalendars.google],
        });

        mockCalendar("googlecalendar", {
          getAvailabilityError: new ErrorWithCode(ErrorCode.CalendarCheckFailed, "freebusy failed", {
            calendarIds: ["shared@group.calendar.google.com"],
          }),
        });

        await createBookingScenario(
          getScenarioData({
            eventTypes: [{ id: 1, slotInterval: 15, length: 15, users: [{ id: 101 }] }],
            organizer,
            apps: [TestData.apps["google-calendar"]],
          })
        );

        const { dateString: nextDayDateString } = getDate({ dateIncrement: 1 });
        const bookingData = getMockRequestDataForBooking({
          data: {
            start: `${nextDayDateString}T05:00:00.000Z`,
            end: `${nextDayDateString}T05:15:00.000Z`,
            eventTypeId: 1,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: "New York" },
            },
          },
        });

        await expect(handleNewBooking({ bookingData })).rejects.toThrowError(ErrorCode.NoAvailableUsersFound);
      },
      timeout
    );
  });
});
