const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} = require('discord.js');

const GUILD_ID = process.env.GUILD_ID;
const commands = [
  new SlashCommandBuilder().setName('slot').setDescription('Slot makinesini çevir ve şansını dene.'),
  new SlashCommandBuilder().setName('zar').setDescription('Belirlediğin aralıkta zar at.')
    .addIntegerOption((option) => option.setName('min').setDescription('En küçük sayı').setMinValue(1))
    .addIntegerOption((option) => option.setName('max').setDescription('En büyük sayı').setMinValue(2)),
  new SlashCommandBuilder().setName('yazitura').setDescription('Yazı mı tura mı?'),
  new SlashCommandBuilder().setName('8top').setDescription('Sekiz topa bir soru sor.')
    .addStringOption((option) => option.setName('soru').setDescription('Sorun').setRequired(true).setMaxLength(200)),
  new SlashCommandBuilder().setName('kick').setDescription('Bir üyeyi sunucudan at.')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((option) => option.setName('uye').setDescription('Atılacak üye').setRequired(true))
    .addStringOption((option) => option.setName('sebep').setDescription('İşlem sebebi').setMaxLength(400)),
  new SlashCommandBuilder().setName('ban').setDescription('Bir üyeyi sunucudan yasakla.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((option) => option.setName('uye').setDescription('Yasaklanacak üye').setRequired(true))
    .addStringOption((option) => option.setName('sebep').setDescription('İşlem sebebi').setMaxLength(400)),
  new SlashCommandBuilder().setName('sustur').setDescription('Bir üyeye zaman aşımı uygula.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName('uye').setDescription('Susturulacak üye').setRequired(true))
    .addIntegerOption((option) => option.setName('dakika').setDescription('Süre (dakika)').setRequired(true).setMinValue(1).setMaxValue(40320))
    .addStringOption((option) => option.setName('sebep').setDescription('İşlem sebebi').setMaxLength(400)),
].map((command) => command.toJSON());

const slots = ['🍒', '🍋', '🍇', '🔔', '⭐', '💎', '🍀'];
const answers = ['Kesinlikle!', 'Bence evet.', 'Olabilir.', 'Tekrar sor.', 'Pek sanmıyorum.', 'Görünüşe göre hayır.', 'Yıldızlar şu an kararsız.'];

async function startBot() {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  client.once('ready', async () => {
    console.log(`${client.user.tag} olarak giriş yapıldı.`);
    try {
      const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
      await rest.put(Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, GUILD_ID), { body: commands });
      console.log('Sunucu komutları güncellendi.');
    } catch (error) {
      console.error('Slash komutları yüklenemedi:', error.message);
    }
  });

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const command = interaction.commandName;
    try {
      if (command === 'slot') {
        const reels = Array.from({ length: 3 }, () => slots[Math.floor(Math.random() * slots.length)]);
        const win = reels.every((item) => item === reels[0]);
        const pair = !win && new Set(reels).size === 2;
        const embed = new EmbedBuilder()
          .setColor(win ? 0x35d39a : pair ? 0xf2bd54 : 0x8b83f6)
          .setTitle('🎰 Şansını dene!')
          .setDescription(`## ${reels.join('  ')}\n\n${win ? '🎉 JACKPOT! Üçü de aynı!' : pair ? '✨ İkili eşleşme, fena değil!' : 'Bir dahaki sefere!'}\n\n${interaction.user} çevirdi.`);
        return interaction.reply({ embeds: [embed] });
      }
      if (command === 'zar') {
        const min = interaction.options.getInteger('min') ?? 1;
        const max = interaction.options.getInteger('max') ?? 6;
        if (max < min) return interaction.reply({ content: 'En büyük sayı en küçük sayıdan az olamaz.', ephemeral: true });
        return interaction.reply(`🎲 **${min}–${max}** arasında gelen sayı: **${Math.floor(Math.random() * (max - min + 1)) + min}**`);
      }
      if (command === 'yazitura') return interaction.reply(`🪙 Para havada... **${Math.random() < 0.5 ? 'Yazı' : 'Tura'}!**`);
      if (command === '8top') return interaction.reply(`🎱 **${interaction.options.getString('soru')}**\n${answers[Math.floor(Math.random() * answers.length)]}`);
      if (command === 'kick' || command === 'ban' || command === 'sustur') {
        const target = interaction.options.getUser('uye');
        const reason = interaction.options.getString('sebep') || `Komut: /${command}`;
        const member = await interaction.guild.members.fetch(target.id);
        const moderator = await interaction.guild.members.fetch(interaction.user.id);
        const requiredPermission = command === 'kick' ? PermissionFlagsBits.KickMembers : command === 'ban' ? PermissionFlagsBits.BanMembers : PermissionFlagsBits.ModerateMembers;
        if (moderator.id !== interaction.guild.ownerId && !moderator.permissions.has(requiredPermission)) {
          return interaction.reply({ content: 'Bu komut için gerekli Discord yetkin yok.', ephemeral: true });
        }
        if (member.id === interaction.user.id) return interaction.reply({ content: 'Kendin üzerinde bu işlemi yapamazsın.', ephemeral: true });
        if (member.id === interaction.guild.ownerId || (moderator.id !== interaction.guild.ownerId && member.roles.highest.comparePositionTo(moderator.roles.highest) >= 0)) {
          return interaction.reply({ content: 'Rol sıralamasına göre bu üyeye işlem yapamazsın.', ephemeral: true });
        }
        if (command === 'kick') await member.kick(reason);
        if (command === 'ban') await member.ban({ reason });
        if (command === 'sustur') await member.timeout(interaction.options.getInteger('dakika') * 60_000, reason);
        return interaction.reply(`✅ **${target.tag}** için ${command === 'sustur' ? 'zaman aşımı uygulandı' : command === 'ban' ? 'yasaklandı' : 'sunucudan atıldı'}. Sebep: ${reason}`);
      }
    } catch (error) {
      console.error(`/${command} komutu başarısız:`, error);
      const message = { content: 'İşlem yapılamadı. Bot izinlerini ve hedef üyenin rol sıralamasını kontrol et.', ephemeral: true };
      if (interaction.replied || interaction.deferred) return interaction.followUp(message);
      return interaction.reply(message);
    }
  });

  await client.login(process.env.DISCORD_BOT_TOKEN);
  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.fetch();
  return client;
}

module.exports = { startBot };
