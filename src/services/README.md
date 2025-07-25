# 🤖 WhatsApp Bot Servisleri

Bu klasör, WhatsApp botunun farklı AI servislerini ve yardımcı fonksiyonlarını içerir.

## 📁 Servis Listesi

### 🤖 **geminiService.js** - Ana AI Servisi
- **Amaç**: Gemini 1.5 Flash ile metin analizi ve doğrulama
- **Fonksiyonlar**:
  - `optimizePrompt()` - Prompt optimizasyonu
  - `generateVideoPrompt()` - Video üretim promptu
  - `analyzeUserMessage()` - Kullanıcı mesaj analizi
  - `simpleValidate()` - Basit doğrulama
- **Kullanım**: Form cevaplarını değerlendirme, akıllı konuşma

### 📱 **whatsappService.js** - WhatsApp API Yardımcıları
- **Amaç**: WhatsApp Cloud API ile iletişim
- **Fonksiyonlar**:
  - `sendMessage()` - Metin mesajı gönderme
  - `sendMedia()` - Medya (resim/video) gönderme
  - `getMediaUrl()` - Medya URL'si alma
  - `downloadMediaAsBase64()` - Medya indirme
- **Kullanım**: Tüm WhatsApp mesaj işlemleri

### 🖼️ **imagenService.js** - Resim Üretimi
- **Amaç**: Google Imagen 2 ile AI resim oluşturma
- **Fonksiyonlar**:
  - `generateImage()` - Yeni resim oluşturma
  - `editImage()` - Mevcut resmi düzenleme
  - `inpaintImage()` - Resim tamamlama
  - `removeBackground()` - Arka plan kaldırma
- **Kullanım**: Kullanıcı için özel profil resimleri

### 🎬 **veoService.js** - Video Üretimi
- **Amaç**: Google Veo 2/3 ile AI video oluşturma
- **Fonksiyonlar**:
  - `generateVeo3Video()` - Metin + görselden video
  - `generateVeo2Video()` - Sadece metinden video
- **Kullanım**: Kullanıcı fotoğraflarından özel videolar

### 🎭 **runwayService.js** - AI Görsel Üretimi
- **Amaç**: Runway Gen-3 ile görsel oluşturma
- **Fonksiyonlar**:
  - `generateImage()` - Referans fotoğraflarla AI görsel
  - `processImages()` - Fotoğraf işleme
- **Kullanım**: Alternatif AI görsel üretimi

### 📬 **queueService.js** - Kuyruk Yönetimi
- **Amaç**: Bull.js ile iş kuyruğu yönetimi
- **Fonksiyonlar**:
  - Video üretim kuyruğu
  - Mesaj gönderme kuyruğu
- **Kullanım**: Uzun süren işlemler için kuyruk

### 💾 **redisService.js** - Veri Saklama
- **Amaç**: Redis ile session ve cache yönetimi
- **Fonksiyonlar**:
  - `setSession()` / `getSession()` - Kullanıcı oturumu
  - `setCache()` / `getCache()` - Önbellek yönetimi
- **Kullanım**: Kullanıcı durumu ve veri saklama

## 🔄 Servis Bağımlılıkları

```
src/index.js (Ana Bot)
├── geminiService.js (AI Analiz)
├── whatsappService.js (Mesaj Gönderme)
├── imagenService.js (Resim Üretimi)
└── redisService.js (Veri Saklama)

src/services/whatsappService.js (Eski Bot - Kaldırıldı)
└── geminiService.js (Doğrulama)
```

## 🚀 Kullanım Örnekleri

### Gemini ile Cevap Doğrulama
```javascript
const geminiService = require('./geminiService');

// Kullanıcı cevabını doğrula
const isValid = await geminiService.simpleValidate(
  `Soru: Adınız nedir?\nCevap: ${userAnswer}`
);
```

### WhatsApp Mesaj Gönderme
```javascript
const whatsappService = require('./whatsappService');

// Metin mesajı gönder
await whatsappService.sendMessage(phoneNumber, "Merhaba!");

// Resim gönder
await whatsappService.sendMedia(phoneNumber, base64Image, 'image/jpeg', 'profile.jpg');
```

### AI Resim Üretimi
```javascript
const imagenService = require('./imagenService');

// Kullanıcı için özel resim oluştur
const images = await imagenService.generateImage(
  `${userName} için profesyonel profil resmi`,
  { aspectRatio: '1:1' }
);
```

## ⚙️ Konfigürasyon

Tüm servisler `src/config/index.js` dosyasından konfigürasyon alır:

```javascript
// Environment variables
GEMINI_API_KEY=your_gemini_key
WHATSAPP_TOKEN=your_whatsapp_token
GOOGLE_CLOUD_PROJECT_ID=your_project_id
RUNWAY_API_KEY=your_runway_key
REDIS_HOST=localhost
```

## 🔧 Geliştirme Notları

- **Gemini 1.5 Flash**: Hızlı ve verimli AI analizi
- **Modüler Yapı**: Her servis bağımsız çalışır
- **Hata Yönetimi**: Tüm servislerde try-catch blokları
- **Logging**: Detaylı log kayıtları
- **Rate Limiting**: API limitlerine uyum 