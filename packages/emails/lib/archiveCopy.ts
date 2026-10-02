import type { PrismaClient } from "@calcom/prisma";

// Fork-only (ADR-0066): a staging copy of every booking email Cal sends to an external
// (non-Cal-user) recipient. The app pulls copies via its own endpoint; Cal only keeps them
// for THIRTY_DAYS_MS before deleting them, so a cleanup pass piggybacks on every call here.
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Splits on commas, except for commas inside a double-quoted display name. */
function splitRespectingQuotes(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of value) {
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === "," && !inQuotes) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);

  return parts;
}

/**
 * Parses a nodemailer `to` header into lower-cased bare addresses.
 * Handles `"Name <a@b.cz>"`, comma-separated lists (including a quoted display name
 * that itself contains a comma, e.g. `"Novák, Jan" <jan@x.cz>`), bare addresses, and a
 * stray `<`/`>` with no matching pair — a pre-existing upstream bug in a couple of
 * organizer templates builds `to` as `${email}>` with no `<` at all.
 */
export function extractAddresses(to: string): string[] {
  if (!to) return [];

  return splitRespectingQuotes(to)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/<(.+)>/);
      const candidate = match ? match[1] : part;
      return candidate.replace(/[<>]/g, "").trim().toLowerCase();
    })
    .filter(Boolean);
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
