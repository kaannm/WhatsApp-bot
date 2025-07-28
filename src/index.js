const express = require('express');
const app = express();
const axios = require('axios');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const imagenService = require('./services/imagenService');
const whatsappService = require('./services/whatsappService');
const geminiService = require('./services/geminiService');

// Kullanıcı oturumlarını hafızada tutmak için basit bir obje
const sessions = {};

// Form aşamaları
const FORM_STAGES = {
  WELCOME: 'welcome',
  NAME: 'name',
  FRIEND_NAME: 'friend_name',
  REGISTRATION: 'registration',
  FUN_QUESTIONS: 'fun_questions',
  PHOTO_REQUEST: 'photo_request',
  PROCESSING: 'processing'
};

// Eğlenceli sorular (Coca-Cola tarzı)
const funQuestions = [
  { key: 'friendLikes', text: 'Arkadaşın ne yapmaktan hoşlanır?' },
  { key: 'youLike', text: 'Sen ne yapmaktan hoşlanırsın?' },
  { key: 'dreamPlace', text: 'Birlikte nereye gitmek istersiniz?' }
];

// WhatsApp Flow Token (Meta Developer Console'dan alacaksın)
const WHATSAPP_FLOW_TOKEN = process.env.WHATSAPP_FLOW_TOKEN || 'your_flow_token_here';

// Kayıt formu seçenekleri (fallback için)
const registrationOptions = {
  cities: [
    { id: 'istanbul', title: 'İstanbul' },
    { id: 'ankara', title: 'Ankara' },
    { id: 'izmir', title: 'İzmir' },
    { id: 'bursa', title: 'Bursa' },
    { id: 'antalya', title: 'Antalya' },
    { id: 'adana', title: 'Adana' },
    { id: 'konya', title: 'Konya' },
    { id: 'gaziantep', title: 'Gaziantep' },
    { id: 'diyarbakir', title: 'Diyarbakır' },
    { id: 'other', title: 'Diğer' }
  ],
  ageGroups: [
    { id: '18-25', title: '18-25 yaş' },
    { id: '26-35', title: '26-35 yaş' },
    { id: '36-45', title: '36-45 yaş' },
    { id: '46+', title: '46+ yaş' }
  ],
  interests: [
    { id: 'sports', title: 'Spor' },
    { id: 'music', title: 'Müzik' },
    { id: 'travel', title: 'Seyahat' },
    { id: 'food', title: 'Yemek' },
    { id: 'technology', title: 'Teknoloji' },
    { id: 'art', title: 'Sanat' },
    { id: 'gaming', title: 'Oyun' },
    { id: 'fitness', title: 'Fitness' }
  ]
};

// Firebase Admin başlat
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

// Gemini AI başlat
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const gemini = new GoogleGenerativeAI(GEMINI_API_KEY);

// Kullanıcı başına 24 saatte 50 Gemini mesaj limiti
const geminiLimits = {};
const GEMINI_LIMIT = 50;
const LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

// Sistem promptu (Coca-Cola tarzı)
const SYSTEM_PROMPT = `Sen eğlenceli ve samimi bir WhatsApp asistanısın. Coca-Cola tarzında konuş, emoji kullan, arkadaşça ol.

FORM AŞAMALARI:
1. İsim alma (chat)
2. Arkadaş adı alma (chat)
3. WhatsApp Flow (kayıt formu)
4. Eğlenceli sorular (3 soru)
5. Fotoğraf isteme (2 fotoğraf)

ÖNEMLİ KURALLAR:
1. Kullanıcıdan gelen cevapta yeni bilgi varsa, bunu "YENİ_BİLGİ: [alan]: [değer]" formatında belirt
2. Eğlenceli ve samimi konuş, emoji kullan
3. Her aşama tamamlanınca "AŞAMA_TAMAMLANDI" yaz
4. Kullanıcının adını öğrendikten sonra kullan
5. "Atla" yazarsa yeni soru sor
6. "BAŞTAN" yazarsa sıfırla
7. İsim ve arkadaş adı alındıktan sonra WhatsApp Flow'u başlat

COCA-COLA TARZI KONUŞMA:
- "Selam! Coca-Cola // Bir Arkadaşlık Hikayesi'ne hoş geldin. 🥤"
- "Tanıştığımıza memnun oldum [Ad]! 🙌"
- "Harika! [Arkadaş Adı] ile arkadaşsınız. 🎯"
- "Şimdi kayıt formunu dolduralım."
- "Harika gidiyorsun! 📸"
- "Mükemmel. Şimdi biraz bekle! 🎬"
- "Süper. Şimdi de arkadaşının ([Arkadaş Adı]) bir fotoğrafını yükle."

EĞLENCELİ SORULAR:
- "Arkadaşın ne yapmaktan hoşlanır?"
- "Sen ne yapmaktan hoşlanırsın?"
- "Birlikte nereye gitmek istersiniz?"

Kullanıcı "Atla" yazarsa, yeni bir soru sor.
Kullanıcı "BAŞTAN" yazarsa, sıfırla ve hoş geldin mesajı gönder.`;

