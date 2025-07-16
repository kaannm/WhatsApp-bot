const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const serviceAccount = require('./firebase-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const app = express();
app.use(bodyParser.json());

const sessions = new Map();

// Basit validasyon fonksiyonları
const isValidName = (name) => /^[a-zA-ZğüşöçıİĞÜŞÖÇ\s]{2,}$/.test(name.trim());
const isValidPhone = (phone) => /^\+\d{10,15}$/.test(phone.trim());
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
const isValidCity = (city) => city.trim().length >= 2;

// Max yanlış giriş hakkı
const MAX_ATTEMPTS = 3;

// Oturum zaman aşımı (10 dakika)
const SESSION_TIMEOUT = 10 * 60 * 1000; // ms cinsinden

app.post('/webhook', async (req, res) => {
  const from = req.body.from || 'anon';
  const incomingMessage = (req.body.message || '').trim();

  const now = Date.now();

  // Oturum kontrolü ve timeout kontrolü
  if (sessions.has(from)) {
    const session = sessions.get(from);
    if (now - session.lastActive > SESSION_TIMEOUT) {
      sessions.delete(from); // Süre aşımı, oturumu temizle
    } else {
      session.lastActive = now; // Oturum aktifliği güncelle
    }
  }

  // Başlangıç/reset komutları ya da oturum yoksa
  if (/^(merhaba|başla|restart|tekrar)$/i.test(incomingMessage) || !sessions.has(from)) {
    sessions.set(from, { step: 0, data: {}, attempts: 0, lastActive: now });
    return res.json({ reply: 'Merhaba! Adınızı ve soyadınızı paylaşır mısınız?' });
  }

  const session = sessions.get(from);

  const handleInvalidInput = (message) => {
    session.attempts++;
    if (session.attempts >= MAX_ATTEMPTS) {
      sessions.delete(from);
      return res.json({ reply: 'Çok fazla yanlış giriş yaptınız. Lütfen "Merhaba" yazarak tekrar başlayınız.' });
    }
    return res.json({ reply: message });
  };

  switch (session.step) {
    case 0: // İsim
      if (!isValidName(incomingMessage)) {
        return handleInvalidInput('Lütfen geçerli bir ad ve soyad yazınız (en az 2 harf).');
      }
      session.data.fullName = incomingMessage;
      session.step++;
      session.attempts = 0;
      return res.json({ reply: 'Teşekkürler! Telefon numaranız nedir? (örn: +905xxxxxxxxx)' });

    case 1: // Telefon
      if (!isValidPhone(incomingMessage)) {
        return handleInvalidInput('Lütfen geçerli telefon numaranızı +90 ile başlayarak yazınız.');
      }
      session.data.phone = incomingMessage;
      session.step++;
      session.attempts = 0;
      return res.json({ reply: 'E-posta adresinizi alabilir miyim?' });

    case 2: // Email
      if (!isValidEmail(incomingMessage)) {
        return handleInvalidInput('Lütfen geçerli bir e-posta adresi yazınız.');
      }
      session.data.email = incomingMessage;
      session.step++;
      session.attempts = 0;
      return res.json({ reply: 'Son olarak hangi şehirde yaşıyorsunuz?' });

    case 3: // Şehir
      if (!isValidCity(incomingMessage)) {
        return handleInvalidInput('Lütfen geçerli bir şehir adı yazınız (en az 2 karakter).');
      }
      session.data.city = incomingMessage;

      try {
        await db.collection('users').add({
          ...session.data,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        sessions.delete(from);
        return res.json({ reply: `Teşekkürler ${session.data.fullName}, bilgilerin başarıyla kaydedildi!` });
      } catch (error) {
        console.error('Firestore hatası:', error);
        return res.status(500).json({ reply: 'Kaydetme sırasında bir hata oluştu. Lütfen daha sonra tekrar deneyiniz.' });
      }

    default:
      return res.json({ reply: 'Tüm bilgileri aldım. Yeni kayıt için "Merhaba" yazabilirsiniz.' });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Bot sunucusu ${PORT} portunda çalışıyor.`);
});
