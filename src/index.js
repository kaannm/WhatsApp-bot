const express = require('express');
const app = express();
const axios = require('axios');
const admin = require('firebase-admin');

// Kullanıcı oturumlarını hafızada tutmak için basit bir obje
const sessions = {};
const questions = [
  { key: 'name', text: 'Adınızı yazar mısınız?' },
  { key: 'surname', text: 'Soyadınızı yazar mısınız?' },
  { key: 'email', text: 'E-posta adresinizi yazar mısınız?' },
  { key: 'phone', text: 'Telefon numaranızı yazar mısınız?' },
  { key: 'city', text: 'Hangi şehirde yaşıyorsunuz?' }
];

// Firebase Admin başlat (idempotent)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL
    })
  });
}
const db = admin.firestore();

app.get('/', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Railway Express çalışıyor!' });
});

app.get('/webhook', (req, res) => {
  const verify_token = process.env.WHATSAPP_VERIFY_TOKEN;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token && mode === 'subscribe' && token === verify_token) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', express.json(), async (req, res) => {
  const entry = req.body.entry?.[0];
  const changes = entry?.changes?.[0];
  const message = changes?.value?.messages?.[0];

  if (message) {
    const from = message.from;
    // Kullanıcı için session başlat veya devam ettir
    if (!sessions[from]) {
      sessions[from] = { step: 0, answers: {} };
    }
    const session = sessions[from];
    const currentStep = session.step;
    // Eğer ilk mesajsa, ilk soruyu gönder
    if (currentStep === 0 && Object.keys(session.answers).length === 0) {
      await sendWhatsappMessage(from, questions[0].text);
      session.step++;
    } else if (currentStep > 0 && currentStep <= questions.length) {
      // Önceki sorunun cevabını kaydet
      const prevQuestion = questions[currentStep - 1];
      session.answers[prevQuestion.key] = message.text?.body || '';
      // Sonraki soru varsa gönder
      if (currentStep < questions.length) {
        await sendWhatsappMessage(from, questions[currentStep].text);
        session.step++;
      } else {
        // Tüm sorular tamamlandı, Firestore'a kaydet
        try {
          await db.collection('users').add({
            phone: from,
            ...session.answers,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
          await sendWhatsappMessage(from, 'Teşekkürler! Bilgileriniz kaydedildi.');
        } catch (err) {
          await sendWhatsappMessage(from, 'Kaydederken bir hata oluştu. Lütfen tekrar deneyin.');
        }
        delete sessions[from]; // Oturumu sıfırla
      }
    }
  }
  res.sendStatus(200);
});

async function sendWhatsappMessage(to, text) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      text: { body: text }
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Sunucu http://localhost:${PORT} üzerinden çalışıyor`);
}); 