function canUseGemini(userId) {
  const now = Date.now();
  if (!geminiLimits[userId] || now - geminiLimits[userId].start > LIMIT_WINDOW_MS) {
    geminiLimits[userId] = { count: 0, start: now };
  }
  if (geminiLimits[userId].count >= GEMINI_LIMIT) return false;
  geminiLimits[userId].count++;
  return true;
}

async function askGemini(prompt) {
  const model = gemini.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

// WhatsApp Flow gönder
async function sendWhatsAppFlow(to) {
  try {
    return await whatsappService.sendFlowMessage(to, WHATSAPP_FLOW_TOKEN, 'Kayıt formunu dolduralım! 📝\n\nFormu açmak için butona tıklayın.');
  } catch (error) {
    console.error('WhatsApp flow gönderme hatası:', error.message);
    throw error;
  }
}

// Kayıt formu gönder (fallback - List Messages)
async function sendRegistrationForm(to, formType) {
  try {
    let text;
    
    switch (formType) {
      case 'lastName':
        text = 'Soyadınız nedir? 📝';
        break;
        
      case 'email':
        text = 'E-posta adresiniz nedir? 📧';
        break;
        
      case 'phone':
        text = 'Telefon numaranız nedir? 📱';
        break;
        
      case 'age':
        text = 'Yaşınız nedir? 📊';
        break;
        
      case 'city':
        text = 'Hangi şehirde yaşıyorsun? 🏙️';
        break;
        
      default:
        throw new Error('Geçersiz form tipi');
    }
    
    return await whatsappService.sendMessage(to, text);
  } catch (error) {
    console.error('Kayıt formu gönderme hatası:', error.message);
    throw error;
  }
}

// WhatsApp mesaj gönderme
async function sendWhatsappMessage(to, text) {
  await whatsappService.sendMessage(to, text);
}

// Ana Express uygulaması
app.use(express.json());

app.get('/', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'WhatsApp Bot çalışıyor!' });
});

// Webhook doğrulama
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

