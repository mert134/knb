const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { ChannelType, PermissionFlagsBits } = require('discord.js');

const API = 'https://discord.com/api/v10';
const GUILD_ID = process.env.GUILD_ID;
const permissionFor = {
  kick: PermissionFlagsBits.KickMembers,
  ban: PermissionFlagsBits.BanMembers,
  timeout: PermissionFlagsBits.ModerateMembers,
  channels: PermissionFlagsBits.ManageChannels,
};

function createWebApp(bot) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: { directives: { ...helmet.contentSecurityPolicy.getDefaultDirectives(), 'script-src': ["'self'"], 'style-src': ["'self'"], 'img-src': ["'self'", 'data:', 'https://cdn.discordapp.com'] } } }));
  app.use(express.json({ limit: '32kb' }));
  app.use(session({
    name: 'knb.sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 },
  }));
  app.use('/api/', rateLimit({ windowMs: 60_000, limit: 100, standardHeaders: true, legacyHeaders: false }));

  const guild = () => bot.guilds.cache.get(GUILD_ID);
  const discordFetch = async (url, init = {}) => {
    const response = await fetch(`${API}${url}`, init);
    if (!response.ok) throw new Error(`Discord API ${response.status}: ${await response.text()}`);
    if (response.status === 204) return null;
    return response.json();
  };
  const requireLogin = (req, res, next) => req.session.user ? next() : res.status(401).json({ error: 'Oturum açmalısın.' });
  const requirePermission = (key) => async (req, res, next) => {
    try {
      const server = guild();
      if (!server) return res.status(503).json({ error: 'Bot sunucuya bağlı değil.' });
      const actor = await server.members.fetch(req.session.user.id);
      if (actor.id !== server.ownerId && !actor.permissions.has(permissionFor[key])) {
        return res.status(403).json({ error: 'Bu işlem için Discord sunucu iznin yetersiz.' });
      }
      req.actor = actor;
      next();
    } catch (error) {
      res.status(403).json({ error: 'Bu sunucuda işlem yapma yetkin doğrulanamadı.' });
    }
  };
  const requireActorAboveTarget = async (req, target, res) => {
    if (target.id === req.actor.id) { res.status(400).json({ error: 'Kendin üzerinde bu işlemi yapamazsın.' }); return false; }
    if (target.id === guild().ownerId) { res.status(403).json({ error: 'Sunucu sahibine işlem yapılamaz.' }); return false; }
    if (req.actor.id !== guild().ownerId && target.roles.highest.comparePositionTo(req.actor.roles.highest) >= 0) {
      res.status(403).json({ error: 'Hedef üyenin rolü senin rolünle aynı veya daha üstte.' }); return false;
    }
    return true;
  };
  const reasonFrom = (value, fallback) => String(value || fallback).trim().slice(0, 400) || fallback;
  const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((error) => {
    console.error('API hatası:', error);
    if (!res.headersSent) res.status(400).json({ error: error.message?.includes('Missing Permissions') ? 'Botun Discord izinleri yetersiz.' : 'İşlem yapılamadı. Bot izinlerini ve hedefi kontrol et.' });
  });

  app.get('/auth/login', (req, res) => {
    const state = crypto.randomBytes(24).toString('hex');
    req.session.oauthState = state;
    const callback = process.env.DISCORD_REDIRECT_URI;
    if (!callback) return res.status(500).send('DISCORD_REDIRECT_URI ayarlanmamış.');
    const params = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      redirect_uri: callback,
      response_type: 'code',
      scope: 'identify guilds',
      state,
      prompt: 'consent',
    });
    res.redirect(`https://discord.com/oauth2/authorize?${params}`);
  });

  app.get('/auth/callback', asyncRoute(async (req, res) => {
    if (req.query.error) return res.redirect('/?login=cancelled');
    if (!req.query.code || !req.query.state || req.query.state !== req.session.oauthState) return res.status(400).send('Oturum doğrulaması başarısız. Yeniden giriş yap.');
    delete req.session.oauthState;
    const form = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: req.query.code,
      redirect_uri: process.env.DISCORD_REDIRECT_URI,
    });
    const tokenResponse = await fetch(`${API}/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
    if (!tokenResponse.ok) throw new Error('Discord giriş belirteci alınamadı.');
    const token = await tokenResponse.json();
    const headers = { Authorization: `Bearer ${token.access_token}` };
    const [user, guilds] = await Promise.all([
      discordFetch('/users/@me', { headers }),
      discordFetch('/users/@me/guilds', { headers }),
    ]);
    const membership = guilds.find((item) => item.id === GUILD_ID);
    if (!membership) return res.status(403).send('Bu kontrol paneli için bağlı Discord sunucusunda üye olmalısın.');
    const perms = BigInt(membership.permissions);
    const canUsePanel = membership.owner || [PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageChannels].some((permission) => (perms & permission) === permission);
    if (!canUsePanel) return res.status(403).send('Panele giriş için Discord sunucusunda en az bir yönetim izni gerekiyor.');
    req.session.user = { id: user.id, username: user.username, globalName: user.global_name, avatar: user.avatar };
    res.redirect('/');
  }));

  app.post('/auth/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
  app.get('/api/me', (req, res) => res.json({ user: req.session.user || null, botReady: bot.isReady(), guildId: GUILD_ID }));

  app.get('/api/capabilities', requireLogin, asyncRoute(async (req, res) => {
    const server = guild();
    const actor = await server.members.fetch(req.session.user.id);
    const owner = actor.id === server.ownerId;
    res.json({
      kick: owner || actor.permissions.has(PermissionFlagsBits.KickMembers),
      ban: owner || actor.permissions.has(PermissionFlagsBits.BanMembers),
      timeout: owner || actor.permissions.has(PermissionFlagsBits.ModerateMembers),
      channels: owner || actor.permissions.has(PermissionFlagsBits.ManageChannels),
    });
  }));

  app.get('/api/state', requireLogin, asyncRoute(async (_req, res) => {
    const server = guild();
    if (!server) return res.status(503).json({ error: 'Bot sunucuya bağlı değil.' });
    const botMember = await server.members.fetchMe();
    res.json({
      guild: { id: server.id, name: server.name, icon: server.iconURL({ size: 128 }), memberCount: server.memberCount },
      bot: { tag: bot.user.tag, avatar: bot.user.displayAvatarURL({ size: 128 }), ready: bot.isReady(), permissions: {
        kick: botMember.permissions.has(PermissionFlagsBits.KickMembers),
        ban: botMember.permissions.has(PermissionFlagsBits.BanMembers),
        timeout: botMember.permissions.has(PermissionFlagsBits.ModerateMembers),
        channels: botMember.permissions.has(PermissionFlagsBits.ManageChannels),
      } },
    });
  }));

  app.get('/api/members', requireLogin, asyncRoute(async (req, res) => {
    const server = guild();
    const query = String(req.query.q || '').trim().slice(0, 32);
    let members;
    if (query.length) members = await server.members.search({ query, limit: 25 });
    else members = (await server.members.fetch({ limit: 100 })).filter((member) => !member.user.bot);
    res.json([...members.values()].filter((member) => !member.user.bot).slice(0, 100).map((member) => ({
      id: member.id,
      username: member.user.username,
      displayName: member.displayName,
      avatar: member.user.displayAvatarURL({ size: 64 }),
      role: member.roles.highest.name,
      isSelf: member.id === req.session.user.id,
    })));
  }));

  app.get('/api/channels', requireLogin, asyncRoute(async (_req, res) => {
    const channels = await guild().channels.fetch();
    const items = [...channels.values()].filter(Boolean).map((channel) => ({
      id: channel.id, name: channel.name, type: channel.type, parentId: channel.parentId,
      position: channel.position, topic: channel.topic || '', nsfw: channel.nsfw || false,
      bitrate: channel.bitrate || null, userLimit: channel.userLimit || null,
    }));
    res.json(items.sort((a, b) => a.position - b.position));
  }));

  app.post('/api/moderation/:action', requireLogin, asyncRoute(async (req, res) => {
    const action = req.params.action;
    if (!['kick', 'ban', 'timeout', 'untimeout'].includes(action)) return res.status(404).json({ error: 'Bilinmeyen işlem.' });
    const permissionKey = action === 'untimeout' ? 'timeout' : action;
    await new Promise((resolve, reject) => requirePermission(permissionKey)(req, res, (error) => error ? reject(error) : resolve()));
    if (res.headersSent) return;
    const { userId } = req.body || {};
    if (!/^\d{17,20}$/.test(String(userId || ''))) return res.status(400).json({ error: 'Geçerli bir üye seç.' });
    const server = guild();
    const target = await server.members.fetch(userId);
    if (!(await requireActorAboveTarget(req, target, res))) return;
    const reason = reasonFrom(req.body.reason, `Kontrol paneli · ${req.session.user.username}`);
    if (action === 'kick') await target.kick(reason);
    if (action === 'ban') await target.ban({ reason });
    if (action === 'timeout') {
      const minutes = Number(req.body.minutes);
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 40320) return res.status(400).json({ error: 'Süre 1 ile 40320 dakika arasında olmalı.' });
      await target.timeout(minutes * 60_000, reason);
    }
    if (action === 'untimeout') await target.timeout(null, reason);
    res.json({ ok: true, message: `${target.user.tag} için ${action} işlemi tamamlandı.` });
  }));

  app.post('/api/channels', requireLogin, asyncRoute(async (req, res) => {
    await new Promise((resolve, reject) => requirePermission('channels')(req, res, (error) => error ? reject(error) : resolve()));
    if (res.headersSent) return;
    const { name, kind, parentId, topic, bitrate, userLimit } = req.body || {};
    const channelName = String(name || '').trim().toLowerCase().replace(/\s+/g, '-').slice(0, 90);
    if (!/^[\w\-\u00C0-\u024F]+$/.test(channelName)) return res.status(400).json({ error: 'Kanal adı geçersiz.' });
    const types = { text: ChannelType.GuildText, voice: ChannelType.GuildVoice, category: ChannelType.GuildCategory };
    if (!types[kind]) return res.status(400).json({ error: 'Kanal türü geçersiz.' });
    const options = { name: channelName, type: types[kind], reason: `Kontrol paneli · ${req.session.user.username}` };
    if (kind !== 'category' && parentId) options.parent = parentId;
    if (kind === 'text' && topic) options.topic = String(topic).slice(0, 1024);
    if (kind === 'voice') {
      const requestedBitrate = Number(bitrate);
      const maxBitrate = req.actor.permissions.has(PermissionFlagsBits.Administrator) ? 384000 : 96000;
      if (Number.isInteger(requestedBitrate) && requestedBitrate >= 8000) options.bitrate = Math.min(requestedBitrate, maxBitrate);
      const limit = Number(userLimit);
      if (Number.isInteger(limit) && limit >= 0 && limit <= 99) options.userLimit = limit;
    }
    const channel = await guild().channels.create(options);
    res.json({ ok: true, id: channel.id, message: `#${channel.name} kanalı oluşturuldu.` });
  }));

  app.patch('/api/channels/:id', requireLogin, asyncRoute(async (req, res) => {
    await new Promise((resolve, reject) => requirePermission('channels')(req, res, (error) => error ? reject(error) : resolve()));
    if (res.headersSent) return;
    const channel = await guild().channels.fetch(req.params.id);
    if (!channel) return res.status(404).json({ error: 'Kanal bulunamadı.' });
    const body = req.body || {};
    const changes = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim().toLowerCase().replace(/\s+/g, '-').slice(0, 90);
      if (!/^[\w\-\u00C0-\u024F]+$/.test(name)) return res.status(400).json({ error: 'Kanal adı geçersiz.' });
      changes.name = name;
    }
    if (channel.type === ChannelType.GuildText && body.topic !== undefined) changes.topic = String(body.topic).slice(0, 1024);
    if (body.parentId !== undefined && channel.type !== ChannelType.GuildCategory) changes.parent = body.parentId || null;
    if (channel.type === ChannelType.GuildVoice) {
      if (body.userLimit !== undefined) changes.userLimit = Math.max(0, Math.min(99, Number(body.userLimit) || 0));
      if (body.bitrate !== undefined) changes.bitrate = Math.max(8000, Math.min(384000, Number(body.bitrate) || 64000));
    }
    await channel.edit({ ...changes, reason: `Kontrol paneli · ${req.session.user.username}` });
    res.json({ ok: true, message: `#${channel.name} güncellendi.` });
  }));

  app.delete('/api/channels/:id', requireLogin, asyncRoute(async (req, res) => {
    await new Promise((resolve, reject) => requirePermission('channels')(req, res, (error) => error ? reject(error) : resolve()));
    if (res.headersSent) return;
    const channel = await guild().channels.fetch(req.params.id);
    if (!channel) return res.status(404).json({ error: 'Kanal bulunamadı.' });
    const name = channel.name;
    await channel.delete(`Kontrol paneli · ${req.session.user.username}`);
    res.json({ ok: true, message: `#${name} silindi.` });
  }));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'API adresi bulunamadı.' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
  return app;
}

module.exports = { createWebApp };
