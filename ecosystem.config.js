/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");

module.exports = {
  apps: [
    {
      name: "uscc-giaidau",
      cwd: __dirname,
      script: path.join(__dirname, "node_modules/next/dist/bin/next"),
      args: "start --hostname 127.0.0.1 --port 3005",
      exec_mode: "fork",
      instances: 1, // SQLite: một process, không dùng cluster.
      autorestart: true,
      restart_delay: 3000,
      kill_timeout: 10000,
      time: true,
      env_production: {
        NODE_ENV: "production",
        PORT: "3005",
        HOSTNAME: "127.0.0.1",
        NEXT_TELEMETRY_DISABLED: "1",
        // DATABASE_URL và SESSION_SECRET: deploy.sh nạp từ .env, không lưu secret trong Git.
      },
    },
  ],
};
