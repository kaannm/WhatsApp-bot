const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const { generateVeo2Video } = require('./veoService');
const geminiService = require('./geminiService');

// Firestore bağlantısı
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

const FORM_QUESTIONS = [
  { key: 'name', question: 'Adınızı yazar mısınız?', validate: (answer) => /^[a-zA-ZçÇğĞıİöÖşŞüÜ\s'-]{2,}$/.test(answer.trim()) },
  { key: 'surname', question: 'Soyadınızı yazar mısınız?', validate: (answer) => /^[a-zA-ZçÇğĞıİöÖşŞüÜ\s'-]{2,}$/.test(answer.trim()) },
  { key: 'email', question: 'E-posta adresinizi yazar mısınız?', validate: (answer) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answer.trim()) },
  { key: 'phone', question: 'Telefon numaranızı yazar mısınız?', validate: (answer) => /^(\+?\d{10,15})$/.test(answer.replace(/\s/g, '')) },
  { key: 'city', question: 'Hangi şehirde yaşıyorsunuz?', validate: (answer) => /^[a-zA-ZçÇğĞıİöÖşŞüÜ\s'-]{2,}$/.test(answer.trim()) },
];

const BAD_WORDS = [
  'abaza', 'abazan', 'ag', 'ağzına sıçayım', 'ahmak', 'allah', 'allahsız', 'am', 'amarım', 'ambiti', 'am biti', 'amcığı', 'amcığın', 'amcığını', 'amcığınızı', 'amcık', 'amcık hoşafı', 'amcıklama', 'amcıklandı', 'amcik', 'amck', 'amckl', 'amcklama', 'amcklaryla', 'amckta', 'amcktan', 'amcuk', 'amık', 'amına', 'amınako', 'amına koy', 'amına koyarım', 'amına koyayım', 'amınakoyim', 'amına koyyim', 'amına s', 'amına sikem', 'amına sokam', 'amın feryadı', 'amını', 'amını s', 'amın oglu', 'amınoğlu', 'amın oğlu', 'amısına', 'amısını', 'amina', 'amina g', 'amina k', 'aminako', 'aminakoyarim', 'amina koyarim', 'amina koyayım', 'amina koyayim', 'aminakoyim', 'aminda', 'amindan', 'amindayken', 'amini', 'aminiyarraaniskiim', 'aminoglu', 'amin oglu', 'amiyum', 'amk', 'amkafa', 'amk çocuğu', 'amlarnzn', 'amlı', 'amm', 'ammak', 'ammna', 'amn', 'amna', 'amnda', 'amndaki', 'amngtn', 'amnn', 'amona', 'amq', 'amsız', 'amsiz', 'amsz', 'amteri', 'amugaa', 'amuğa', 'amuna', 'ana', 'anaaann', 'anal', 'analarn', 'anam', 'anamla', 'anan', 'anana', 'anandan', 'ananı', 'ananı ', 'ananın', 'ananın am', 'ananın amı', 'ananın dölü', 'ananınki', 'ananısikerim', 'ananı sikerim', 'ananısikeyim', 'ananı sikeyim', 'ananızın', 'ananızın am', 'anani', 'ananin', 'ananisikerim', 'anani sikerim', 'ananisikeyim', 'anani sikeyim', 'anann', 'ananz', 'anas', 'anasını', 'anasının am', 'anası orospu', 'anasi', 'anasinin', 'anay', 'anayin', 'angut', 'anneni', 'annenin', 'annesiz', 'anuna', 'aptal', 'aq', 'a.q', 'a.q.', 'aq.', 'ass', 'atkafası', 'atmık', 'attırdığım', 'attrrm', 'auzlu', 'avrat', 'ayklarmalrmsikerim', 'azdım', 'azdır', 'azdırıcı', 'babaannesi kaşar', 'babanı', 'babanın', 'babani', 'babası pezevenk', 'bacağına sıçayım', 'bacına', 'bacını', 'bacının', 'bacini', 'bacn', 'bacndan', 'bacy', 'bastard', 'basur', 'beyinsiz', 'bızır', 'bitch', 'biting', 'bok', 'boka', 'bokbok', 'bokça', 'bokhu', 'bokkkumu', 'boklar', 'boktan', 'boku', 'bokubokuna', 'bokum', 'bombok', 'boner', 'bosalmak', 'boşalmak', 'cenabet', 'cibiliyetsiz', 'cibilliyetini', 'cibilliyetsiz', 'cif', 'cikar', 'cim', 'çük', 'dalaksız', 'dallama', 'daltassak', 'dalyarak', 'dalyarrak', 'dangalak', 'dassagi', 'diktim', 'dildo', 'dingil', 'dingilini', 'dinsiz', 'dkerim', 'domal', 'domalan', 'domaldı', 'domaldın', 'domalık', 'domalıyor', 'domalmak', 'domalmış', 'domalsın', 'domalt', 'domaltarak', 'domaltıp', 'domaltır', 'domaltırım', 'domaltip', 'domaltmak', 'dölü', 'dönek', 'düdük', 'eben', 'ebeni', 'ebenin', 'ebeninki', 'ebleh', 'ecdadını', 'ecdadini', 'embesil', 'emi', 'fahise', 'fahişe', 'feriştah', 'ferre', 'fuck', 'fucker', 'fuckin', 'fucking', 'gavad', 'gavat', 'geber', 'geberik', 'gebermek', 'gebermiş', 'gebertir', 'gerızekalı', 'gerizekalı', 'gerizekali', 'gerzek', 'giberim', 'giberler', 'gibis', 'gibiş', 'gibmek', 'gibtiler', 'goddamn', 'godoş', 'godumun', 'gotelek', 'gotlalesi', 'gotlu', 'gotten', 'gotundeki', 'gotunden', 'gotune', 'gotunu', 'gotveren', 'goyiim', 'goyum', 'goyuyim', 'goyyim', 'göt', 'göt deliği', 'götelek', 'göt herif', 'götlalesi', 'götlek', 'götoğlanı', 'göt oğlanı', 'götoş', 'götten', 'götü', 'götün', 'götüne', 'götünekoyim', 'götüne koyim', 'götünü', 'götveren', 'göt veren', 'göt verir', 'gtelek', 'gtn', 'gtnde', 'gtnden', 'gtne', 'gtten', 'gtveren', 'hasiktir', 'hassikome', 'hassiktir', 'has siktir', 'hassittir', 'haysiyetsiz', 'hayvan herif', 'hoşafı', 'hödük', 'hsktr', 'huur', 'ıbnelık', 'ibina', 'ibine', 'ibinenin', 'ibne', 'ibnedir', 'ibneleri', 'ibnelik', 'ibnelri', 'ibneni', 'ibnenin', 'ibnerator', 'ibnesi', 'idiot', 'idiyot', 'imansz', 'ipne', 'iserim', 'işerim', 'itoğlu it', 'kafam girsin', 'kafasız', 'kafasiz', 'kahpe', 'kahpenin', 'kahpenin feryadı', 'kaka', 'kaltak', 'kancık', 'kancik', 'kappe', 'karhane', 'kaşar', 'kavat', 'kavatn', 'kaypak', 'kayyum', 'kerane', 'kerhane', 'kerhanelerde', 'kevase', 'kevaşe', 'kevvase', 'koca göt', 'koduğmun', 'koduğmunun', 'kodumun', 'kodumunun', 'koduumun', 'koyarm', 'koyayım', 'koyiim', 'koyiiym', 'koyim', 'koyum', 'koyyim', 'krar', 'kukudaym', 'laciye boyadım', 'lavuk', 'liboş', 'madafaka', 'mal', 'malafat', 'malak', 'manyak', 'mcik', 'meme', 'memelerini', 'mezveleli', 'minaamcık', 'mincikliyim', 'mna', 'monakkoluyum', 'motherfucker', 'mudik', 'oc', 'ocuu', 'ocuun', 'OÇ', 'oç', 'o. çocuğu', 'oğlan', 'oğlancı', 'oğlu it', 'orosbucocuu', 'orospu', 'orospucocugu', 'orospu cocugu', 'orospu çoc', 'orospuçocuğu', 'orospu çocuğu', 'orospu çocuğudur', 'orospu çocukları', 'orospudur', 'orospular', 'orospunun', 'orospunun evladı', 'orospuydu', 'orospuyuz', 'orostoban', 'orostopol', 'orrospu', 'oruspu', 'oruspuçocuğu', 'oruspu çocuğu', 'osbir', 'ossurduum', 'ossurmak', 'ossuruk', 'osur', 'osurduu', 'osuruk', 'osururum', 'otuzbir', 'öküz', 'öşex', 'patlak zar', 'penis', 'pezevek', 'pezeven', 'pezeveng', 'pezevengi', 'pezevengin evladı', 'pezevenk', 'pezo', 'pic', 'pici', 'picler', 'piç', 'piçin oğlu', 'piç kurusu', 'piçler', 'pipi', 'pipiş', 'pisliktir', 'porno', 'pussy', 'puşt', 'puşttur', 'rahminde', 'revizyonist', 's1kerim', 's1kerm', 's1krm', 'sakso', 'saksofon', 'salaak', 'salak', 'saxo', 'sekis', 'serefsiz', 'sevgi koyarım', 'sevişelim', 'sexs', 'sıçarım', 'sıçtığım', 'sıecem', 'sicarsin', 'sie', 'sik', 'sikdi', 'sikdiğim', 'sike', 'sikecem', 'sikem', 'siken', 'sikenin', 'siker', 'sikerim', 'sikerler', 'sikersin', 'sikertir', 'sikertmek', 'sikesen', 'sikesicenin', 'sikey', 'sikeydim', 'sikeyim', 'sikeym', 'siki', 'sikicem', 'sikici', 'sikien', 'sikienler', 'sikiiim', 'sikiiimmm', 'sikiim', 'sikiir', 'sikiirken', 'sikik', 'sikil', 'sikildiini', 'sikilesice', 'sikilmi', 'sikilmie', 'sikilmis', 'sikilmiş', 'sikilsin', 'sikim', 'sikimde', 'sikimden', 'sikime', 'sikimi', 'sikimiin', 'sikimin', 'sikimle', 'sikimsonik', 'sikimtrak', 'sikin', 'sikinde', 'sikinden', 'sikine', 'sikini', 'sikip', 'sikis', 'sikisek', 'sikisen', 'sikish', 'sikismis', 'sikiş', 'sikişen', 'sikişme', 'sikitiin', 'sikiyim', 'sikiym', 'sikiyorum', 'sikkim', 'sikko', 'sikleri', 'sikleriii', 'sikli', 'sikm', 'sikmek', 'sikmem', 'sikmiler', 'sikmisligim', 'siksem', 'sikseydin', 'sikseyidin', 'siksin', 'siksinbaya', 'siksinler', 'siksiz', 'siksok', 'siksz', 'sikt', 'sikti', 'siktigimin', 'siktigiminin', 'siktiğim', 'siktiğimin', 'siktiğiminin', 'siktii', 'siktiim', 'siktiimin', 'siktiiminin', 'siktiler', 'siktim', 'siktim ', 'siktimin', 'siktiminin', 'siktir', 'siktir et', 'siktirgit', 'siktir git', 'siktirir', 'siktiririm', 'siktiriyor', 'siktir lan', 'siktirolgit', 'siktir ol git', 'sittimin', 'sittir', 'skcem', 'skecem', 'skem', 'sker', 'skerim', 'skerm', 'skeyim', 'skiim', 'skik', 'skim', 'skime', 'skmek', 'sksin', 'sksn', 'sksz', 'sktiimin', 'sktrr', 'skyim', 'slaleni', 'sokam', 'sokarım', 'sokarim', 'sokarm', 'sokarmkoduumun', 'sokayım', 'sokaym', 'sokiim', 'soktuğumunun', 'sokuk', 'sokum', 'sokuş', 'sokuyum', 'soxum', 'sulaleni', 'sülaleni', 'sülalenizi', 'sürtük', 'şerefsiz', 'şıllık', 'taaklarn', 'taaklarna', 'tarrakimin', 'tasak', 'tassak', 'taşak', 'taşşak', 'tipini s.k', 'tipinizi s.keyim', 'tiyniyat', 'toplarm', 'topsun', 'totoş', 'vajina', 'vajinanı', 'veled', 'veledizina', 'veled i zina', 'verdiimin', 'weled', 'weledizina', 'whore', 'xikeyim', 'yaaraaa', 'yalama', 'yalarım', 'yalarun', 'yaraaam', 'yarak', 'yaraksız', 'yaraktr', 'yaram', 'yaraminbasi', 'yaramn', 'yararmorospunun', 'yarra', 'yarraaaa', 'yarraak', 'yarraam', 'yarraamı', 'yarragi', 'yarragimi', 'yarragina', 'yarragindan', 'yarragm', 'yarrağ', 'yarrağım', 'yarrağımı', 'yarraimin', 'yarrak', 'yarram', 'yarramin', 'yarraminbaşı', 'yarramn', 'yarran', 'yarrana', 'yarrrak', 'yavak', 'yavş', 'yavşak', 'yavşaktır', 'yavuşak', 'yılışık', 'yilisik', 'yogurtlayam', 'yoğurtlayam', 'yrrak', 'zıkkımım', 'zibidi', 'zigsin', 'zikeyim', 'zikiiim', 'zikiim', 'zikik', 'zikim', 'ziksiiin', 'ziksiin', 'zulliyetini', 'zviyetini'
];

const RATE_LIMIT_MAX = 10; // 1 dakika içinde en fazla 10 mesaj
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 dakika
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 saat
const userStates = {};

// WhatsApp Cloud API ayarları
env = process.env;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_API_URL = `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

const app = express();
app.use(bodyParser.json({ limit: '20mb' }));

// Webhook endpointi
app.post('/webhook', async (req, res) => {
  try {
    const entry = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!entry) return res.sendStatus(200);
    const chatId = entry.from;
    const now = Date.now();
    const userMessage = entry.text?.body || '';
    const msgType = entry.type;
    // State başlat
    if (!userStates[chatId]) {
      userStates[chatId] = {
        step: 0,
        answers: {},
        startedAt: now,
        rateLimit: [],
        photos: [],
      };
      await sendWhatsappMessage(chatId, FORM_QUESTIONS[0].question);
      return res.sendStatus(200);
    }
    const state = userStates[chatId];
    // 1. 24 saatlik oturum kontrolü
    if (now - state.startedAt > SESSION_TIMEOUT) {
      await sendWhatsappMessage(chatId, 'Oturumunuz sona erdi. Yeni bir sohbet başlatmak için lütfen tekrar yazın.');
      delete userStates[chatId];
      return res.sendStatus(200);
    }
    // 2. Rate limiting kontrolü
    state.rateLimit = state.rateLimit.filter(ts => now - ts < RATE_LIMIT_WINDOW);
    if (state.rateLimit.length >= RATE_LIMIT_MAX) {
      await sendWhatsappMessage(chatId, 'Çok sık mesaj attınız, lütfen biraz bekleyin.');
      return res.sendStatus(200);
    }
    state.rateLimit.push(now);
    // 3. Küfür/uygunsuz dil kontrolü
    const lowerMsg = userMessage.toLowerCase();
    if (BAD_WORDS.some(word => lowerMsg.includes(word))) {
      await sendWhatsappMessage(chatId, 'Uygunsuz bir dil kullandınız. Sohbet sonlandırıldı.');
      delete userStates[chatId];
      return res.sendStatus(200);
    }
    // 4. Fotoğraf mesajı kontrolü
    if (msgType === 'image') {
      const mediaId = entry.image.id;
      const mediaUrl = await getMediaUrl(mediaId);
      const base64Image = await downloadMediaAsBase64(mediaUrl);
      state.photos.push(base64Image);
      await sendWhatsappMessage(chatId, `Fotoğraf kaydedildi. Şu ana kadar ${state.photos.length} fotoğrafınız var. Lütfen ${2 - state.photos.length} fotoğraf daha gönderin.`);
      if (state.photos.length >= 2 && state.step >= FORM_QUESTIONS.length) {
        await handleFormAndPhotos(chatId, state);
      }
      return res.sendStatus(200);
    }
    // 5. Form akışı ve Gemini ile cevap analizi
    const currentStep = state.step;
    if (currentStep < FORM_QUESTIONS.length) {
      const currentQuestion = FORM_QUESTIONS[currentStep];
      const geminiPrompt = `Soru: ${currentQuestion.question}\nCevap: ${userMessage}\n\nBu cevap bu soruya uygun mu? Eğer uygunsa sadece 'Uygun' yaz. Eğer uygun değilse, kullanıcıya doğal Türkçe ile neden uygun olmadığını ve tekrar nasıl cevap vermesi gerektiğini açıklayan kısa bir mesaj yaz.`;
      let geminiResult = '';
      try {
        geminiResult = await geminiService.simpleValidate(geminiPrompt);
      } catch (e) {
        geminiResult = 'Uygun';
      }
      if (geminiResult.trim().toLowerCase().startsWith('uygun')) {
        state.answers[currentQuestion.key] = userMessage;
        state.step++;
        if (state.step < FORM_QUESTIONS.length) {
          await sendWhatsappMessage(chatId, FORM_QUESTIONS[state.step].question);
        } else {
          await sendWhatsappMessage(chatId, 'Teşekkürler! Tüm bilgileri aldım. Şimdi iki fotoğrafınızı gönderin.');
          if (state.photos.length >= 2) {
            await handleFormAndPhotos(chatId, state);
          }
        }
      } else {
        await sendWhatsappMessage(chatId, geminiResult);
      }
      return res.sendStatus(200);
    }
  } catch (e) {
    console.error(e);
    return res.sendStatus(200);
          }
});

// Form ve fotoğraflar tamamlanınca Firestore'a kaydet, video üret ve gönder
async function handleFormAndPhotos(chatId, state) {
  try {
    await db.collection('forms').add({
      chatId,
      ...state.answers,
      photos: state.photos,
      createdAt: Date.now(),
    });
    await sendWhatsappMessage(chatId, 'Bilgileriniz kaydedildi. Video hazırlanıyor, lütfen bekleyin...');
    const videoPath = await generateVeo2Video(
      `${state.answers.name} ${state.answers.surname} (${state.answers.city}) için özel video.`,
      state.photos.slice(0, 2)
    );
    const videoData = fs.readFileSync(videoPath, { encoding: 'base64' });
    await sendWhatsappMedia(chatId, videoData, 'video/mp4', path.basename(videoPath));
    await sendWhatsappMessage(chatId, 'Videonuz hazır!');
    delete userStates[chatId];
  } catch (e) {
    await sendWhatsappMessage(chatId, 'Bir hata oluştu, lütfen tekrar deneyin.');
    delete userStates[chatId];
    }
  }

// WhatsApp Cloud API'ye metin mesajı gönder
async function sendWhatsappMessage(to, text) {
  await axios.post(WHATSAPP_API_URL, {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text }
  }, {
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
  });
}

// WhatsApp Cloud API'ye medya gönder
async function sendWhatsappMedia(to, base64Data, mimeType, filename) {
  // 1. Medyayı yükle
  const mediaRes = await axios.post(
    `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/media`,
    {
      messaging_product: 'whatsapp',
      file: base64Data,
      type: mimeType,
      filename: filename,
        },
        {
          headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );
  const mediaId = mediaRes.data.id;
  // 2. Medya mesajı gönder
  await axios.post(WHATSAPP_API_URL, {
    messaging_product: 'whatsapp',
    to,
    type: 'video',
    video: {
      id: mediaId,
      caption: 'AI ile oluşturulan videonuz',
    },
  }, {
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
  });
}

// WhatsApp Cloud API'den medya URL'si al
async function getMediaUrl(mediaId) {
  const res = await axios.get(
    `https://graph.facebook.com/v19.0/${mediaId}`,
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }, params: { fields: 'url' } }
  );
  return res.data.url;
}

// Medyayı indirip base64'e çevir
async function downloadMediaAsBase64(url) {
  const res = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(res.data, 'binary').toString('base64');
}

// Sunucuyu başlat
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`WhatsApp Cloud API botu ${PORT} portunda çalışıyor.`);
}); 