const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = { me: null, guild: null, bot: null, capabilities: {}, members: [], channels: [], selectedMember: null, selectedChannel: null, filter: 'all', searchTimer: null };
const labels = { overview: 'Genel Bakış', moderation: 'Üye Yönetimi', channels: 'Kanal Yönetimi', games: 'Bot komutları' };
const kindLabels = { 0: 'METİN KANALI', 2: 'SES KANALI', 4: 'KATEGORİ' };
const typeNames = { 0: 'text', 2: 'voice', 4: 'category' };

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) showLogin();
    throw new Error(data.error || 'Bir hata oluştu.');
  }
  return data;
}
function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function showToast(message, type = 'success') {
  const toast = $('#toast'); toast.textContent = message; toast.className = `toast show ${type}`;
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => { toast.className = 'toast'; }, 3500);
}
function showLogin() { $('#app-view').classList.add('hidden'); $('#login-view').classList.remove('hidden'); }
function showApp() { $('#login-view').classList.add('hidden'); $('#app-view').classList.remove('hidden'); }
function navigate(view) {
  if (!labels[view]) view = 'overview';
  location.hash = view;
  $$('.view').forEach((section) => section.classList.toggle('active', section.id === `view-${view}`));
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === view));
  $('#crumb-title').textContent = labels[view];
  if (view === 'moderation' && !state.members.length) loadMembers();
  if (view === 'channels' && !state.channels.length) loadChannels();
}

async function boot() {
  try {
    const { user } = await api('/api/me');
    if (!user) return showLogin();
    state.me = user;
    showApp();
    $('#user-name').textContent = user.globalName || user.username;
    $('#user-avatar').textContent = (user.globalName || user.username || '?').slice(0, 1).toUpperCase();
    if (user.avatar) $('#user-avatar').innerHTML = `<img src="https://cdn.discordapp.com/avatars/${encodeURIComponent(user.id)}/${encodeURIComponent(user.avatar)}.png?size=64" alt="">`;
    $('#today').textContent = new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
    const [info, capabilities, channels] = await Promise.all([api('/api/state'), api('/api/capabilities'), api('/api/channels')]);
    state.guild = info.guild; state.bot = info.bot; state.capabilities = capabilities; state.channels = channels;
    $('#server-name').textContent = info.guild.name;
    $('#server-icon').innerHTML = info.guild.icon ? `<img src="${escapeHtml(info.guild.icon)}" alt="">` : escapeHtml(info.guild.name.slice(0, 1).toUpperCase());
    $('#stat-members').textContent = info.guild.memberCount.toLocaleString('tr-TR');
    $('#stat-channels').textContent = channels.filter((channel) => channel.type !== 4).length.toLocaleString('tr-TR');
    $('#channel-total').textContent = channels.length;
    $('#bot-tag').textContent = info.bot.tag;
    $('#bot-avatar').src = info.bot.avatar;
    const permissionNames = { kick: 'Üyeleri at', ban: 'Üyeleri yasakla', timeout: 'Zaman aşımı', channels: 'Kanalları yönet' };
    $('#bot-permissions').innerHTML = Object.entries(info.bot.permissions).map(([key, allowed]) => `<span class="permission-item ${allowed ? '' : 'missing'}"><i>${allowed ? '✓' : '×'}</i>${permissionNames[key]}</span>`).join('');
    $$('.mod-action').forEach((button) => { const key = button.dataset.action === 'untimeout' ? 'timeout' : button.dataset.action; button.disabled = !capabilities[key]; if (!capabilities[key]) button.title = 'Bu işlem için Discord iznin yok'; });
    if (!capabilities.kick && !capabilities.ban && !capabilities.timeout) $('[data-view="moderation"]').classList.add('disabled-nav');
    if (!capabilities.channels) { $('[data-view="channels"]').classList.add('disabled-nav'); $('#create-channel').disabled = true; $('#create-channel').title = 'Bu işlem için Discord iznin yok'; }
    renderChannels();
    if (location.hash) navigate(location.hash.slice(1));
  } catch (error) {
    showLogin();
    if (location.search.includes('login=cancelled')) showToast('Discord ile giriş iptal edildi.', 'error');
    else showToast(error.message, 'error');
  }
}

