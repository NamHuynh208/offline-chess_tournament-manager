-- Chỉ nâng tài khoản bootstrap admin, không cấp quyền quản lý user cho TTKT khác.
UPDATE "User"
SET "role" = 'ADMIN', "sessionVersion" = "sessionVersion" + 1
WHERE "username" = 'admin' AND "role" = 'TECHNICAL_ARBITER';
