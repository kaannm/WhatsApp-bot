const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const admin = require('firebase-admin');
const app = express();

const VERIFY_TOKEN = "whatsapp-bot-2024-secret-token";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

// Firebase başlatma
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI || "https://accounts.google.com/o/oauth2/auth",
  token_uri: process.env.FIREBASE_TOKEN_URI || "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL || "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
};

// Firebase'i başlat
try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('✅ Firebase başlatıldı');
} catch (error) {
  console.log('⚠️ Firebase başlatılamadı:', error.message);
}

const db = admin.firestore();

// Kullanıcı session'ları (geçici)
const userSessions = new Map();

app.use(bodyParser.json());

// Test endpoint
app.get('/test', (req, res) => {
  res.json({ 
    message: 'Test endpoint çalışıyor',
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    message: 'Bot çalışıyor'
  });
});

// ✅ Webhook Doğrulama Kısmı
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log("Webhook doğrulandı.");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Mesaj gönderme fonksiyonu
async function sendWhatsAppMessage(to, message) {
  try {
    console.log('🔍 Debug bilgileri:');
    console.log('Phone Number ID:', PHONE_NUMBER_ID);
    console.log('Access Token (ilk 20 karakter):', ACCESS_TOKEN ? ACCESS_TOKEN.substring(0, 20) + '...' : 'EKSİK');
    console.log('Gönderilecek numara:', to);
    console.log('Mesaj:', message);
    
    const response = await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: to,
        type: "text",
        text: { body: message }
      },
      {
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('✅ Mesaj gönderildi:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Mesaj gönderme hatası:', error.response?.data || error.message);
    console.error('❌ Hata detayı:', error.response?.status, error.response?.statusText);
    throw error;
  }
}

// Kayıt formu işleme
async function handleRegistration(from, messageText) {
  console.log(`handleRegistration çağrıldı: ${from}, mesaj: ${messageText}`);
  
  const session = userSessions.get(from);
  console.log(`Mevcut session:`, session);
  
  if (!session) {
    console.log('Session bulunamadı, yeni session oluşturuluyor...');
    userSessions.set(from, { step: 0, data: {} });
  }
  
  const currentSession = userSessions.get(from);
  console.log(`İşlenecek session:`, currentSession);
  
  switch (currentSession.step) {
    case 0: // İsim
      console.log('Adım 0: İsim alınıyor');
      currentSession.data.name = messageText;
      currentSession.step = 1;
      userSessions.set(from, currentSession);
      console.log(`Session güncellendi:`, currentSession);
      return "Adınızı aldım! Şimdi telefon numaranızı gönderin (örn: +90 555 123 4567):";
      
    case 1: // Telefon
      console.log('Adım 1: Telefon alınıyor');
      currentSession.data.phone = messageText;
      currentSession.step = 2;
      userSessions.set(from, currentSession);
      console.log(`Session güncellendi:`, currentSession);
      return "Telefon numaranızı aldım! Şimdi email adresinizi gönderin:";
      
    case 2: // Email
      console.log('Adım 2: Email alınıyor');
      currentSession.data.email = messageText;
      
      try {
        // Firebase'e kaydet
        await db.collection('users').add({
          ...currentSession.data,
          phoneNumber: from,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          registrationDate: new Date().toISOString()
        });
        
        console.log(`✅ Kullanıcı kaydedildi: ${from}`);
        
        // Session'ı temizle
        userSessions.delete(from);
        
        return `🎉 Kayıt tamamlandı!\n\nAd: ${currentSession.data.name}\nTelefon: ${currentSession.data.phone}\nEmail: ${currentSession.data.email}\n\nTeşekkürler!`;
      } catch (error) {
        console.error('❌ Kayıt hatası:', error);
        return "Kayıt sırasında bir hata oluştu. Lütfen tekrar deneyin.";
      }
      
    default:
      console.log('Bilinmeyen adım:', currentSession.step);
      return "Bir hata oluştu. Lütfen 'kayıt' yazarak tekrar başlayın.";
  }
}

// 🔁 Webhook POST (mesajları almak için)
app.post('/webhook', async (req, res) => {
  console.log('=== WEBHOOK ALINDI ===');
  console.log('Gelen mesaj:', JSON.stringify(req.body, null, 2));
  
  try {
    const body = req.body;
    console.log('Body object:', body.object);
    
    if (body.object === 'whatsapp_business_account') {
      console.log('WhatsApp Business Account mesajı');
      const entry = body.entry[0];
      const changes = entry.changes[0];
      const value = changes.value;
      
      console.log('Value:', JSON.stringify(value, null, 2));
      
      if (value.messages && value.messages.length > 0) {
        const message = value.messages[0];
        const from = message.from;
        const messageText = message.text?.body || '';
        
        console.log(`=== MESAJ İŞLENİYOR ===`);
        console.log(`Gönderen: ${from}`);
        console.log(`Mesaj: ${messageText}`);
        
        let reply = '';
        
        // Mevcut session'ı kontrol et
        const session = userSessions.get(from);
        console.log(`Session durumu:`, session);
        
        // Kayıt formu kontrolü
        if (session && session.step >= 0) {
          console.log(`Kayıt formu adımı: ${session.step}`);
          reply = await handleRegistration(from, messageText);
        } else {
          // Normal komutlar
          if (messageText.toLowerCase().includes('kayıt') || messageText.toLowerCase().includes('register')) {
            console.log('Kayıt formu başlatılıyor...');
            userSessions.set(from, { step: 0, data: {} });
            reply = "📝 Kayıt formuna hoş geldiniz!\n\nLütfen adınızı gönderin:";
          } else if (messageText.toLowerCase().includes('merhaba') || messageText.toLowerCase().includes('hello')) {
            reply = 'Merhaba! Ben WhatsApp botunuz. Nasılsınız?\n\nKayıt olmak için "kayıt" yazın.';
          } else if (messageText.toLowerCase().includes('test')) {
            reply = 'Test mesajınız alındı! Bot çalışıyor.';
          } else {
            reply = `Mesajınızı aldım: "${messageText}". Teşekkürler!\n\nKayıt olmak için "kayıt" yazın.`;
          }
        }
        
        console.log(`Yanıt hazırlandı: ${reply}`);
        
        // Yanıt gönder
        console.log('Yanıt gönderiliyor...');
        await sendWhatsAppMessage(from, reply);
        console.log(`✅ Yanıt gönderildi: ${reply}`);
      } else {
        console.log('Mesaj bulunamadı veya boş');
      }
    } else {
      console.log('WhatsApp Business Account mesajı değil');
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Webhook işleme hatası:', error);
    console.error('Hata detayı:', error.response?.data || error.message);
    res.sendStatus(500);
  }
});

// Sunucu başlat
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sunucu http://localhost:${PORT} üzerinden çalışıyor`);
  console.log(`Phone Number ID: ${PHONE_NUMBER_ID}`);
  console.log(`Access Token: ${ACCESS_TOKEN ? 'Mevcut' : 'Eksik'}`);
  console.log(`Firebase: ${admin.apps.length > 0 ? 'Başlatıldı' : 'Başlatılamadı'}`);
}); 