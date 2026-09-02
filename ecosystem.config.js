module.exports = {
  apps: [
    {
      name: "whatsapp-bot",
      script: "index.js",
      watch: false,
      autorestart: true,
      min_uptime: "20s",
      max_restarts: 100,
      restart_delay: 4000,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
