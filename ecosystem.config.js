module.exports = {
  apps: [
    {
      name: "sadvrfqtvw4-backend",
      cwd: "/var/www/sadvrfqtvw4-main",
      script: "dist-server/server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        CORS_ORIGIN: "https://example.com",
        JWT_SECRET: "change-this-secret",
        ENCRYPTION_KEY: "change-this-message-key",
        DB_PATH: "/var/www/sadvrfqtvw4-main/database.sqlite",
        UPLOADS_DIR: "/var/www/sadvrfqtvw4-main/uploads",
        MAX_UPLOAD_SIZE_MB: 2048
      }
    }
  ]
};