async function loadMembers(query = '') {
  const list = $('#member-list'); list.innerHTML = '<div class="empty-state">Üyeler yükleniyor…</div>';
  try {
    const members = await api(`/api/members${query ? `?q=${encodeURIComponent(query)}` : ''}`);
    state.members = members;
    $('#member-count').textContent = `${members.length}${query ? ' sonuç' : ' üye'}`;
    if (!members.length) { list.innerHTML = '<div class="empty-state">Üye bulunamadı. Farklı bir arama dene.</div>'; return; }
    list.innerHTML = members.map((member) => `<button class="member-row ${state.selectedMember?.id === member.id ? 'selected' : ''}" data-member="${escapeHtml(member.id)}"><img src="${escapeHtml(member.avatar)}" alt=""><span class="member-row-name"><b>${escapeHtml(member.displayName)}</b><small>@${escapeHtml(member.username)}</small></span><span class="member-role">${escapeHtml(member.role)}</span><span class="row-arrow">›</span></button>`).join('');
    $$('.member-row', list).forEach((row) => row.addEventListener('click', () => selectMember(members.find((member) => member.id === row.dataset.member))));
  } catch (error) { list.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`; }
}
function selectMember(member) {
  state.selectedMember = member;
  $('#selected-empty').classList.add('hidden'); $('#selected-card').classList.remove('hidden');
  $('#selected-avatar').src = member.avatar; $('#selected-name').textContent = member.displayName; $('#selected-role').textContent = `@${member.username} · ${member.role}`;
  $$('.member-row').forEach((row) => row.classList.toggle('selected', row.dataset.member === member.id));
  $$('.mod-action').forEach((button) => { button.disabled = !state.capabilities[button.dataset.action === 'untimeout' ? 'timeout' : button.dataset.action] || member.isSelf; });
}
$('#clear-selection').addEventListener('click', () => {
  state.selectedMember = null; $('#selected-empty').classList.remove('hidden'); $('#selected-card').classList.add('hidden');
  $$('.member-row').forEach((row) => row.classList.remove('selected'));
  $$('.mod-action').forEach((button) => { button.disabled = !state.capabilities[button.dataset.action === 'untimeout' ? 'timeout' : button.dataset.action]; });
});
$('#member-search').addEventListener('input', (event) => {
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(() => loadMembers(event.target.value.trim()), 350);
});

const actionDetails = {
  kick: { title: 'Üyeyi sunucudan at', description: 'Üye tekrar davet bağlantısıyla sunucuya katılabilir.', icon: '↗', button: 'Üyeyi at', danger: true },
  ban: { title: 'Üyeyi yasakla', description: 'Üye sunucuya tekrar katılamaz. Bu işlemi onaylıyor musun?', icon: '⊘', button: 'Üyeyi yasakla', danger: true },
  timeout: { title: 'Zaman aşımı uygula', description: 'Üye seçilen süre boyunca mesaj gönderemez veya konuşamaz.', icon: '◷', button: 'Sustur', danger: false },
  untimeout: { title: 'Susturmayı kaldır', description: 'Üyenin mevcut zaman aşımını kaldır.', icon: '✓', button: 'Susturmayı kaldır', danger: false },
};
$$('.mod-action').forEach((button) => button.addEventListener('click', () => {
  if (!state.selectedMember) return;
  state.pendingAction = button.dataset.action;
  const detail = actionDetails[state.pendingAction];
  $('#modal-icon').textContent = detail.icon; $('#modal-title').textContent = detail.title; $('#modal-description').textContent = `${state.selectedMember.displayName} — ${detail.description}`;
  $('#action-submit').textContent = detail.button; $('#action-submit').className = `button ${detail.danger ? 'danger' : 'primary'}`;
  $('#duration-field').classList.toggle('hidden', state.pendingAction !== 'timeout');
  $('#action-dialog').showModal();
}));
$('#action-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.selectedMember || !state.pendingAction) return;
  const submit = $('#action-submit'); submit.disabled = true;
  const form = new FormData(event.currentTarget);
  try {
    const result = await api(`/api/moderation/${state.pendingAction}`, { method: 'POST', body: JSON.stringify({ userId: state.selectedMember.id, reason: form.get('reason'), minutes: form.get('minutes') }) });
    $('#action-dialog').close(); showToast(result.message);
    if (['kick', 'ban'].includes(state.pendingAction)) { state.selectedMember = null; $('#selected-empty').classList.remove('hidden'); $('#selected-card').classList.add('hidden'); loadMembers($('#member-search').value.trim()); }
  } catch (error) { showToast(error.message, 'error'); }
  finally { submit.disabled = false; }
});

function channelIcon(type) { return type === 2 ? '◖' : type === 4 ? '▦' : '#'; }
function renderChannels() {
  const query = ($('#channel-search')?.value || '').trim().toLowerCase();
  const types = { text: 0, voice: 2, category: 4 };
  const filtered = state.channels.filter((channel) => (state.filter === 'all' || channel.type === types[state.filter]) && channel.name.toLowerCase().includes(query));
  $('#channel-total').textContent = state.channels.length;
  if (!filtered.length) { $('#channel-list').innerHTML = '<div class="empty-state">Bu aramada kanal yok.</div>'; return; }
  const categories = filtered.filter((channel) => channel.type === 4);
  const uncategorized = filtered.filter((channel) => channel.type !== 4 && !channel.parentId);
  let html = '';
  for (const category of categories) {
    const children = filtered.filter((channel) => channel.parentId === category.id);
    html += `<div class="channel-group"><button class="channel-group-title" data-channel="${category.id}"><span>⌄</span> ${escapeHtml(category.name)} <span class="group-count">${children.length}</span></button>${children.map(channelRow).join('')}</div>`;
  }
  if (uncategorized.length) html += `<div class="channel-group"><div class="channel-group-title muted-group">⌄ KATEGORİSİZ</div>${uncategorized.map(channelRow).join('')}</div>`;
  $('#channel-list').innerHTML = html;
  $$('.channel-row, .channel-group-title[data-channel]').forEach((row) => row.addEventListener('click', () => selectChannel(state.channels.find((channel) => channel.id === row.dataset.channel))));
  $$('.channel-row').forEach((row) => row.classList.toggle('selected', state.selectedChannel?.id === row.dataset.channel));
}
function channelRow(channel) { return `<button class="channel-row ${state.selectedChannel?.id === channel.id ? 'selected' : ''}" data-channel="${escapeHtml(channel.id)}"><span class="channel-symbol type-${channel.type}">${channelIcon(channel.type)}</span><span>${escapeHtml(channel.name)}</span><span class="channel-row-more">···</span></button>`; }
async function loadChannels() {
  $('#channel-list').innerHTML = '<div class="empty-state">Kanallar yükleniyor…</div>';
  try { state.channels = await api('/api/channels'); renderChannels(); } catch (error) { $('#channel-list').innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`; }
}
function fillCategorySelect(select, selected = '') {
  const categories = state.channels.filter((channel) => channel.type === 4);
  select.innerHTML = `<option value="">Kategorisiz</option>${categories.map((channel) => `<option value="${escapeHtml(channel.id)}" ${channel.id === selected ? 'selected' : ''}>${escapeHtml(channel.name)}</option>`).join('')}`;
}
function selectChannel(channel) {
  if (!channel) return;
  state.selectedChannel = channel;
  $('#channel-empty').classList.add('hidden'); $('#channel-selected').classList.remove('hidden');
  $('#detail-type-icon').textContent = channelIcon(channel.type); $('#detail-kind').textContent = kindLabels[channel.type] || 'KANAL';
  $('#detail-name').textContent = channel.name; $('#detail-id').textContent = `ID: ${channel.id}`;
  const form = $('#channel-form'); form.elements.name.value = channel.name;
  $('#topic-field').classList.toggle('hidden', channel.type !== 0);
  if (channel.type === 0) form.elements.topic.value = channel.topic || '';
  $('#parent-field').classList.toggle('hidden', channel.type === 4);
  fillCategorySelect(form.elements.parentId, channel.parentId || '');
  $('#voice-fields').classList.toggle('hidden', channel.type !== 2);
  if (channel.type === 2) { form.elements.bitrate.value = channel.bitrate || 64000; form.elements.userLimit.value = channel.userLimit || 0; }
  $('#channel-form').querySelectorAll('input,select,button').forEach((element) => element.disabled = !state.capabilities.channels);
  $('#delete-channel').disabled = !state.capabilities.channels;
  renderChannels();
}
$('#channel-search').addEventListener('input', renderChannels);
$$('.channel-tab').forEach((tab) => tab.addEventListener('click', () => { state.filter = tab.dataset.filter; $$('.channel-tab').forEach((item) => item.classList.toggle('active', item === tab)); renderChannels(); }));
$('#channel-form').addEventListener('submit', async (event) => {
  event.preventDefault(); if (!state.selectedChannel) return;
  const form = new FormData(event.currentTarget); const channel = state.selectedChannel;
  const body = { name: form.get('name') };
  if (channel.type === 0) body.topic = form.get('topic');
  if (channel.type !== 4) body.parentId = form.get('parentId');
  if (channel.type === 2) { body.bitrate = form.get('bitrate'); body.userLimit = form.get('userLimit'); }
  try { const result = await api(`/api/channels/${channel.id}`, { method: 'PATCH', body: JSON.stringify(body) }); showToast(result.message); await loadChannels(); const updated = state.channels.find((item) => item.id === channel.id); if (updated) selectChannel(updated); }
  catch (error) { showToast(error.message, 'error'); }
});
$('#delete-channel').addEventListener('click', async () => {
  if (!state.selectedChannel || !confirm(`“${state.selectedChannel.name}” kanalını silmek istediğine emin misin? Bu işlem geri alınamaz.`)) return;
  try { const result = await api(`/api/channels/${state.selectedChannel.id}`, { method: 'DELETE' }); state.selectedChannel = null; $('#channel-selected').classList.add('hidden'); $('#channel-empty').classList.remove('hidden'); await loadChannels(); showToast(result.message); }
  catch (error) { showToast(error.message, 'error'); }
});
$('#create-channel').addEventListener('click', () => {
  fillCategorySelect($('#create-form').elements.parentId); $('#create-form').reset(); $('#channel-dialog').showModal(); updateNewChannelFields();
});
function updateNewChannelFields() {
  const kind = $('#new-kind').value;
  $('.new-topic').classList.toggle('hidden', kind !== 'text'); $('.new-parent').classList.toggle('hidden', kind === 'category');
}
$('#new-kind').addEventListener('change', updateNewChannelFields);
$('#create-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = new FormData(event.currentTarget);
  const body = { kind: form.get('kind'), name: form.get('name'), topic: form.get('topic'), parentId: form.get('parentId') };
  try { const result = await api('/api/channels', { method: 'POST', body: JSON.stringify(body) }); $('#channel-dialog').close(); await loadChannels(); showToast(result.message); }
  catch (error) { showToast(error.message, 'error'); }
});

$$('[data-close]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
$$('[data-view]').forEach((link) => link.addEventListener('click', (event) => { event.preventDefault(); navigate(link.dataset.view); }));
$$('[data-go]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.go)));
window.addEventListener('hashchange', () => navigate(location.hash.slice(1)));
$('#logout').addEventListener('click', async () => { await fetch('/auth/logout', { method: 'POST' }); state.me = null; showLogin(); });
boot();
