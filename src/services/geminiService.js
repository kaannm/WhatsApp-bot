const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config');
const logger = require('../utils/logger');

// Gemini AI başlatma
const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

const geminiService = {
  // Prompt'u AI için optimize et
  optimizePrompt: async (userMessage) => {
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-pro" });

      const prompt = `
        Aşağıdaki Türkçe kullanıcı mesajını, AI video üretimi için optimize edilmiş İngilizce prompt'a çevir.
        
        Kullanıcı mesajı: "${userMessage}"
        
        Kurallar:
        1. İki arkadaşın olduğu bir sahne oluştur
        2. 30 saniyelik video için optimize et
        3. Sinematik kalite için detaylar ekle
        4. Yumuşak kamera hareketi belirt
        5. Atmosfer ve duygu ekle
        6. Sadece İngilizce prompt döndür, açıklama ekleme
        
        Örnek format:
        "Two friends [aktivite] in [mekan], [atmosfer], [zaman], [detaylar], cinematic quality, smooth camera movement, 30 seconds duration"
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const optimizedPrompt = response.text().trim();

      logger.info('Prompt optimize edildi', {
        original: userMessage,
        optimized: optimizedPrompt
      });

      return optimizedPrompt;

    } catch (error) {
      logger.error('Prompt optimizasyon hatası', { error: error.message });
      
      // Fallback: Basit çeviri
      return `Two friends in a beautiful scene, ${userMessage}, cinematic quality, smooth camera movement, 30 seconds duration`;
    }
  },

  // Video üretim prompt'u oluştur
  generateVideoPrompt: async (userMessage, image1, image2) => {
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });

      const prompt = `
        Bu iki fotoğrafı kullanarak, kullanıcının istediği videoyu oluşturmak için detaylı bir prompt yaz.
        
        Kullanıcı isteği: "${userMessage}"
        
        Kurallar:
        1. İki kişiyi fotoğraflardaki gibi kullan
        2. Kullanıcının istediği sahneyi oluştur
        3. 30 saniyelik video için optimize et
        4. Sinematik kalite için detaylar ekle
        5. Yumuşak geçişler ve kamera hareketi belirt
        6. Atmosfer ve duygu ekle
        7. Sadece İngilizce prompt döndür
        
        Örnek format:
        "Two friends from the photos [aktivite] in [mekan], [atmosfer], [zaman], [detaylar], cinematic quality, smooth camera movement, 30 seconds duration"
      `;

      // Fotoğrafları base64'ten buffer'a çevir
      const image1Buffer = Buffer.from(image1, 'base64');
      const image2Buffer = Buffer.from(image2, 'base64');

      const imageParts = [
        {
          inlineData: {
            data: image1,
            mimeType: "image/jpeg"
          }
        },
        {
          inlineData: {
            data: image2,
            mimeType: "image/jpeg"
          }
        }
      ];

      const result = await model.generateContent([prompt, ...imageParts]);
      const response = await result.response;
      const videoPrompt = response.text().trim();

      logger.info('Video prompt oluşturuldu', {
        userMessage,
        videoPrompt
      });

      return videoPrompt;

    } catch (error) {
      logger.error('Video prompt oluşturma hatası', { error: error.message });
      
      // Fallback: Basit prompt
      return `Two friends from the photos in a beautiful scene, ${userMessage}, cinematic quality, smooth camera movement, 30 seconds duration`;
    }
  },

  // Kullanıcı mesajını analiz et
  analyzeUserMessage: async (message) => {
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-pro" });

      const prompt = `
        Bu Türkçe mesajı analiz et ve JSON formatında döndür:
        
        Mesaj: "${message}"
        
        Analiz et:
        1. Tema (tatil, macera, şehir, romantik, aksiyon, fantastik, iş)
        2. Zaman (gün, gece, güneş batımı, güneş doğumu)
        3. Atmosfer (romantik, macera, huzur, enerji)
        4. Aktivite (yürüme, dans, koşma, oturma, gülme, konuşma, oyun, spor, yemek, içme)
        5. Mekan (sahil, dağ, şehir, ofis, ev, orman, uzay)
        
        Sadece JSON döndür:
        {
          "theme": "tema",
          "timeOfDay": "zaman",
          "atmosphere": "atmosfer", 
          "activity": "aktivite",
          "location": "mekan"
        }
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const analysis = JSON.parse(response.text().trim());

      logger.info('Mesaj analiz edildi', {
        original: message,
        analysis
      });

      return analysis;

    } catch (error) {
      logger.error('Mesaj analiz hatası', { error: error.message });
      
      // Fallback: Basit analiz
      return {
        theme: 'general',
        timeOfDay: null,
        atmosphere: null,
        activity: null,
        location: null
      };
    }
  },

  // Video kalitesini değerlendir
  evaluateVideoQuality: async (videoUrl) => {
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-pro" });

      const prompt = `
        Bu video URL'sini değerlendir ve kalite skorunu ver (1-10):
        
        Video: ${videoUrl}
        
        Değerlendirme kriterleri:
        1. Görsel kalite
        2. Akıcılık
        3. Kullanıcı isteğine uygunluk
        4. Sinematik kalite
        
        Sadece skor döndür (1-10 arası sayı).
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const score = parseInt(response.text().trim());

      logger.info('Video kalitesi değerlendirildi', {
        videoUrl,
        score
      });

      return score;

    } catch (error) {
      logger.error('Video kalite değerlendirme hatası', { error: error.message });
      return 7; // Varsayılan skor
    }
  }
};

module.exports = geminiService; 