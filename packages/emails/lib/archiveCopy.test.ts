import { describe, expect, it, vi } from "vitest";

import { archiveCopy, extractAddresses, shouldArchive } from "./archiveCopy";

describe("extractAddresses", () => {
  it("extracts a bare address", () => {
    expect(extractAddresses("a@b.cz")).toEqual(["a@b.cz"]);
  });

  it("extracts an address from a display name", () => {
    expect(extractAddresses("Jana Nováková <jana@firma.cz>")).toEqual(["jana@firma.cz"]);
  });

  it("extracts a comma-separated list of mixed forms", () => {
    expect(extractAddresses("Jana Nováková <jana@firma.cz>, bob@b.cz")).toEqual([
      "jana@firma.cz",
      "bob@b.cz",
    ]);
  });

  it("lower-cases addresses", () => {
    expect(extractAddresses("Jana NOVÁKOVÁ <JANA@FIRMA.CZ>")).toEqual(["jana@firma.cz"]);
  });

  it("returns an empty array for an empty string", () => {
    expect(extractAddresses("")).toEqual([]);
  });

  it("strips a stray trailing '>' with no matching '<' (upstream organizer-daily-video bug)", () => {
    expect(extractAddresses("org@x.cz>")).toEqual(["org@x.cz"]);
  });

  it("keeps a quoted display name containing a comma as a single address", () => {
    expect(extractAddresses('"Novák, Jan" <jan@x.cz>')).toEqual(["jan@x.cz"]);
  });

  it("keeps a quoted comma-containing name intact in a longer list", () => {
    expect(extractAddresses('"Novák, Jan" <jan@x.cz>, bob@b.cz')).toEqual(["jan@x.cz", "bob@b.cz"]);
  });
});

describe("shouldArchive", () => {
  it("is true for an external address with a booking uid", () => {
    expect(
      shouldArchive({
        bookingUid: "uid-1",
        addresses: ["external@firma.cz"],
        calUserEmails: [],
      })
    ).toBe(true);
  });

  it("is false when every address belongs to a Cal user", () => {
    expect(
      shouldArchive({
        bookingUid: "uid-1",
        addresses: ["organizer@cal.com"],
        calUserEmails: ["organizer@cal.com"],
      })
    ).toBe(false);
  });

  it("is false without a booking uid, even for an external address", () => {
    expect(
      shouldArchive({
        bookingUid: "",
        addresses: ["external@firma.cz"],
        calUserEmails: [],
      })
    ).toBe(false);
  });

  it("is true for a mixed to-list with at least one external address", () => {
    expect(
      shouldArchive({
        bookingUid: "uid-1",
        addresses: ["organizer@cal.com", "external@firma.cz"],
        calUserEmails: ["organizer@cal.com"],
      })
    ).toBe(true);
  });

  it("compares case-insensitively", () => {
    expect(
      shouldArchive({
        bookingUid: "uid-1",
        addresses: ["Organizer@Cal.com"],
        calUserEmails: ["organizer@cal.com"],
      })
    ).toBe(false);
  });
});

describe("archiveCopy", () => {
  const basePayload = {
    to: "Jana Nováková <jana@firma.cz>",
    subject: "Potvrzení",
    html: "<p>html</p>",
    text: "text",
  };

  function makePrisma({
    findManyResult = [] as { email: string }[],
    findManyImpl,
    createImpl,
  }: {
    findManyResult?: { email: string }[];
    findManyImpl?: () => Promise<unknown>;
    createImpl?: () => Promise<unknown>;
  } = {}) {
    return {
      user: {
        findMany: findManyImpl ?? vi.fn().mockResolvedValue(findManyResult),
      },
      emailArchiveCopy: {
        create: createImpl ?? vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  it("inserts a copy for an external recipient and prunes old copies", async () => {
    const prisma = makePrisma();

    await archiveCopy(prisma, basePayload, { bookingUid: "uid-1", type: "potvrzeni" });

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { email: { in: ["jana@firma.cz"], mode: "insensitive" } },
      select: { email: true },
    });
    expect(prisma.emailArchiveCopy.create).toHaveBeenCalledWith({
      data: {
        bookingUid: "uid-1",
        type: "potvrzeni",
        recipient: "Jana Nováková <jana@firma.cz>",
        subject: "Potvrzení",
        html: "<p>html</p>",
        text: "text",
      },
    });
    expect(prisma.emailArchiveCopy.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("does not insert when every recipient is a Cal user", async () => {
    const prisma = makePrisma({ findManyResult: [{ email: "jana@firma.cz" }] });

    await archiveCopy(prisma, basePayload, { bookingUid: "uid-1", type: "potvrzeni" });

    expect(prisma.emailArchiveCopy.create).not.toHaveBeenCalled();
    expect(prisma.emailArchiveCopy.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("does not insert without a booking uid", async () => {
    const prisma = makePrisma();

    await archiveCopy(prisma, basePayload, { bookingUid: "", type: "potvrzeni" });

    expect(prisma.emailArchiveCopy.create).not.toHaveBeenCalled();
    expect(prisma.emailArchiveCopy.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("swallows a rejected findMany and never throws", async () => {
    const prisma = makePrisma({
      findManyImpl: vi.fn().mockRejectedValue(new Error("db down")),
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      archiveCopy(prisma, basePayload, { bookingUid: "uid-1", type: "potvrzeni" })
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith("EMAIL_ARCHIVE_ERROR", expect.any(Error));
    errorSpy.mockRestore();
  });

  it("swallows a rejected create and never throws", async () => {
    const prisma = makePrisma({
      createImpl: vi.fn().mockRejectedValue(new Error("constraint violation")),
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      archiveCopy(prisma, basePayload, { bookingUid: "uid-1", type: "potvrzeni" })
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith("EMAIL_ARCHIVE_ERROR", expect.any(Error));
    errorSpy.mockRestore();
  });
});
