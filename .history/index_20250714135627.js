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

const sessions = new Map(); // Geçici kullanıcı oturumlarını burada tutarız

app.post('/webhook', async (req, res) => {
  const from = req.body.from || 'anon'; // WhatsApp numarası ya da kullanıcı ID
  const incomingMessage = req.body.message || '';

  if (!sessions.has(from)) {
    sessions.set(from, { step: 0, data: {} });
    return res.json({ reply: 'Merhaba! Adınızı ve soyadınızı paylaşır mısınız?' });
  }

  const session = sessions.get(from);

  switch (session.step) {
    case 0:
      session.data.fullName = incomingMessage;
      session.step++;
      return res.json({ reply: 'Teşekkürler! Telefon numaranız nedir?' });

    case 1:
      session.data.phone = incomingMessage;
      session.step++;
      return res.json({ reply: 'E-posta adresinizi alabilir miyim?' });

    case 2:
      session.data.email = incomingMessage;
      session.step++;
      return res.json({ reply: 'Son olarak hangi şehirde yaşıyorsunuz?' });

    case 3:
      session.data.city = incomingMessage;

      try {
        await db.collection('users').add({
          ...session.data,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        sessions.delete(from); // Geçici verileri temizle
        return res.json({
          reply: `Teşekkürler ${session.data.fullName}, bilgilerin başarıyla kaydedildi!`
        });

      } catch (error) {
        console.error('Firestore hatası:', error);
        return res.status(500).json({ reply: 'Kaydetme sırasında bir hata oluştu.' });
      }

    default:
      return res.json({ reply: 'Tüm bilgileri zaten aldım. Tekrar başlatmak için "Merhaba" yazabilirsiniz.' });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Bot sunucusu ${PORT} portunda çalışıyor.`);
});
