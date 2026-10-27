ALTER TABLE "Tournament" ADD COLUMN "requireTechnicalApproval" BOOLEAN NOT NULL DEFAULT false;

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tournamentId" TEXT,
    "roundNumber" INTEGER,
    "board" INTEGER,
    "matchId" TEXT,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT,
    "clientOpId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AuditLog" ("action", "board", "clientOpId", "createdAt", "id", "matchId", "newValue", "oldValue", "reason", "roundNumber", "tournamentId", "userId")
SELECT "action", "board", "clientOpId", "createdAt", "id", "matchId", "newValue", "oldValue", "reason", "roundNumber", "tournamentId", "userId" FROM "AuditLog";
DROP TABLE "AuditLog";
ALTER TABLE "new_AuditLog" RENAME TO "AuditLog";
CREATE UNIQUE INDEX "AuditLog_clientOpId_key" ON "AuditLog"("clientOpId");
CREATE INDEX "AuditLog_matchId_createdAt_idx" ON "AuditLog"("matchId", "createdAt");
CREATE INDEX "AuditLog_tournamentId_createdAt_idx" ON "AuditLog"("tournamentId", "createdAt");

CREATE TABLE "new_Match" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roundId" TEXT NOT NULL,
    "board" INTEGER NOT NULL,
    "whitePlayerId" TEXT NOT NULL,
    "blackPlayerId" TEXT,
    "whitePoints" REAL,
    "blackPoints" REAL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_RESULT',
    "exceptionReason" TEXT,
    "result" TEXT,
    "resultVersion" INTEGER NOT NULL DEFAULT 0,
    "whiteConfirmedAt" DATETIME,
    "blackConfirmedAt" DATETIME,
    "enteredById" TEXT,
    "enteredAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Match_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Match_whitePlayerId_fkey" FOREIGN KEY ("whitePlayerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Match_blackPlayerId_fkey" FOREIGN KEY ("blackPlayerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Match_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Match" ("blackConfirmedAt", "blackPlayerId", "blackPoints", "board", "enteredAt", "enteredById", "exceptionReason", "id", "result", "resultVersion", "roundId", "status", "updatedAt", "whiteConfirmedAt", "whitePlayerId", "whitePoints")
SELECT "blackConfirmedAt", "blackPlayerId", "blackPoints", "board", "enteredAt", "enteredById", "exceptionReason", "id", "result", "resultVersion", "roundId", "status", "updatedAt", "whiteConfirmedAt", "whitePlayerId", "whitePoints" FROM "Match";
DROP TABLE "Match";
ALTER TABLE "new_Match" RENAME TO "Match";
CREATE INDEX "Match_status_idx" ON "Match"("status");
CREATE UNIQUE INDEX "Match_roundId_board_key" ON "Match"("roundId", "board");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
