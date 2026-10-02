import { PrismaReadService } from "@/modules/prisma/prisma-read.service";
import { Injectable } from "@nestjs/common";

export const DEFAULT_TAKE = 25;
// Each copy carries the full HTML body (~30–50 KB), so keep pages small.
export const MAX_TAKE = 50;

export type EmailCopy = {
  id: number;
  bookingUid: string;
  type: string;
  recipient: string;
  subject: string;
  html: string;
  text: string;
  sentAt: Date;
  leadId: string;
};

type EmailCopyRow = Omit<EmailCopy, "leadId"> & { leadId: string | null };

@Injectable()
export class EmailCopiesService {
  constructor(private readonly dbRead: PrismaReadService) {}

  /**
   * Archived booking e-mails for bookings organized by `userId`, oldest first, after the `afterId` cursor.
   *
   * EmailArchiveCopy has no Prisma relation to Booking, so the join happens in SQL. The organizer filter
   * sits inside the query (not applied to a fetched page afterwards), which means a page shorter than
   * `take` really is the end of this user's copies — the consumer stops paging on a short page.
   */
  async getEmailCopies(params: { userId: number; afterId: number; take: number }): Promise<EmailCopy[]> {
    const afterId = Math.max(0, Math.trunc(params.afterId) || 0);
    const take = Math.min(MAX_TAKE, Math.max(1, Math.trunc(params.take) || 1));

    const rows = await this.dbRead.prisma.$queryRaw<EmailCopyRow[]>`
      SELECT c."id", c."bookingUid", c."type", c."recipient", c."subject", c."html", c."text", c."sentAt",
             b."metadata"->>'lead_id' AS "leadId"
      FROM "EmailArchiveCopy" c
      JOIN "Booking" b ON b."uid" = c."bookingUid"
      WHERE c."id" > ${afterId} AND b."userId" = ${params.userId}
      ORDER BY c."id" ASC
      LIMIT ${take}`;

    return rows.map((row) => ({
      id: row.id,
      bookingUid: row.bookingUid,
      type: row.type,
      recipient: row.recipient,
      subject: row.subject,
      html: row.html,
      text: row.text,
      sentAt: row.sentAt,
      leadId: row.leadId ?? "",
    }));
  }
}
