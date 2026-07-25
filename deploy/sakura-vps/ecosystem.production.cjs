const path = require("node:path");

const appRoot = process.env.APP_ROOT || "/var/www/lol-type-choice";
const currentDirectory = path.join(appRoot, "current");

module.exports = {
  apps: [
    {
      name: "lol-type-choice",
      cwd: currentDirectory,
      script: "server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      time: true,
      merge_logs: true,
      output: "/var/log/lol-type-choice/output.log",
      error: "/var/log/lol-type-choice/error.log",
      env: {
        NODE_ENV: "production",
        HOSTNAME: "127.0.0.1",
        PORT: "3000"
      }
    }
  ]
};