// Ana webhook endpoint
app.post('/webhook', async (req, res) => {
  console.log('POST /webhook çağrıldı');
  
  const entry = req.body.entry?.[0];
  const changes = entry?.changes?.[0];
  const message = changes?.value?.messages?.[0];
  
  if (message) {
    const from = message.from;
    
    // WhatsApp Flow yanıtları kontrolü
    if (message.interactive && message.interactive.type === 'flow_completion') {
      const flowCompletion = message.interactive.flow_completion;
      console.log('WhatsApp flow tamamlandı:', flowCompletion);
      
      if (!sessions[from]) {
        sessions[from] = { 
          stage: FORM_STAGES.FUN_QUESTIONS,
          answers: {},
          funAnswers: {},
          photos: [],
          currentQuestionIndex: 0
        };
      }
      
      // Flow verilerini al ve eğlenceli sorulara geç
      if (flowCompletion.response && flowCompletion.response.answers) {
        const answers = flowCompletion.response.answers;
        
        // Flow yanıtlarını session'a kaydet
        answers.forEach(answer => {
          if (answer.question && answer.answer) {
            const questionText = answer.question.toLowerCase();
            if (questionText.includes('soyadınız') || questionText.includes('soyadın')) {
              sessions[from].answers.lastName = answer.answer;
            } else if (questionText.includes('e-posta') || questionText.includes('email')) {
              sessions[from].answers.email = answer.answer;
            } else if (questionText.includes('telefon')) {
              sessions[from].answers.phone = answer.answer;
            } else if (questionText.includes('yaş grubunuz') || questionText.includes('yaş')) {
              sessions[from].answers.ageGroup = answer.answer;
            } else if (questionText.includes('yaşınız')) {
              sessions[from].answers.customAge = answer.answer;
            } else if (questionText.includes('şehir')) {
              sessions[from].answers.city = answer.answer;
            } else if (questionText.includes('şehriniz')) {
              sessions[from].answers.customCity = answer.answer;
            }
          }
        });
        
        console.log('Flow verileri kaydedildi:', sessions[from].answers);
      }
      
      try {
        await sendWhatsappMessage(from, `Tamam, şimdi sizi biraz daha yakından tanımak istiyorum.\n\nİlişkiniz hakkında daha fazla bilgi edinmek için sana 3 soru soracağım. Lütfen bunları olabildiğince detaylı cevapla. Cevaplarını birkaç mesaja bölmek yerine tek seferde vermeye dikkat et. Eğer bir soruyu beğenmezsen veya alakasız olduğunu düşünüyorsan, "Atla"'ya tıkla, sana yeni bir soru veririm.\n\nAnlaştık mı?`);
        sessions[from].stage = FORM_STAGES.FUN_QUESTIONS;
      } catch (whatsappError) {
        console.error('Flow tamamlama mesajı gönderme hatası:', whatsappError.message);
      }
      
      return res.sendStatus(200);
    }
    

    
    // Template button response kontrolü
    if (message.interactive && message.interactive.type === 'button_reply') {
      const buttonText = message.interactive.button_reply.title;
      console.log('Template buton tıklandı:', buttonText);
      
      if (buttonText === 'Başlayalım!') {
        if (!sessions[from]) {
          sessions[from] = { 
            stage: FORM_STAGES.NAME,
            answers: {},
            funAnswers: {},
            photos: [],
            currentQuestionIndex: 0
          };
        }
        try {
          await sendWhatsappMessage(from, 'Harika! Adın ne?');
        } catch (whatsappError) {
          console.error('Soru gönderme hatası:', whatsappError.message);
        }
        return res.sendStatus(200);
      } else if (buttonText === 'Kayıt Ol') {
        if (!sessions[from]) {
          sessions[from] = { 
            stage: FORM_STAGES.REGISTRATION,
            answers: {},
            funAnswers: {},
            photos: [],
            currentQuestionIndex: 0
          };
        }
        try {
          // WhatsApp Flow kullan (eğer flow token varsa)
          if (WHATSAPP_FLOW_TOKEN && WHATSAPP_FLOW_TOKEN !== 'your_flow_token_here') {
            await sendWhatsAppFlow(from);
          } else {
            // Fallback: List Messages kullan
            await sendWhatsappMessage(from, 'Harika! Kayıt formunu dolduralım. 🎯\n\nÖnce hangi şehirde yaşadığınızı öğrenebilir miyim?');
            await sendRegistrationForm(from, 'city');
          }
        } catch (whatsappError) {
          console.error('Kayıt formu başlatma hatası:', whatsappError.message);
        }
        return res.sendStatus(200);
      }
    }
    
    // Yeni kullanıcı - hoş geldin mesajı
    if (!sessions[from]) {
      sessions[from] = { 
        stage: FORM_STAGES.NAME,
        answers: {},
        funAnswers: {},
        photos: [],
        currentQuestionIndex: 0
      };
      
      try {
        await sendWhatsappMessage(from, `Selam! Coca-Cola // Bir Arkadaşlık Hikayesi'ne hoş geldin. 🥤\n\nSana ve arkadaşına özel benzersiz bir hikaye oluşturmak için buradayım. Öncesinde sadece bir kaç soru sormam gerekiyor. Herhangi bir noktada baştan başlamak istersen BAŞTAN yazman yeterli.\n\nHaydi başlayalım. Adın ne?`);
      } catch (whatsappError) {
        console.error('Hoş geldin mesajı gönderme hatası:', whatsappError.message);
      }
      return res.sendStatus(200);
    }
    
    const session = sessions[from];
    
    // Gemini limit kontrolü
    if (!canUseGemini(from)) {
      await sendWhatsappMessage(from, 'Günlük ücretsiz sohbet hakkınız doldu, yarın tekrar deneyin.');
      return res.sendStatus(200);
    }
    
    // Kullanıcı mesajını al
    const userInput = message.text?.body || '';
    
    // Medya mesajı kontrolü (fotoğraf)
    if (message.image) {
      if (session.stage === FORM_STAGES.PHOTO_REQUEST) {
        try {
          const mediaUrl = await whatsappService.getMediaUrl(message.image.id);
          const imageData = await whatsappService.downloadMediaAsBase64(mediaUrl);
          
          session.photos.push(imageData);
          console.log(`Fotoğraf alındı: ${session.photos.length}/2`);
          
          if (session.photos.length === 1) {
            const friendName = session.answers.friendName || 'arkadaşının';
            await sendWhatsappMessage(from, `Süper. Şimdi de arkadaşının (${friendName}) bir fotoğrafını yükle.`);
          } else if (session.photos.length === 2) {
            await sendWhatsappMessage(from, 'Mükemmel. Şimdi biraz bekle! 🎬 Video hazır olduğunda sana göndereceğim.');
            session.stage = FORM_STAGES.PROCESSING;
            
            // AI işleme başlat
            await processPhotos(from, session);
          }
        } catch (error) {
          console.error('Fotoğraf işleme hatası:', error);
          await sendWhatsappMessage(from, 'Fotoğraf işlenirken bir hata oluştu. Lütfen tekrar deneyin.');
        }
      }
      return res.sendStatus(200);
    }
    
    // Metin mesajı işleme
    try {
      // BAŞTAN komutu kontrolü
      if (userInput.toLowerCase().includes('baştan')) {
        delete sessions[from];
        try {
          await sendWhatsappMessage(from, `Selam! Coca-Cola // Bir Arkadaşlık Hikayesi'ne hoş geldin. 🥤\n\nSana ve arkadaşına özel benzersiz bir hikaye oluşturmak için buradayım. Öncesinde sadece bir kaç soru sormam gerekiyor. Herhangi bir noktada baştan başlamak istersen BAŞTAN yazman yeterli.\n\nHaydi başlayalım. Adın ne?`);
        } catch (whatsappError) {
          console.error('Baştan mesajı gönderme hatası:', whatsappError.message);
        }
        return res.sendStatus(200);
            }
      
      // Kayıt formu text input'ları kontrolü
      if (session.stage === FORM_STAGES.REGISTRATION) {
        console.log(`Kayıt formu text input: ${userInput}`);
        
        // Hangi alanı beklediğimizi kontrol et
        if (!sessions[from].currentField) {
          sessions[from].currentField = 'lastName';
        }
        
        switch (sessions[from].currentField) {
          case 'lastName':
            sessions[from].answers.lastName = userInput.trim();
            sessions[from].currentField = 'email';
            try {
              await sendWhatsappMessage(from, `Harika! ${userInput.trim()} soyadınız. 📝\n\nŞimdi e-posta adresinizi öğrenebilir miyim?`);
              await sendRegistrationForm(from, 'email');
            } catch (whatsappError) {
              console.error('E-posta formu gönderme hatası:', whatsappError.message);
            }
            return res.sendStatus(200);
            
          case 'email':
            sessions[from].answers.email = userInput.trim();
            sessions[from].currentField = 'phone';
            try {
              await sendWhatsappMessage(from, `Teşekkürler! ${userInput.trim()} e-posta adresiniz. 📧\n\nŞimdi telefon numaranızı öğrenebilir miyim?`);
              await sendRegistrationForm(from, 'phone');
            } catch (whatsappError) {
              console.error('Telefon formu gönderme hatası:', whatsappError.message);
            }
            return res.sendStatus(200);
            
          case 'phone':
            sessions[from].answers.phone = userInput.trim();
            sessions[from].currentField = 'age';
            try {
              await sendWhatsappMessage(from, `Mükemmel! ${userInput.trim()} telefon numaranız. 📱\n\nŞimdi yaşınızı öğrenebilir miyim?`);
              await sendRegistrationForm(from, 'age');
            } catch (whatsappError) {
              console.error('Yaş formu gönderme hatası:', whatsappError.message);
            }
            return res.sendStatus(200);
            
          case 'age':
            sessions[from].answers.ageGroup = userInput.trim();
            sessions[from].currentField = 'city';
            try {
              await sendWhatsappMessage(from, `Teşekkürler! ${userInput.trim()} yaşındasınız. 📊\n\nSon olarak şehrinizi öğrenebilir miyim?`);
              await sendRegistrationForm(from, 'city');
            } catch (whatsappError) {
              console.error('Yaş formu gönderme hatası:', whatsappError.message);
            }
            return res.sendStatus(200);
            
          case 'city':
            sessions[from].answers.city = userInput.trim();
            delete sessions[from].currentField;
            try {
              await sendWhatsappMessage(from, `Harika! ${userInput.trim()} güzel bir şehir. 🏙️\n\nKayıt formunuz tamamlandı! Şimdi eğlenceli sorulara geçelim.\n\nİlk soru: ${funQuestions[0].text}`);
              sessions[from].stage = FORM_STAGES.FUN_QUESTIONS;
            } catch (whatsappError) {
              console.error('Tamamlama mesajı gönderme hatası:', whatsappError.message);
            }
            return res.sendStatus(200);
        }
      }
      
      let prompt = `${SYSTEM_PROMPT}\n\nMEVCUT AŞAMA: ${session.stage}\n\nKullanıcı cevabı: ${userInput}\n\nÖNEMLİ: Kullanıcı zaten bilgi verdiğinde, o bilgiyi kabul et ve bir sonraki aşamaya geç.`;
      
      const geminiResponse = await askGemini(prompt);
      console.log('Gemini cevabı:', geminiResponse);
      
      // YENİ_BİLGİ formatını kontrol et
      const newInfoMatch = geminiResponse.match(/YENİ_BİLGİ:\s*([^\n]+)/i);
      if (newInfoMatch) {
        const newInfo = newInfoMatch[1];
        
        if (session.stage === FORM_STAGES.NAME) {
          session.answers.name = userInput.trim();
          session.stage = FORM_STAGES.FRIEND_NAME;
          await sendWhatsappMessage(from, `Tanıştığımıza memnun oldum ${userInput.trim()}! 🙌\n\nPeki, arkadaşının adı ne?`);
        } else if (session.stage === FORM_STAGES.FRIEND_NAME) {
          session.answers.friendName = userInput.trim();
          session.stage = FORM_STAGES.REGISTRATION;
          await sendWhatsappMessage(from, `Harika! ${userInput.trim()} ile arkadaşsınız. 🎯\n\nŞimdi kayıt formunu dolduralım.`);
          // WhatsApp Flow'u başlat
          if (WHATSAPP_FLOW_TOKEN && WHATSAPP_FLOW_TOKEN !== 'your_flow_token_here') {
            await sendWhatsAppFlow(from);
          } else {
                      // Fallback: List Messages kullan
          await sendRegistrationForm(from, 'lastName');
          }
        }
      } else if (session.stage === FORM_STAGES.FUN_QUESTIONS) {
        // Eğlenceli sorular akışı
        const currentQuestion = funQuestions[session.currentQuestionIndex];
        
        if (userInput.toLowerCase().includes('atla')) {
          // Soruyu atla
          session.currentQuestionIndex++;
          if (session.currentQuestionIndex >= funQuestions.length) {
            // Tüm sorular tamamlandı
            await sendWhatsappMessage(from, `Harika gidiyorsun! 📸\n\nŞimdi, bana bir fotoğrafını gönderebilir misin? Yüzünün tamamen göründüğünden ve karede başka kimsenin olmadığından emin ol lütfen.`);
            session.stage = FORM_STAGES.PHOTO_REQUEST;
          } else {
            const nextQuestion = funQuestions[session.currentQuestionIndex];
            await sendWhatsappMessage(from, nextQuestion.text);
          }
        } else {
          // Cevabı kaydet
          session.funAnswers[currentQuestion.key] = userInput.trim();
          console.log(`Eğlenceli cevap kaydedildi: ${currentQuestion.key} = ${userInput.trim()}`);
          
          // Bir sonraki soruya geç
          session.currentQuestionIndex++;
          if (session.currentQuestionIndex >= funQuestions.length) {
            // Tüm sorular tamamlandı
            await sendWhatsappMessage(from, `Harika gidiyorsun! 📸\n\nŞimdi, bana bir fotoğrafını gönderebilir misin? Yüzünün tamamen göründüğünden ve karede başka kimsenin olmadığından emin ol lütfen.`);
            session.stage = FORM_STAGES.PHOTO_REQUEST;
          } else {
            const nextQuestion = funQuestions[session.currentQuestionIndex];
            await sendWhatsappMessage(from, nextQuestion.text);
          }
        }
        return res.sendStatus(200);
      } else if (session.stage === FORM_STAGES.PHOTO_REQUEST) {
        // Fotoğraf aşamasında metin mesajı geldiğinde
        await sendWhatsappMessage(from, 'Lütfen bir fotoğraf gönderin. 📸');
        return res.sendStatus(200);
      } else {
        // Gemini'nin cevabını ilet
        const cleanResponse = geminiResponse.replace(/YENİ_BİLGİ:.*$/gim, '').trim();
        await sendWhatsappMessage(from, cleanResponse);
      }
      
    } catch (err) {
      console.error('Gemini API hatası:', err);
      await sendWhatsappMessage(from, 'Servisimiz şu anda müsait değil, lütfen biraz sonra tekrar deneyin.');
    }
  }
  
  res.sendStatus(200);
});

