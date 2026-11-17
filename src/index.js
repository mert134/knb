const { startBot } = require('./bot');
const { createWebApp } = require('./web');

async function main() {
  const required = ['DISCORD_BOT_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'SESSION_SECRET', 'GUILD_ID'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    console.error(`Eksik ortam değişkenleri: ${missing.join(', ')}`);
    process.exit(1);
  }

  const port = Number(process.env.PORT || 3000);
  const bot = await startBot();
  const app = createWebApp(bot);
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`KNBot kontrol paneli ${port} portunda hazır.`);
  });

  const shutdown = async () => {
    server.close();
    await bot.destroy();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error) => {
  console.error('Uygulama başlatılamadı:', error);
  process.exit(1);
});
