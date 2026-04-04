/**
 * PM2 process file — default port 3002 (override: PORT=3000 pnpm pm2:start).
 * @see https://pm2.keymetrics.io/docs/usage/application-declaration/
 */
const port = Number.parseInt(process.env.PORT || '3002', 10) || 3002

module.exports = {
  apps: [
    {
      name: 'bubble-bobble',
      script: 'serve.mjs',
      interpreter: 'node',
      args: `--port ${port}`,
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