// Fotoğrafları işle ve sonuç gönder
async function processPhotos(from, session) {
  try {
    // Firebase'e kaydet
    await db.collection('users').add({
      phone: from,
      ...session.answers,
      funAnswers: session.funAnswers,
      photos: session.photos.length,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // AI resim oluştur
    const firstName = session.answers.firstName || 'Kullanıcı';
    const friendName = session.answers.friendName || 'Arkadaş';
    const dreamPlace = session.funAnswers.dreamPlace || 'güzel bir yerde';
    const friendLikes = session.funAnswers.friendLikes || 'eğlenirken';
    
    const imagePrompt = `${firstName} ve ${friendName} ${dreamPlace} ülkesinde ${friendLikes} yaparken. Modern ve kaliteli bir resim. İki arkadaş mutlu ve eğleniyor.`;
    
    const images = await imagenService.generateImage(imagePrompt, {
      aspectRatio: '1:1',
      guidanceScale: 'high'
    });
    
    if (images && images.length > 0) {
      await imagenService.sendImageToWhatsApp(from, images[0].imageData, 
        `🎨 ${firstName}! Senin için özel resmin hazır. ${friendName} ile ${dreamPlace} hayalin!`);
    }
    
    // Oturumu temizle
    delete sessions[from];
    
  } catch (error) {
    console.error('Fotoğraf işleme hatası:', error);
    await sendWhatsappMessage(from, 'Resim oluşturulamadı ama bilgileriniz kaydedildi. Teşekkürler!');
    delete sessions[from];
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Sunucu http://localhost:${PORT} üzerinden çalışıyor`);
}); 