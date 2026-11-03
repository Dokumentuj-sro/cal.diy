import { HttpException, HttpStatus } from "@nestjs/common";

export const CALENDAR_CHECK_FAILED = "CALENDAR_CHECK_FAILED";

/**
 * 424 rather than 5xx: clients treat 5xx as "Cal is down", while this only means one host's
 * calendar couldn't be read, so their availability is unknown (not "fully booked").
 */
export class CalendarCheckFailedException extends HttpException {
  constructor(calendarIds: string[]) {
    super(
      {
        message: `Calendar availability could not be checked for calendars: ${calendarIds.join(", ")}`,
        calendarIds,
      },
      HttpStatus.FAILED_DEPENDENCY
    );
    // HttpExceptionFilter uses the exception name as the response's error.code
    this.name = CALENDAR_CHECK_FAILED;
  }
}
