/**
 * PM2 process file for the compiled API on a plain VPS.
 *   cd backend && npm ci && npm run build
 *   pm2 start ../deployment/ecosystem.config.cjs --env production
 *   pm2 save && pm2 startup
 */
module.exports = {
  apps: [
    {
      name: 'showroom-api',
      cwd: __dirname + '/../backend',
      script: 'dist/server.js',
      instances: 1, // keep at 1 unless the API is confirmed stateless-safe for clustering
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      error_file: '../logs/api-error.log',
      out_file: '../logs/api-out.log',
      time: true,
    },
  ],
};
