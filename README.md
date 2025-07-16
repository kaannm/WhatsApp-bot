# WhatsApp Business API Bot

Modern, güvenli ve kullanıcı dostu WhatsApp Business API bot uygulaması. Firebase Firestore ile entegre, gelişmiş güvenlik özellikleri ve kapsamlı logging sistemi içerir.

## 🚀 Özellikler

### Kullanıcı Deneyimi
- ✅ **Kişiselleştirilmiş mesajlar** - Rastgele selamlamalar ve emoji desteği
- ✅ **Akıllı validasyon** - Kullanıcı dostu hata mesajları
- ✅ **Esnek input** - Farklı formatlarda telefon numarası kabul eder
- ✅ **Yardım sistemi** - Kullanıcı komutları (yardım, iptal, vb.)
- ✅ **Session yönetimi** - Otomatik timeout ve durum takibi

### Güvenlik
- ✅ **Webhook doğrulama** - WhatsApp API imza kontrolü
- ✅ **Rate limiting** - Spam koruması
- ✅ **Input sanitization** - XSS ve injection koruması
- ✅ **CORS koruması** - Güvenli origin kontrolü
- ✅ **Helmet.js** - Güvenlik headers

### Teknik Özellikler
- ✅ **Modüler yapı** - Separation of concerns
- ✅ **Environment variables** - Güvenli konfigürasyon
- ✅ **Winston logging** - Kapsamlı log sistemi
- ✅ **Error handling** - Merkezi hata yönetimi
- ✅ **Performance monitoring** - Yavaş işlem tespiti
- ✅ **Health checks** - Sistem durumu kontrolü

## 📋 Gereksinimler

- Node.js 16+
- Firebase projesi
- 360dialog WhatsApp Business API hesabı
- Runway ML API hesabı

## 🛠️ Kurulum

1. **Projeyi klonlayın:**
```bash
git clone <repository-url>
cd whatsapp-bot
```

2. **Bağımlılıkları yükleyin:**
```bash
npm install
```

3. **Environment dosyasını oluşturun:**
```bash
cp env.example .env
```

4. **Environment variables'ları doldurun:**
```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your-client-email

# 360dialog WhatsApp Business API Configuration
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
WHATSAPP_ACCESS_TOKEN=your-360dialog-api-key
WHATSAPP_VERIFY_TOKEN=your-verify-token

# Runway ML API Configuration
RUNWAY_API_KEY=your-runway-api-key

# Security
SESSION_SECRET=your-session-secret-key
```

5. **Uygulamayı başlatın:**
```bash
# Development
npm run dev

# Production
npm start
```

## 🔧 Konfigürasyon

### Environment Variables

| Değişken | Açıklama | Varsayılan |
|----------|----------|------------|
| `PORT` | Sunucu portu | 3000 |
| `NODE_ENV` | Ortam (development/production) | development |
| `FIREBASE_PROJECT_ID` | Firebase proje ID'si | - |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp telefon numarası ID'si | - |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp API access token | - |
| `WHATSAPP_VERIFY_TOKEN` | Webhook doğrulama token'ı | - |
| `SESSION_SECRET` | Session güvenlik anahtarı | - |
| `RUNWAY_API_KEY` | Runway AI API anahtarı | - |

### Güvenlik Ayarları

```javascript
// Rate limiting
RATE_LIMIT_WINDOW_MS=900000  // 15 dakika
RATE_LIMIT_MAX_REQUESTS=100  // Maksimum istek sayısı

// Session timeout
SESSION_TIMEOUT=600000       // 10 dakika
MAX_ATTEMPTS=3              // Maksimum yanlış deneme
```

## 📱 Kullanım

### Webhook Endpoints

- `GET /webhook` - WhatsApp webhook doğrulama
- `POST /webhook` - Mesaj alma ve işleme
- `GET /health` - Sistem durumu kontrolü

### Kullanıcı Komutları

