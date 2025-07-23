const express = require('express');
const app = express();
const axios = require('axios');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');

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
  console.log('Firebase Admin başlatıldı!');
}
const db = admin.firestore();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const gemini = new GoogleGenerativeAI(GEMINI_API_KEY);

// Kullanıcı başına 24 saatte 50 Gemini mesaj limiti için sayaç
const geminiLimits = {};
const GEMINI_LIMIT = 50;
const LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 saat

// Akıllı form soruları ve doğrulama promptları
const formFields = [
  { key: 'name', ask: 'Kullanıcıdan adını doğal ve samimi bir dille iste.' },
  { key: 'surname', ask: 'Kullanıcıdan soyadını doğal ve samimi bir dille iste.' },
  { key: 'email', ask: 'Kullanıcıdan e-posta adresini doğal ve samimi bir dille iste.' },
  { key: 'phone', ask: 'Kullanıcıdan telefon numarasını doğal ve samimi bir dille iste.' },
  { key: 'city', ask: 'Kullanıcıdan yaşadığı şehri doğal ve samimi bir dille iste.' }
];

async function askGemini(prompt) {
  const model = gemini.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

function canUseGemini(userId) {
  const now = Date.now();
  if (!geminiLimits[userId] || now - geminiLimits[userId].start > LIMIT_WINDOW_MS) {
    geminiLimits[userId] = { count: 0, start: now };
  }
  if (geminiLimits[userId].count >= GEMINI_LIMIT) return false;
  geminiLimits[userId].count++;
  return true;
}

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
  console.log('POST /webhook çağrıldı');
  const entry = req.body.entry?.[0];
  const changes = entry?.changes?.[0];
  const message = changes?.value?.messages?.[0];

  if (message) {
    const from = message.from;
    if (!sessions[from]) {
      sessions[from] = { step: 0, answers: {}, awaitingAnswer: false, lastQuestion: '' };
    }
    const session = sessions[from];
    const currentStep = session.step;
    if (!canUseGemini(from)) {
      await sendWhatsappMessage(from, 'Günlük ücretsiz sohbet hakkınız doldu, yarın tekrar deneyin.');
      return res.sendStatus(200);
    }
    if (currentStep < formFields.length) {
      if (!session.awaitingAnswer) {
        try {
          const prompt = formFields[currentStep].ask;
          const question = await askGemini(prompt);
          await sendWhatsappMessage(from, question);
          session.awaitingAnswer = true;
          session.lastQuestion = question;
        } catch (err) {
          await sendWhatsappMessage(from, 'Servisimiz şu anda müsait değil, lütfen biraz sonra tekrar deneyin.');
          return res.sendStatus(200);
        }
      } else {
        const userAnswer = message.text?.body || '';
        let validatePrompt;
        if (formFields[currentStep].key === 'name') {
          validatePrompt = `Kullanıcıya şu soruyu sordum: '${session.lastQuestion}'. Cevap: '${userAnswer}'. Eğer cevapta bir insan ismi varsa, sadece ismi döndür. Yoksa 'hayır' yaz.`;
        } else {
          validatePrompt = `Kullanıcıya şu soruyu sordum: '${session.lastQuestion}'. Cevap: '${userAnswer}'. Bu cevap uygun mu? Eğer uygunsa sadece 'evet' de. Eğer uygun değilse, daha doğal ve samimi bir şekilde tekrar sor.`;
        }
        try {
          const validation = (await askGemini(validatePrompt)).trim();
          if (formFields[currentStep].key === 'name') {
            if (/^hayır$/i.test(validation)) {
              await sendWhatsappMessage(from, 'Lütfen adınızı doğru şekilde yazın.');
            } else {
              session.answers[formFields[currentStep].key] = validation;
              session.step++;
              session.awaitingAnswer = false;
              if (session.step === formFields.length) {
                try {
                  console.log('Firestore\'a kayıt deneniyor:', session.answers);
                  await db.collection('users').add({
                    phone: from,
                    ...session.answers,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                  });
                  await sendWhatsappMessage(from, 'Teşekkürler! Bilgileriniz kaydedildi.');
                } catch (err) {
                  console.error('Firestore kayıt hatası:', err);
                  await sendWhatsappMessage(from, 'Kaydederken bir hata oluştu. Lütfen tekrar deneyin.');
                }
                delete sessions[from];
              }
            }
          } else {
            if (/^evet$/i.test(validation)) {
              session.answers[formFields[currentStep].key] = userAnswer;
              session.step++;
              session.awaitingAnswer = false;
              if (session.step === formFields.length) {
                try {
                  console.log('Firestore\'a kayıt deneniyor:', session.answers);
                  await db.collection('users').add({
                    phone: from,
                    ...session.answers,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                  });
                  await sendWhatsappMessage(from, 'Teşekkürler! Bilgileriniz kaydedildi.');
                } catch (err) {
                  console.error('Firestore kayıt hatası:', err);
                  await sendWhatsappMessage(from, 'Kaydederken bir hata oluştu. Lütfen tekrar deneyin.');
                }
                delete sessions[from];
              }
            } else {
              await sendWhatsappMessage(from, validation);
            }
          }
        } catch (err) {
          await sendWhatsappMessage(from, 'Servisimiz şu anda müsait değil, lütfen biraz sonra tekrar deneyin.');
          return res.sendStatus(200);
        }
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