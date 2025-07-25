const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

// WhatsApp Cloud API yardımcı fonksiyonları
const whatsappService = {
  // WhatsApp Cloud API'ye metin mesajı gönder
  sendMessage: async (to, text) => {
    try {
      await axios.post(
        `https://graph.facebook.com/v19.0/${config.whatsapp.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: text }
        },
        {
          headers: { 
            Authorization: `Bearer ${config.whatsapp.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      logger.info('WhatsApp mesajı gönderildi', { to, textLength: text.length });
    } catch (error) {
      logger.error('WhatsApp mesaj gönderme hatası', { error: error.message, to });
      throw error;
    }
  },

  // WhatsApp Cloud API'ye medya gönder
  sendMedia: async (to, base64Data, mimeType, filename, caption = '') => {
    try {
      // 1. Medyayı yükle
      const mediaRes = await axios.post(
        `https://graph.facebook.com/v19.0/${config.whatsapp.phoneNumberId}/media`,
        {
          messaging_product: 'whatsapp',
          file: base64Data,
          type: mimeType,
          filename: filename,
        },
        {
          headers: {
            Authorization: `Bearer ${config.whatsapp.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      const mediaId = mediaRes.data.id;
      
      // 2. Medya mesajı gönder
      await axios.post(
        `https://graph.facebook.com/v19.0/${config.whatsapp.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to,
          type: mimeType.startsWith('video/') ? 'video' : 'image',
          [mimeType.startsWith('video/') ? 'video' : 'image']: {
            id: mediaId,
            caption: caption,
          },
        },
        {
          headers: { Authorization: `Bearer ${config.whatsapp.accessToken}` }
        }
      );
      
      logger.info('WhatsApp medyası gönderildi', { to, mimeType, filename });
    } catch (error) {
      logger.error('WhatsApp medya gönderme hatası', { error: error.message, to, mimeType });
      throw error;
    }
  },

  // WhatsApp Cloud API'den medya URL'si al
  getMediaUrl: async (mediaId) => {
    try {
      const res = await axios.get(
        `https://graph.facebook.com/v19.0/${mediaId}`,
        { 
          headers: { Authorization: `Bearer ${config.whatsapp.accessToken}` }, 
          params: { fields: 'url' } 
        }
      );
      return res.data.url;
    } catch (error) {
      logger.error('Medya URL alma hatası', { error: error.message, mediaId });
      throw error;
    }
  },

  // Medyayı indirip base64'e çevir
  downloadMediaAsBase64: async (url) => {
    try {
      const res = await axios.get(url, { responseType: 'arraybuffer' });
      return Buffer.from(res.data, 'binary').toString('base64');
    } catch (error) {
      logger.error('Medya indirme hatası', { error: error.message, url });
      throw error;
    }
  },

  // Webhook doğrulama
  verifyWebhook: (mode, token, challenge, verifyToken) => {
    if (mode && token && mode === 'subscribe' && token === verifyToken) {
      return challenge;
    }
    return null;
  }
};

module.exports = whatsappService; 