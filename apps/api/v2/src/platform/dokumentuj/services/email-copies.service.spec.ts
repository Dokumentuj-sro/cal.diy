import { EmailCopiesService, MAX_TAKE } from "@/platform/dokumentuj/services/email-copies.service";
import type { PrismaReadService } from "@/modules/prisma/prisma-read.service";

type RawCall = { sql: string; values: unknown[] };

function makeService(rows: unknown[] = []) {
  const calls: RawCall[] = [];
  const $queryRaw = jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ sql: strings.join("?"), values });
    return Promise.resolve(rows);
  });
  const dbRead = { prisma: { $queryRaw } } as unknown as PrismaReadService;
  return { service: new EmailCopiesService(dbRead), calls };
}

describe("EmailCopiesService", () => {
  it("filters by the booking organizer inside the database query", async () => {
    const { service, calls } = makeService();

    await service.getEmailCopies({ userId: 42, afterId: 7, take: 25 });

    expect(calls).toHaveLength(1);
    const { sql, values } = calls[0];
    expect(sql).toMatch(/JOIN\s+"Booking"\s+\w+\s+ON\s+\w+\."uid"\s*=\s*\w+\."bookingUid"/);
    expect(sql).toMatch(/\."userId"\s*=\s*\?/);
    expect(sql).toMatch(/\."id"\s*>\s*\?/);
    expect(sql).toMatch(/ORDER BY\s+\w+\."id"\s+ASC/);
    expect(sql).toMatch(/LIMIT\s+\?/);
    // order of placeholders: afterId, userId, take
    expect(values).toEqual([7, 42, 25]);
  });

  it("clamps take to the maximum", async () => {
    const { service, calls } = makeService();

    await service.getEmailCopies({ userId: 1, afterId: 0, take: 500 });

    expect(MAX_TAKE).toBe(50);
    expect(calls[0].values[2]).toBe(50);
  });

  it("raises take below 1 to 1 and a negative afterId to 0", async () => {
    const { service, calls } = makeService();

    await service.getEmailCopies({ userId: 1, afterId: -5, take: 0 });

    expect(calls[0].values).toEqual([0, 1, 1]);
  });

  it("maps rows to the output shape with leadId defaulting to an empty string", async () => {
    const sentAt = new Date("2026-10-02T10:00:00.000Z");
    const { service } = makeService([
      {
        id: 3,
        bookingUid: "uid-a",
        type: "potvrzeno",
        recipient: "jan@example.cz",
        subject: "Potvrzeno",
        html: "<p>x</p>",
        text: "x",
        sentAt,
        leadId: "123",
      },
      {
        id: 5,
        bookingUid: "uid-b",
        type: "zruseno",
        recipient: "eva@example.cz",
        subject: "Zrušeno",
        html: "<p>y</p>",
        text: "y",
        sentAt,
        leadId: null,
      },
    ]);

    const result = await service.getEmailCopies({ userId: 1, afterId: 0, take: 25 });

    expect(result).toEqual([
      {
        id: 3,
        bookingUid: "uid-a",
        type: "potvrzeno",
        recipient: "jan@example.cz",
        subject: "Potvrzeno",
        html: "<p>x</p>",
        text: "x",
        sentAt,
        leadId: "123",
      },
      {
        id: 5,
        bookingUid: "uid-b",
        type: "zruseno",
        recipient: "eva@example.cz",
        subject: "Zrušeno",
        html: "<p>y</p>",
        text: "y",
        sentAt,
        leadId: "",
      },
    ]);
  });
});
