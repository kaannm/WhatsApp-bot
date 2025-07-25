const express = require('express');
const app = express();
const axios = require('axios');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const imagenService = require('./services/imagenService');
const whatsappService = require('./services/whatsappService');

// Kullanıcı oturumlarını hafızada tutmak için basit bir obje
const sessions = {};
const questions = [
  { key: 'name', text: 'Adın ne?' },
  { key: 'friendName', text: 'Arkadaşının adı ne?' }
];

// Eğlenceli sorular (3 basit soru)
const funQuestions = [
  { key: 'friendLikes', text: 'Arkadaşın ne yapmayı sever?' },
  { key: 'youLike', text: 'Sen ne yapmayı seversin?' },
  { key: 'dreamPlace', text: 'Birlikte nereye gitmek istersiniz?' }
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

// Coca-Cola tarzı asistan akışı için sistem promptu
const SYSTEM_PROMPT = `Sen eğlenceli ve samimi bir WhatsApp asistanısın. Coca-Cola tarzında konuş, emoji kullan, arkadaşça ol.

İKİ AŞAMALI FORM:
1. AŞAMA: Temel bilgiler (ad, arkadaş adı)
2. AŞAMA: Eğlenceli sorular (3 soru + fotoğraflar)

ÖNEMLİ KURALLAR:
1. Kullanıcıdan gelen cevapta yeni bilgi varsa, bunu "YENİ_BİLGİ: [alan]: [değer]" formatında belirt
2. Eğlenceli ve samimi konuş, emoji kullan
3. İlk form tamamlanınca "FORM_TAMAMLANDI" yaz
4. Resim formu tamamlanınca "IMAGE_FORM_TAMAMLANDI" yaz
5. Kullanıcının adını öğrendikten sonra kullan
6. "Atla" yazarsa yeni soru sor

COCA-COLA TARZI KONUŞMA:
- "Selam! 👋 Bir Arkadaşlık Hikayesi'ne hoş geldin. 🥤"
- "Tanıştığımıza memnun oldum [Ad]! 🙌"
- "Harika gidiyorsun! 📸"
- "Mükemmel. Şimdi biraz bekle! 🎬"
- "Süper. Şimdi de arkadaşının bir fotoğrafını yükle."

EĞLENCELİ SORULAR:
- "Arkadaşın ne yapmayı sever?"
- "Sen ne yapmayı seversin?"
- "Birlikte nereye gitmek istersiniz?"

Kullanıcı "Atla" yazarsa, yeni bir soru sor.`;

const formFields = [
  { key: 'name', label: 'Adı' },
  { key: 'friendName', label: 'Arkadaş Adı' }
];

const funFormFields = [
  { key: 'friendLikes', label: 'Arkadaşın Sevdiği' },
  { key: 'youLike', label: 'Senin Sevdiğin' },
  { key: 'dreamPlace', label: 'Hayal Yeriniz' }
];

function getFormState(session) {
  let state = '';
  for (const field of formFields) {
    if (session.answers[field.key]) {
      state += `${field.label}: ${session.answers[field.key]}\n`;
    }
  }
  return state.trim();
}

function getImageFormState(session) {
  let state = '';
  for (const field of funFormFields) {
    if (session.funAnswers && session.funAnswers[field.key]) {
      state += `${field.label}: ${session.funAnswers[field.key]}\n`;
    }
  }
  return state.trim();
}

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

// Imagen 2 resim oluşturma endpoint'i
app.post('/generate-image', express.json(), async (req, res) => {
  try {
    const { prompt, phoneNumber, options = {} } = req.body;
    
    if (!prompt || !phoneNumber) {
      return res.status(400).json({ error: 'Prompt ve telefon numarası gerekli' });
    }

    // Resim oluştur
    const images = await imagenService.generateImage(prompt, options);
    
    if (images && images.length > 0) {
      // İlk resmi WhatsApp'a gönder
      await imagenService.sendImageToWhatsApp(phoneNumber, images[0].imageData, prompt);
      
      res.json({ 
        success: true, 
        message: 'Resim oluşturuldu ve gönderildi',
        imageCount: images.length 
      });
    } else {
      res.status(500).json({ error: 'Resim oluşturulamadı' });
    }
    
  } catch (error) {
    console.error('Resim oluşturma hatası:', error);
    res.status(500).json({ error: 'Resim oluşturma başarısız' });
  }
});
  
// Resim düzenleme endpoint'i
app.post('/edit-image', express.json(), async (req, res) => {
  try {
    const { imageData, prompt, phoneNumber, options = {} } = req.body;
    
    if (!imageData || !prompt || !phoneNumber) {
      return res.status(400).json({ error: 'Resim, prompt ve telefon numarası gerekli' });
    }
      
    // Resmi düzenle
    const images = await imagenService.editImage(imageData, prompt, options);
    
    if (images && images.length > 0) {
      await imagenService.sendImageToWhatsApp(phoneNumber, images[0].imageData, prompt);
      
      res.json({ 
        success: true, 
        message: 'Resim düzenlendi ve gönderildi' 
      });
    } else {
      res.status(500).json({ error: 'Resim düzenlenemedi' });
    }
    
  } catch (error) {
    console.error('Resim düzenleme hatası:', error);
    res.status(500).json({ error: 'Resim düzenleme başarısız' });
  }
});

app.post('/webhook', express.json(), async (req, res) => {
  console.log('POST /webhook çağrıldı');
  const entry = req.body.entry?.[0];
  const changes = entry?.changes?.[0];
  const message = changes?.value?.messages?.[0];
      
  if (message) {
    const from = message.from;
    
    // Template button response kontrolü
    if (message.interactive && message.interactive.type === 'button_reply') {
      const buttonText = message.interactive.button_reply.title;
      console.log('Template buton tıklandı:', buttonText);
      
      if (buttonText === 'Başlayalım!') {
        if (!sessions[from]) {
          sessions[from] = { 
            answers: {}, 
            funAnswers: {},
            awaitingAnswer: false,
            formStage: 'basic',
            currentQuestionIndex: 0
          };
        }
        try {
          await sendWhatsappMessage(from, 'Harika! Adın ne?');
        } catch (whatsappError) {
          console.error('Soru gönderme hatası:', whatsappError.message);
        }
        return res.sendStatus(200);
      } else if (buttonText === 'Şimdi Değil') {
        try {
          await sendWhatsappMessage(from, 'Tamam! İstediğin zaman "Merhaba" yazarak başlayabilirsin. 👋');
        } catch (whatsappError) {
          console.error('Veda mesajı gönderme hatası:', whatsappError.message);
        }
        return res.sendStatus(200);
      }
    }
    
    // Metin komutları kontrolü (fallback)
    const userInput = message.text?.body || '';
    
    if (userInput.toLowerCase().includes('başlayalım') || userInput.toLowerCase().includes('başla')) {
      if (!sessions[from]) {
        sessions[from] = { 
          answers: {}, 
          funAnswers: {},
          awaitingAnswer: false,
          formStage: 'basic',
          currentQuestionIndex: 0
        };
      }
      try {
        await sendWhatsappMessage(from, 'Harika! Adın ne?');
      } catch (whatsappError) {
        console.error('Soru gönderme hatası:', whatsappError.message);
      }
      return res.sendStatus(200);
    }
    
    if (!sessions[from]) {
      sessions[from] = { 
        answers: {}, 
        funAnswers: {},
        awaitingAnswer: false,
        formStage: 'basic', // 'basic' veya 'fun'
        currentQuestionIndex: 0
      };
      
      // Hoş geldin mesajı gönder (template ile hızlı butonlar)
      try {
        await whatsappService.sendTemplateMessage(from, 'welcome_message', 'tr');
      } catch (whatsappError) {
        console.error('Template mesajı gönderme hatası:', whatsappError.message);
        // Fallback: Basit metin mesajı
        try {
          await sendWhatsappMessage(from, `Selam! 👋 Bir Arkadaşlık Hikayesi'ne hoş geldin. 🥤\n\nSana ve arkadaşına özel benzersiz bir hikaye oluşturmak için buradayım. Öncesinde sadece bir kaç soru sormam gerekiyor.\n\nBaşlamak için "Başlayalım!" yazabilirsin.`);
        } catch (fallbackError) {
          console.error('Fallback mesajı gönderme hatası:', fallbackError.message);
        }
      }
      return res.sendStatus(200);
    }
    
    const session = sessions[from];
    if (!canUseGemini(from)) {
      await sendWhatsappMessage(from, 'Günlük ücretsiz sohbet hakkınız doldu, yarın tekrar deneyin.');
      return res.sendStatus(200);
    }
    
    // Kullanıcıdan gelen cevabı ve formun mevcut durumunu Gemini'ye ilet
    let formState = getFormState(session);
    let imageFormState = getImageFormState(session);
    
    let currentFields = session.formStage === 'basic' ? formFields : funFormFields;
    let currentAnswers = session.formStage === 'basic' ? session.answers : session.funAnswers;
    let nextField = currentFields.find(f => !currentAnswers[f.key]);
    
    let prompt = `${SYSTEM_PROMPT}\n\nFORM AŞAMASI: ${session.formStage === 'basic' ? 'TEMEL BİLGİLER' : 'RESİM OLUŞTURMA'}\n\nŞu ana kadar alınan bilgiler:\n${session.formStage === 'basic' ? formState : imageFormState || 'Henüz bilgi yok.'}\n\nKullanıcı cevabı: ${userInput}\n\nÖNEMLİ: Kullanıcı zaten bilgi verdiğinde, o bilgiyi kabul et ve bir sonraki soruya geç. Aynı soruyu tekrar sorma. Doğal ve samimi konuş.`;
    
    try {
      const geminiResponse = (await askGemini(prompt)).trim();
      console.log('Gemini asistan cevabı:', geminiResponse);
      
      // YENİ_BİLGİ formatını kontrol et
      const newInfoMatch = geminiResponse.match(/YENİ_BİLGİ:\s*([^\n]+)/i);
      if (newInfoMatch) {
        const newInfo = newInfoMatch[1];
        const currentFields = session.formStage === 'basic' ? formFields : funFormFields;
        const currentAnswers = session.formStage === 'basic' ? session.answers : session.funAnswers;
        
        for (const field of currentFields) {
          const regex = new RegExp(`${field.label}:\\s*([^\n]+)`, 'i');
          const match = newInfo.match(regex);
          if (match) {
            currentAnswers[field.key] = match[1].trim();
            console.log(`Yeni bilgi kaydedildi: ${field.key} = ${match[1].trim()}`);
          }
        }
      }
      
      // Eğer temel form tamamlandıysa
      if (/FORM_TAMAMLANDI/i.test(geminiResponse) && session.formStage === 'basic') {
        try {
          await db.collection('users').add({
            phone: from,
            ...session.answers,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
          
          // Eğlenceli sorulara geç
          session.formStage = 'fun';
          session.currentQuestionIndex = 0;
          try {
            await sendWhatsappMessage(from, 
              `Tamam, şimdi sizi biraz daha yakından tanımak istiyorum.\n\nİlişkiniz hakkında daha fazla bilgi edinmek için sana 3 soru soracağım. Eğer bir soruyu beğenmezsen veya alakasız olduğunu düşünüyorsan, "Atla" yazabilirsin.\n\nİlk soru: ${funQuestions[0].text}`);
          } catch (whatsappError) {
            console.error('Geçiş mesajı gönderme hatası:', whatsappError.message);
          }
          
        } catch (err) {
          console.error('Firestore kayıt hatası:', err);
          try {
            await sendWhatsappMessage(from, 'Kaydederken bir hata oluştu. Lütfen tekrar deneyin.');
          } catch (whatsappError) {
            console.error('Hata mesajı gönderme hatası:', whatsappError.message);
          }
        }
      } else if (session.formStage === 'fun') {
        // Eğlenceli sorular akışı
        const currentQuestion = funQuestions[session.currentQuestionIndex];
        
        if (userInput.toLowerCase().includes('atla')) {
          // Soruyu atla, bir sonrakine geç
          session.currentQuestionIndex++;
          if (session.currentQuestionIndex >= funQuestions.length) {
            // Tüm sorular tamamlandı
            try {
              await sendWhatsappMessage(from, `Harika gidiyorsun! 📸 Şimdi, bana bir fotoğrafını gönderebilir misin? Yüzünün tamamen göründüğünden ve karede başka kimsenin olmadığından emin ol lütfen.`);
            } catch (whatsappError) {
              console.error('Fotoğraf isteme hatası:', whatsappError.message);
            }
          } else {
            const nextQuestion = funQuestions[session.currentQuestionIndex];
            try {
              await sendWhatsappMessage(from, nextQuestion.text);
            } catch (whatsappError) {
              console.error('Soru gönderme hatası:', whatsappError.message);
            }
          }
        } else {
          // Cevabı kaydet
          session.funAnswers[currentQuestion.key] = userInput.trim();
          console.log(`Eğlenceli cevap kaydedildi: ${currentQuestion.key} = ${userInput.trim()}`);
          
          // Bir sonraki soruya geç
          session.currentQuestionIndex++;
          if (session.currentQuestionIndex >= funQuestions.length) {
            // Tüm sorular tamamlandı
            try {
              await sendWhatsappMessage(from, `Harika gidiyorsun! 📸 Şimdi, bana bir fotoğrafını gönderebilir misin? Yüzünün tamamen göründüğünden ve karede başka kimsenin olmadığından emin ol lütfen.`);
            } catch (whatsappError) {
              console.error('Fotoğraf isteme hatası:', whatsappError.message);
            }
          } else {
            const nextQuestion = funQuestions[session.currentQuestionIndex];
            try {
              await sendWhatsappMessage(from, nextQuestion.text);
            } catch (whatsappError) {
              console.error('Soru gönderme hatası:', whatsappError.message);
            }
          }
        }
      } else if (/IMAGE_FORM_TAMAMLANDI/i.test(geminiResponse) || 
                 (session.formStage === 'fun' && 
                  session.funAnswers.friendLikes && 
                  session.funAnswers.youLike && 
                  session.funAnswers.dreamPlace)) {
        // Resim formu tamamlandı - AI resim oluştur
        try {
          const imagePrompt = `${session.answers.name} ve ${session.answers.friendName} ${session.funAnswers.dreamPlace} ülkesinde ${session.funAnswers.friendLikes} yaparken. Modern ve kaliteli bir resim. İki arkadaş mutlu ve eğleniyor.`;
          
          const images = await imagenService.generateImage(imagePrompt, {
            aspectRatio: '1:1',
            guidanceScale: 'high'
          });
          
          if (images && images.length > 0) {
            try {
              await imagenService.sendImageToWhatsApp(from, images[0].imageData, 
                `🎨 ${session.answers.name}! Senin için özel resmin hazır. ${session.answers.friendName} ile ${session.funAnswers.dreamPlace} hayalin!`);
            } catch (imageSendError) {
              console.error('Resim gönderme hatası:', imageSendError.message);
              await sendWhatsappMessage(from, 'Resim oluşturuldu ama gönderilemedi. Tekrar deneyeceğim.');
            }
          }
        } catch (imageError) {
          console.error('Resim oluşturma hatası:', imageError);
          try {
            await sendWhatsappMessage(from, 'Resim oluşturulamadı ama bilgileriniz kaydedildi. Teşekkürler!');
          } catch (whatsappError) {
            console.error('Teşekkür mesajı gönderme hatası:', whatsappError.message);
          }
        }
        delete sessions[from];
      } else {
        // Kullanıcıya Gemini'nin cevabını ilet (YENİ_BİLGİ kısmını çıkar)
        const cleanResponse = geminiResponse.replace(/YENİ_BİLGİ:.*$/gim, '').trim();
        try {
          await sendWhatsappMessage(from, cleanResponse);
        } catch (whatsappError) {
          console.error('WhatsApp mesaj gönderme hatası:', whatsappError.message);
        }
      }
    } catch (err) {
      console.error('Gemini API hatası:', err);
      try {
        await sendWhatsappMessage(from, 'Servisimiz şu anda müsait değil, lütfen biraz sonra tekrar deneyin.');
      } catch (whatsappError) {
        console.error('WhatsApp mesaj gönderme hatası:', whatsappError.message);
      }
      return res.sendStatus(200);
    }
  }
  res.sendStatus(200);
});

// WhatsApp mesaj gönderme fonksiyonu artık servis kullanıyor
async function sendWhatsappMessage(to, text) {
  await whatsappService.sendMessage(to, text);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Sunucu http://localhost:${PORT} üzerinden çalışıyor`);
}); 