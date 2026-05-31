const path = require('path');

module.exports = {
  apps: [
    {
      name: 'gotchiverse-live',
      script: 'pnpm',
      args: '--filter @gotchiverse/server exec tsx src/entry.ts',
      cwd: path.resolve(__dirname),

      // Auto-restart configuration
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',

      // Restart behavior
      min_uptime: '10s', // Consider it stable after 10 seconds
      max_restarts: 50, // Maximum restarts in 1 minute window
      restart_delay: 4000, // Wait 4 seconds before restarting

      // Error handling
      stop_exit_codes: [0], // Don't restart on clean exit
      kill_timeout: 5000, // Wait 5 seconds for graceful shutdown

      // Logging configuration
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      time: true, // Add timestamps to logs
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true, // Merge logs from all instances

      // Environment variables
      env: {
        NODE_ENV: 'production',
        PORT: '1999',
      },
    },
  ],
};