- `merhaba` - Yeni kayıt başlat
- `ai` - AI Fotoğraf Sihirbazını başlat
- `yardım` - Yardım menüsü
- `iptal` - Mevcut işlemi iptal et

### Kayıt Süreci

1. **İsim** - Ad ve soyad
2. **Telefon** - +90 ile başlayan numara
3. **Email** - Geçerli e-posta adresi
4. **Şehir** - Yaşadığı şehir

### AI Fotoğraf Sihirbazı

1. **"AI" yazın** - Sihirbazı başlatın
2. **Kendi fotoğrafınızı gönderin** - Selfie veya portre
3. **Arkadaşınızın fotoğrafını gönderin** - Portre fotoğrafı
4. **Hayalinizi anlatın** - Örnek: "En yakın arkadaşımla Japonya'da geziyoruz"
5. **AI görselinizi alın** - Otomatik olarak oluşturulur ve gönderilir

## 🔒 Güvenlik Özellikleri

### Webhook Doğrulama
```javascript
// WhatsApp API'den gelen isteklerin gerçekliğini doğrular
const signature = req.headers['x-hub-signature-256'];
const expectedSignature = crypto.createHmac('sha256', verifyToken)
  .update(body)
  .digest('hex');
```

### Input Sanitization
```javascript
// XSS ve injection koruması
message.replace(/[<>]/g, '')  // HTML tag'leri temizle
message.substring(0, 1000)    // Maksimum uzunluk
```

### Rate Limiting
```javascript
// Spam koruması
windowMs: 15 * 60 * 1000,  // 15 dakika
max: 100                   // Maksimum 100 istek
```

## 📊 Logging

### Log Seviyeleri
- `error` - Hatalar
- `warn` - Uyarılar
- `info` - Bilgi mesajları
- `debug` - Debug bilgileri

### Log Dosyaları
- `logs/app.log` - Genel loglar
- `logs/error.log` - Sadece hatalar

### Özel Log Fonksiyonları
```javascript
logUserInteraction(phoneNumber, action, details)
logSecurityEvent(event, details)
logValidationError(phoneNumber, field, error, input)
logSuccessfulRegistration(phoneNumber, userData)
```

## 🧪 Test

```bash
# Unit testler
npm test

# Linting
npm run lint

# Code formatting
npm run format
```

## 📈 Monitoring

### Health Check
```bash
curl http://localhost:3000/health
```

### Performance Metrics
- Webhook işlem süresi
- Session sayısı
- Hata oranları
- Kullanıcı etkileşimleri

## 🚀 Production Deployment

### Önerilen Ayarlar
```env
NODE_ENV=production
PORT=3000
LOG_LEVEL=warn
RATE_LIMIT_MAX_REQUESTS=50
```

### Session Storage
Production'da Redis kullanın:
```javascript
// Redis session storage
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);
```

### PM2 ile Deployment
```bash
npm install -g pm2
pm2 start src/index.js --name whatsapp-bot
pm2 save
pm2 startup
```

## 🤝 Katkıda Bulunma

1. Fork yapın
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit yapın (`git commit -m 'Add amazing feature'`)
4. Push yapın (`git push origin feature/amazing-feature`)
5. Pull Request oluşturun

## 📝 Lisans

Bu proje MIT lisansı altında lisanslanmıştır.

## 🆘 Destek

Sorunlarınız için:
- GitHub Issues kullanın
- Dokümantasyonu kontrol edin
- Log dosyalarını inceleyin

## 🔄 Changelog

### v2.0.0
- ✅ Modüler yapı
- ✅ Gelişmiş güvenlik
- ✅ Kullanıcı dostu mesajlar
- ✅ Kapsamlı logging
- ✅ Environment variables
- ✅ Error handling
- ✅ Performance monitoring

### v1.0.0
- ✅ Temel webhook işleme
- ✅ Firebase entegrasyonu
- ✅ Basit validasyon # Force Railway redeploy - Wed Jul 16 15:20:40 +03 2025
