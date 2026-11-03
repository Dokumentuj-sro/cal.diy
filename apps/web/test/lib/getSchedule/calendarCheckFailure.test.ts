import {
  createBookingScenario,
  getDate,
  getGoogleCalendarCredential,
  mockCalendar,
  TestData,
  Timezones,
} from "@calcom/testing/lib/bookingScenario/bookingScenario";
import { getAvailableSlotsService } from "@calcom/features/di/containers/AvailableSlots";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { describe, test } from "vitest";
import { expect } from "./expects";
import { setupAndTeardown } from "./setupAndTeardown";

const SHARED_CALENDAR_ID = "shared@group.calendar.google.com";

const freeBusyError = () =>
  new ErrorWithCode(ErrorCode.CalendarCheckFailed, "Google freebusy errors persisted after retry", {
    calendarIds: [SHARED_CALENDAR_ID],
  });

const singleHostScenario = () => ({
  eventTypes: [{ id: 1, slotInterval: 45, length: 45, users: [{ id: 101 }] }],
  users: [
    {
      ...TestData.users.example,
      id: 101,
      schedules: [TestData.schedules.IstWorkHours],
      credentials: [getGoogleCalendarCredential()],
      selectedCalendars: [TestData.selectedCalendars.google],
    },
  ],
  apps: [TestData.apps["google-calendar"]],
});

describe("getSchedule calendar check failures", () => {
  const availableSlotsService = getAvailableSlotsService();
  setupAndTeardown();

  const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
  const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
  const getSlots = (extraInput: { _failOnCalendarCheckFailure?: boolean; isTeamEvent?: boolean } = {}) =>
    availableSlotsService.getAvailableSlots({
      input: {
        eventTypeId: 1,
        eventTypeSlug: "",
        startTime: `${plus1DateString}T18:30:00.000Z`,
        endTime: `${plus2DateString}T18:29:59.999Z`,
        timeZone: Timezones["+5:30"],
        isTeamEvent: false,
        orgSlug: null,
        ...extraInput,
      },
    });

  test("throws CalendarCheckFailed with the failing calendar ids when Google freebusy fails", async () => {
    mockCalendar("googlecalendar", { getAvailabilityError: freeBusyError() });
    await createBookingScenario(singleHostScenario());

    const error = await getSlots({ _failOnCalendarCheckFailure: true }).catch((e) => e);

    expect(error).toBeInstanceOf(ErrorWithCode);
    expect(error.code).toBe(ErrorCode.CalendarCheckFailed);
    expect(error.data).toEqual({ calendarIds: [SHARED_CALENDAR_ID] });
  });

  test("throws CalendarCheckFailed with the selected calendar ids on any other calendar fetch failure", async () => {
    mockCalendar("googlecalendar", { getAvailabilityCrash: true });
    await createBookingScenario(singleHostScenario());

    const error = await getSlots({ _failOnCalendarCheckFailure: true }).catch((e) => e);

    expect(error.code).toBe(ErrorCode.CalendarCheckFailed);
    expect(error.data).toEqual({ calendarIds: [TestData.selectedCalendars.google.externalId] });
  });

  test("still returns slots around real busy times when the calendar check succeeds", async () => {
    mockCalendar("googlecalendar", {
      busySlots: [{ start: `${plus2DateString}T04:45:00.000Z`, end: `${plus2DateString}T23:00:00.000Z` }],
    });
    await createBookingScenario(singleHostScenario());

    const schedule = await getSlots({ _failOnCalendarCheckFailure: true });

    expect(schedule).toHaveTimeSlots([`04:00:00.000Z`], { dateString: plus2DateString });
  });

  test("without the flag, a failed calendar check still yields no slots instead of an error", async () => {
    mockCalendar("googlecalendar", { getAvailabilityError: freeBusyError() });
    await createBookingScenario(singleHostScenario());

    const schedule = await getSlots();

    expect(Object.values(schedule.slots).flat()).toHaveLength(0);
  });

  test("round robin events keep dropping the failed host instead of throwing", async () => {
    mockCalendar("googlecalendar", { getAvailabilityError: freeBusyError() });
    await createBookingScenario({
      eventTypes: [
        {
          id: 1,
          slotInterval: 60,
          length: 60,
          schedulingType: "ROUND_ROBIN",
          hosts: [
            { userId: 101, isFixed: false },
            { userId: 102, isFixed: false },
          ],
        },
      ],
      users: [
        {
          ...TestData.users.example,
          email: "example@example.com",
          id: 101,
          schedules: [TestData.schedules.IstEveningShift],
          credentials: [getGoogleCalendarCredential()],
          selectedCalendars: [TestData.selectedCalendars.google],
        },
        {
          ...TestData.users.example,
          email: "example1@example.com",
          id: 102,
          schedules: [TestData.schedules.IstMorningShift],
          defaultScheduleId: 2,
        },
      ],
      apps: [TestData.apps["google-calendar"]],
    });

    const schedule = await getSlots({ _failOnCalendarCheckFailure: true, isTeamEvent: true });

    // Only the morning-shift host (102) is offered; the failed evening-shift host (101) is dropped
    expect(schedule).toHaveTimeSlots(
      [
        `04:30:00.000Z`,
        `05:30:00.000Z`,
        `06:30:00.000Z`,
        `07:30:00.000Z`,
        `08:30:00.000Z`,
        `09:30:00.000Z`,
        `10:30:00.000Z`,
        `11:30:00.000Z`,
      ],
      { dateString: plus2DateString }
    );
  });
});
