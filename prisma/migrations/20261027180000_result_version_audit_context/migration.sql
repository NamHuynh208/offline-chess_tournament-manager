ALTER TABLE "Match" ADD COLUMN "resultVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AuditLog" ADD COLUMN "tournamentId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "roundNumber" INTEGER;
ALTER TABLE "AuditLog" ADD COLUMN "board" INTEGER;

UPDATE "AuditLog"
SET "tournamentId" = (SELECT r."tournamentId" FROM "Match" m JOIN "Round" r ON r.id = m."roundId" WHERE m.id = "AuditLog"."matchId"),
    "roundNumber" = (SELECT r.number FROM "Match" m JOIN "Round" r ON r.id = m."roundId" WHERE m.id = "AuditLog"."matchId"),
    "board" = (SELECT m.board FROM "Match" m WHERE m.id = "AuditLog"."matchId")
WHERE "matchId" IS NOT NULL;

CREATE INDEX "AuditLog_tournamentId_createdAt_idx" ON "AuditLog"("tournamentId", "createdAt");
