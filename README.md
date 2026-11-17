# KNBot — Discord bot ve web kontrol paneli

Discord botu ile kontrol paneli aynı Node.js web servisi içinde çalışır. Panelden üyeleri seçip kick/ban/zaman aşımı uygulayabilir, sunucunun metin-ses-kategori kanallarını oluşturup düzenleyebilir veya silebilirsin. Bot ayrıca `/slot`, `/zar`, `/yazitura`, `/8top` ve yetki kontrollü `/kick`, `/ban`, `/sustur` slash komutlarını sunar.

## Discord uygulamasını hazırlama

1. [Discord Developer Portal](https://discord.com/developers/applications) üzerinden bir uygulama oluştur. **Bot** sekmesinde bot oluştur ve token'ı al. Token'ı kimseyle paylaşma.
2. Bot sekmesinde **Server Members Intent** seçeneğini aç. Üye araması ve panelde üye listesi için gereklidir. Bot ayrıca `Guilds` intent'ini kullanır.
3. **OAuth2 → General** bölümünden Client ID ve Client Secret değerlerini al.
4. Botu sunucuya davet et. OAuth2 URL Generator'da `bot` ve `applications.commands` kapsamlarını, bot izinlerinde `Kick Members`, `Ban Members`, `Moderate Members`, `Manage Channels`, `View Channels` ve `Send Messages` izinlerini seç. Botun rolünü işlem yapacağı üyelerin rollerinden yukarı taşı.
5. Discord'da Developer Mode'u açıp hedef sunucunun ID'sini kopyala.

Panel girişi OAuth ile yapılır. Sunucuda en az bir yönetim izni olan üyeler panele giriş yapabilir; kick, ban, susturma ve kanal işlemleri her istekte kullanıcının sunucu izni ve rol sıralamasıyla ayrıca doğrulanır. Botta da ilgili Discord izinleri bulunmalıdır. Panel, hedef sunucu için yapılandırılmıştır.

## Yerelde çalıştırma

Node.js 20 veya üzeri gerekir.

```bash
npm install
cp .env.example .env
```

`.env` dosyasını doldur:

- `DISCORD_BOT_TOKEN`: bot token'ı
- `DISCORD_CLIENT_ID` ve `DISCORD_CLIENT_SECRET`: OAuth2 uygulama bilgileri
- `GUILD_ID`: kontrol edilecek Discord sunucusunun ID'si
- `DISCORD_REDIRECT_URI`: `http://localhost:3000/auth/callback`
- `SESSION_SECRET`: uzun ve tahmin edilemez bir gizli değer

`DISCORD_REDIRECT_URI` adresini Developer Portal → OAuth2 → Redirects listesine de ekle. Ardından:

```bash
npm start
```

Panel: `http://localhost:3000`

## Render Web Service dağıtımı

Depoyu Render'a bağlayıp `render.yaml` blueprint'ini kullanarak bir **Web Service** oluştur. Render'ın verdiği `https://<servis-adı>.onrender.com` adresini aldıktan sonra:

1. Render Environment bölümünde `DISCORD_REDIRECT_URI` değerini `https://<servis-adı>.onrender.com/auth/callback` yap.
2. Aynı callback URL'sini Discord Developer Portal → OAuth2 → Redirects bölümüne ekle.
3. Bot token'ı, Client ID/Secret ve sunucu ID'sini Render ortam değişkenlerine gir.
4. Servisi yeniden deploy et ve panel adresini açıp **Discord ile giriş yap** seçeneğini kullan.

Bot ve web paneli aynı Web Service prosesi içinde çalışır; ayrı bir worker gerekmez. Render'ın ücretsiz servisleri boşta kalınca uykuya geçebilir ve yeniden başlatıldığında bot yeniden Discord'a bağlanır. Üretim kullanımı için kalıcı çalışan bir plan ve Discord bot izinlerinin/rol sıralamasının doğru ayarlanması tavsiye edilir.

## Güvenlik ve notlar

- Gizli anahtarları Git'e veya sohbete koyma. `.env` Git dışında tutulur.
- Üye yönetimi ve kanal düzenleme Discord'un kendi izinlerini aşamaz; botun rol sıralaması da Discord kurallarına tabidir.
- Üye araması Discord sunucu üye listesini kullanır; büyük sunucularda arama kutusuna isim yazarak arama yap.
- Kategori silinince Discord kanalları otomatik silinmez; kategoriye bağlı kanallar kategorisiz kalır.
- Bu başlangıç sürümünde kalıcı moderasyon günlüğü veya ekonomi sistemi yoktur.
