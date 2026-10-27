-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "clientOpId" TEXT;

-- AlterTable
ALTER TABLE "Match" ADD COLUMN "blackPoints" REAL;
ALTER TABLE "Match" ADD COLUMN "exceptionReason" TEXT;
ALTER TABLE "Match" ADD COLUMN "whitePoints" REAL;

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_clientOpId_key" ON "AuditLog"("clientOpId");

