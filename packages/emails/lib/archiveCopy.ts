import type { PrismaClient } from "@calcom/prisma";

// Fork-only (ADR-0066): a staging copy of every booking email Cal sends to an external
// (non-Cal-user) recipient. The app pulls copies via its own endpoint; Cal only keeps them
// for THIRTY_DAYS_MS before deleting them, so a cleanup pass piggybacks on every call here.
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Matches an email-shaped token anywhere in the header: a run of characters that
// aren't whitespace, <, >, ", a comma, or a semicolon, on either side of an '@'.
const EMAIL_TOKEN_PATTERN = /[^\s<>",;]+@[^\s<>",;]+/g;

/**
 * Parses a nodemailer `to` header into lower-cased, de-duplicated bare addresses, in
 * the order they first appear. Scans the whole header for email-shaped tokens instead
 * of splitting on commas and stripping `<...>` — that earlier approach lost addresses
 * entirely on malformed input, e.g. an unbalanced quote (`'Jan" <jan@x.cz>, bob@b.cz'`)
 * swallowed everything after the stray `"`. A single scan can't drop a trailing
 * address no matter how the header is malformed; it also handles a stray `<`/`>` with
 * no matching pair (a pre-existing upstream bug in a couple of organizer templates
 * builds `to` as `${email}>` with no `<` at all) and a display name that itself
 * contains an `@` (it matches twice but de-dupes to one address).
 */
export function extractAddresses(to: string): string[] {
  if (!to) return [];

  const seen = new Set<string>();
  const addresses: string[] = [];

  for (const match of to.match(EMAIL_TOKEN_PATTERN) ?? []) {
    const address = match.toLowerCase();
    if (!seen.has(address)) {
      seen.add(address);
      addresses.push(address);
    }
  }

  return addresses;
}

/**
 * True iff there is a booking to attach the copy to AND at least one recipient
 * address is not a Cal user (i.e. the email went "outside", per ADR-0066 point 2).
 */
export function shouldArchive({
  bookingUid,
  addresses,
  calUserEmails,
}: {
  bookingUid: string;
  addresses: string[];
  calUserEmails: string[];
}): boolean {
  if (!bookingUid) return false;

  const calUserSet = new Set(calUserEmails.map((email) => email.toLowerCase()));
  return addresses.some((address) => !calUserSet.has(address.toLowerCase()));
}

/**
 * Fire-and-forget archive write for `BaseEmail.sendEmail`. Never throws and never delays
 * the send result — the whole body is wrapped in try/catch, logging EMAIL_ARCHIVE_ERROR.
 */
export async function archiveCopy(
  prisma: PrismaClient,
  payload: Record<string, unknown>,
  meta: { bookingUid: string; type: string }
): Promise<void> {
  try {
    const to = typeof payload.to === "string" ? payload.to : "";
    const addresses = extractAddresses(to);

    const calUsers = await prisma.user.findMany({
      where: { email: { in: addresses, mode: "insensitive" } },
      select: { email: true },
    });
    const calUserEmails = calUsers.map((user) => user.email);

    if (shouldArchive({ bookingUid: meta.bookingUid, addresses, calUserEmails })) {
      await prisma.emailArchiveCopy.create({
        data: {
          bookingUid: meta.bookingUid,
          type: meta.type,
          recipient: to,
          subject: typeof payload.subject === "string" ? payload.subject : "",
          html: typeof payload.html === "string" ? payload.html : "",
          text: typeof payload.text === "string" ? payload.text : "",
        },
      });
    }

    await prisma.emailArchiveCopy.deleteMany({
      where: { sentAt: { lt: new Date(Date.now() - THIRTY_DAYS_MS) } },
    });
  } catch (e) {
    console.error("EMAIL_ARCHIVE_ERROR", e);
  }
}
