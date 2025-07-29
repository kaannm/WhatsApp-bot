# WhatsApp Bot with Gemini AI & Imagen 2

Bu proje, WhatsApp Cloud API, Google Gemini AI ve Imagen 2 kullanarak akıllı bir form botu oluşturur. Bot, kullanıcılarla doğal dilde konuşarak form bilgilerini toplar ve form tamamlandığında kullanıcıya özel resimler oluşturur.

## Özellikler

- 🤖 **Gemini AI Asistan**: Doğal dilde form akışı yönetimi
- 🎨 **Imagen 2 Entegrasyonu**: Kullanıcıya özel resim oluşturma
- 📝 **Akıllı Form**: Ad, soyad, e-posta, telefon, şehir bilgilerini toplama
- 🔄 **Oturum Yönetimi**: Kullanıcı oturumlarını takip etme
- ⏱️ **Rate Limiting**: Günlük mesaj limiti (50 mesaj/24 saat)
- 💾 **Firebase Firestore**: Veri saklama ve yönetimi
- 🚀 **Railway Deployment**: Kolay deployment

## Kurulum

### 1. Gereksinimler

- Node.js 18+
- Google Cloud Project (Imagen 2 için)
- Firebase Project
- WhatsApp Business API hesabı

### 2. Environment Variables

`.env` dosyasını oluşturun:

```bash
# WhatsApp Cloud API
WHATSAPP_TOKEN=your_whatsapp_access_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_VERIFY_TOKEN=your_verify_token

# Firebase Admin SDK
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_CLIENT_EMAIL=your_firebase_client_email
FIREBASE_PRIVATE_KEY=your_firebase_private_key

# Google Generative AI (Gemini)
GEMINI_API_KEY=your_gemini_api_key

# Google Cloud (Imagen 2)
GOOGLE_CLOUD_PROJECT_ID=your_google_cloud_project_id

# Session Management
SESSION_SECRET=your_session_secret

# Server Configuration
PORT=3000
```

### 3. Google Cloud Setup (Imagen 2)

1. Google Cloud Console'da yeni bir proje oluşturun
2. Vertex AI API'yi etkinleştirin
3. Service Account oluşturun ve gerekli izinleri verin
4. `gcloud auth application-default login` komutunu çalıştırın

### 4. Dependencies

```bash
npm install
```

### 5. Çalıştırma

```bash
npm start
```

## API Endpoints

### Webhook
- `GET /webhook` - WhatsApp webhook doğrulama
- `POST /webhook` - WhatsApp mesajlarını işleme

### Imagen 2
- `POST /generate-image` - Resim oluşturma
- `POST /edit-image` - Resim düzenleme

## Form Akışı

1. Kullanıcı "selam" veya benzeri bir mesaj gönderir
2. Gemini AI doğal bir şekilde adını sorar
3. Kullanıcı adını verir, Gemini soyadını sorar
4. Bu şekilde sırasıyla: e-posta, telefon, şehir bilgileri alınır
5. Form tamamlandığında:
   - Bilgiler Firebase'e kaydedilir
   - Imagen 2 ile kullanıcıya özel profil resmi oluşturulur
   - Resim WhatsApp'ta gönderilir

## Imagen 2 Özellikleri

- **Resim Oluşturma**: Text-to-image generation
- **Resim Düzenleme**: Mevcut resimleri düzenleme
- **Inpainting**: Belirli alanları düzenleme
- **Arka Plan Kaldırma**: Otomatik arka plan kaldırma
- **Aspect Ratio**: 1:1, 9:16, 16:9, 3:4, 4:3 oranları
- **Guidance Scale**: Düşük, orta, yüksek kontrol seviyeleri

## Deployment (Railway)

1. Railway hesabı oluşturun
2. GitHub repository'nizi bağlayın
3. Environment variables'ları Railway'de ayarlayın
4. Deploy edin

## Hata Ayıklama

### Yaygın Hatalar

1. **502 Bad Gateway**: Environment variables eksik
2. **Firebase Permission Error**: Firestore kurallarını kontrol edin
3. **WhatsApp Token Expired**: Token'ı yenileyin
4. **Gemini API Overload**: Rate limiting aktif

### Log Kontrolü

```bash
# Railway logs
railway logs

# Local logs
npm start
```

## Katkıda Bulunma

1. Fork edin
2. Feature branch oluşturun
3. Commit edin
4. Push edin
5. Pull Request oluşturun

## Lisans

MIT License
