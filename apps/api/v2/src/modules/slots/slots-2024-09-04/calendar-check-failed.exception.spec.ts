import type { ArgumentsHost } from "@nestjs/common";
import { HttpExceptionFilter } from "@/filters/http-exception.filter";
import { CalendarCheckFailedException } from "@/modules/slots/slots-2024-09-04/calendar-check-failed.exception";

describe("CalendarCheckFailedException through HttpExceptionFilter", () => {
  it("responds 424 with a stable CALENDAR_CHECK_FAILED code and the failing calendar ids", () => {
    const json = jest.fn();
    const response = { status: jest.fn().mockReturnValue({ json }), setHeader: jest.fn() };
    const request = { url: "/v2/slots?eventTypeId=1", method: "GET", headers: {}, body: {} };
    const host = {
      switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
    } as unknown as ArgumentsHost;

    new HttpExceptionFilter().catch(
      new CalendarCheckFailedException(["shared@group.calendar.google.com", "jan@example.com"]),
      host
    );

    expect(response.status).toHaveBeenCalledWith(424);
    expect(json).toHaveBeenCalledWith({
      status: "error",
      timestamp: expect.any(String),
      path: "/v2/slots?eventTypeId=1",
      error: {
        code: "CALENDAR_CHECK_FAILED",
        message:
          "Calendar availability could not be checked for calendars: shared@group.calendar.google.com, jan@example.com",
        details: {
          message:
            "Calendar availability could not be checked for calendars: shared@group.calendar.google.com, jan@example.com",
          calendarIds: ["shared@group.calendar.google.com", "jan@example.com"],
        },
      },
    });
  });
});
