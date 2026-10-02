-- CreateTable
CREATE TABLE "public"."EmailArchiveCopy" (
    "id" SERIAL NOT NULL,
    "bookingUid" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailArchiveCopy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailArchiveCopy_bookingUid_idx" ON "public"."EmailArchiveCopy"("bookingUid");

-- CreateIndex
CREATE INDEX "EmailArchiveCopy_sentAt_idx" ON "public"."EmailArchiveCopy"("sentAt");
