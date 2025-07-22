process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});


const express = require('express');
// const bodyParser = require('body-parser'); // KALDIRILDI
const axios = require('axios');
const app = express();

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_TOKEN;

// Kullanıcı session'ları (geçici)
const userSessions = new Map();

// State machine için sabitler
const REGISTRATION_STATES = {
  IDLE: 'idle',
  WAITING_NAME: 'waiting_name',
  WAITING_EMAIL: 'waiting_email'
};

// Doğrulama fonksiyonları
const validators = {
  name: (name) => {
    if (!name || name.trim().length < 2) return "İsim en az 2 karakter olmalıdır.";
    if (name.trim().length > 50) return "İsim çok uzun.";
    return null; // Geçerli
  },
  
  email: (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return "Geçerli bir email adresi girin.";
    return null;
  }
};

app.use(express.json());

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

// Root endpoint (Railway ana sayfa için)
app.get('/', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'WhatsApp botu çalışıyor!' });
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
async function sendWhatsAppMessage(to, message, buttons = null) {
  try {
    console.log('🔍 Debug bilgileri:');
    console.log('Phone Number ID:', PHONE_NUMBER_ID);
    console.log('Access Token (ilk 20 karakter):', ACCESS_TOKEN ? ACCESS_TOKEN.substring(0, 20) + '...' : 'EKSİK');
    console.log('Gönderilecek numara:', to);
    console.log('Mesaj:', message);
    console.log('Butonlar:', buttons ? 'Var' : 'Yok');
    
    let messageData;
    
    if (buttons) {
      // Interactive message with buttons
      messageData = {
        messaging_product: "whatsapp",
        to: to,
        type: "interactive",
        interactive: {
          type: "button",
          body: {
            text: message
          },
          action: {
            buttons: buttons
          }
        }
      };
    } else {
      // Normal text message
      messageData = {
        messaging_product: "whatsapp",
        to: to,
        type: "text",
        text: { body: message }
      };
    }
    
    const response = await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      messageData,
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

// Kayıt formu işleme - Gelişmiş State Machine mantığı
async function handleRegistration(from, messageText) {
  console.log(`🔍 handleRegistration çağrıldı: ${from}, mesaj: "${messageText}"`);
  
  let session = userSessions.get(from);
  console.log(`📋 Mevcut session:`, session);
  
  // Session yoksa oluştur
  if (!session) {
    console.log('⚠️ Session bulunamadı, yeni session oluşturuluyor...');
    session = { 
      state: REGISTRATION_STATES.WAITING_NAME, 
      data: {},
      timestamp: Date.now()
    };
    userSessions.set(from, session);
  }
  
  console.log(`🔄 İşlenecek session state: ${session.state}`);
  
  // Özel komutlar kontrolü
  if (messageText.toLowerCase() === 'iptal' || messageText.toLowerCase() === 'cancel') {
    userSessions.delete(from);
    return "❌ Kayıt iptal edildi. Tekrar kayıt olmak için 'kayıt' yazın.";
  }
  
  if (messageText.toLowerCase() === 'geri' || messageText.toLowerCase() === 'back') {
    return handleGoBack(from, session);
  }
  
  // State machine mantığı
  switch (session.state) {
    case REGISTRATION_STATES.WAITING_NAME:
      console.log('📝 State: WAITING_NAME - İsim alınıyor:', messageText);
      
      // İsim doğrulama
      const nameError = validators.name(messageText);
      if (nameError) {
        return `❌ ${nameError}\n\nLütfen geçerli bir isim girin:`;
      }
      
      session.data.name = messageText.trim();
      session.state = REGISTRATION_STATES.WAITING_EMAIL;
      session.timestamp = Date.now();
      userSessions.set(from, session);
      console.log(`✅ State değişti: WAITING_NAME -> WAITING_EMAIL`);
      return "✅ Adınızı aldım! Şimdi email adresinizi gönderin:\n\n💡 İptal etmek için 'iptal' yazın.";
      
    case REGISTRATION_STATES.WAITING_EMAIL:
      console.log('📧 State: WAITING_EMAIL - Email alınıyor:', messageText);
      
      // Email doğrulama
      const emailError = validators.email(messageText);
      if (emailError) {
        return `❌ ${emailError}\n\nLütfen geçerli bir email adresi girin:`;
      }
      
      session.data.email = messageText.trim();
      
      try {
        // Kullanıcının daha önce kayıt olup olmadığını kontrol et
        // Firebase'e kaydet
        // Session'ı temizle
        
        console.log(`🎉 Kullanıcı kaydedildi: ${from}`);
        
        // Session'ı temizle
        userSessions.delete(from);
        
        return `🎉 Kayıt tamamlandı!\n\n📋 Bilgileriniz:\n• Ad: ${session.data.name}\n• WhatsApp: ${from}\n• Email: ${session.data.email}\n\n✅ Artık bot hizmetlerimizi kullanabilirsiniz!\n\n💡 Yardım için 'yardım' yazın.`;
      } catch (error) {
        console.error('❌ Kayıt hatası:', error);
        return "❌ Kayıt sırasında bir hata oluştu. Lütfen tekrar deneyin.";
      }
      
    default:
      console.log('❓ Bilinmeyen state:', session.state);
      // Session'ı sıfırla
      userSessions.delete(from);
      return "❌ Bir hata oluştu. Lütfen 'kayıt' yazarak tekrar başlayın.";
  }
}

// Geri gitme fonksiyonu
function handleGoBack(from, session) {
  switch (session.state) {
    case REGISTRATION_STATES.WAITING_EMAIL:
      session.state = REGISTRATION_STATES.WAITING_NAME;
      session.timestamp = Date.now();
      userSessions.set(from, session);
      return "⬅️ Geri döndünüz. Lütfen adınızı tekrar girin:";
      
    default:
      return "❌ Geri dönülemez. İptal etmek için 'iptal' yazın.";
  }
}

// Kullanıcı durumu kontrolü
async function checkUserStatus(from) {
  try {
    // Firebase'e kaydet
    // Session'ı temizle
    
    // Bu kısım Firebase bağlantısı olmadan çalışmayacak,
    // bu yüzden sadece bir placeholder olarak bırakıldı.
    // Firebase bağlantısı eklendiğinde burası düzenlenmelidir.
    console.warn('Firebase bağlantısı yok, checkUserStatus fonksiyonu çalışmıyor.');
    return "❌ Firebase bağlantısı yok, durum kontrolü yapılamıyor.";

    // Eğer Firebase bağlantısı varsa:
    // const userDoc = await admin.firestore().collection('users').where('phoneNumber', '==', from).get();
    // if (userDoc.empty) {
    //   return "❌ Henüz kayıt olmamışsınız.\n\n📝 Kayıt olmak için 'kayıt' yazın.";
    // }
    
    // const userData = userDoc.docs[0].data();
    // const registrationDate = new Date(userData.registrationDate).toLocaleDateString('tr-TR');
    
    // return `✅ Kayıt durumunuz:\n\n📋 Bilgileriniz:\n• Ad: ${userData.name}\n• WhatsApp: ${userData.phoneNumber}\n• Email: ${userData.email}\n• Kayıt Tarihi: ${registrationDate}\n• Durum: ${userData.status || 'Aktif'}\n\n💡 Yardım için 'yardım' yazın.`;
  } catch (error) {
    console.error('❌ Kullanıcı durumu kontrol hatası:', error);
    return "❌ Durum kontrolü sırasında hata oluştu.";
  }
}

// Minimum POST /webhook endpoint (tüm diğer kodlar geçici olarak devre dışı)
app.post('/webhook', (req, res) => {
  console.log('Webhook çağrıldı:', JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

// Sunucu başlat
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Sunucu http://localhost:${PORT} üzerinden çalışıyor`);
  console.log(`Phone Number ID: ${PHONE_NUMBER_ID}`);
  console.log(`Access Token: ${ACCESS_TOKEN ? 'Mevcut' : 'Eksik'}`);
  // Firebase: admin.apps.length > 0 ? 'Başlatıldı' : 'Başlatılamadı'
}); 