const axios = require('axios');
const FormData = require('form-data');
const config = require('../config');
const { logger, logError } = require('../utils/logger');

class WhatsAppService {
  constructor() {
    this.apiUrl = config.whatsapp.apiUrl;
    this.phoneNumberId = config.whatsapp.phoneNumberId;
    this.accessToken = config.whatsapp.accessToken;
  }

  // Metin mesajı gönder
  async sendTextMessage(to, message) {
    try {
      const response = await axios.post(
        `${this.apiUrl}/messages`,
        {
          to: to,
          type: 'text',
          text: {
            body: message
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('Metin mesajı gönderildi', { to, messageLength: message.length });
      return response.data;
    } catch (error) {
      logError(error, { context: 'sendTextMessage', to, message });
      throw new Error('Mesaj gönderilemedi');
    }
  }

  // Medya dosyası yükle
  async uploadMedia(fileBuffer, mimeType) {
    try {
      const formData = new FormData();
      formData.append('file', fileBuffer, {
        filename: 'image.jpg',
        contentType: mimeType
      });

      const response = await axios.post(
        `${this.apiUrl}/${this.phoneNumberId}/media`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            ...formData.getHeaders()
          }
        }
      );

      logger.info('Medya yüklendi', { mediaId: response.data.id });
      return response.data.id;
    } catch (error) {
      logError(error, { context: 'uploadMedia', mimeType });
      throw new Error('Medya yüklenemedi');
    }
  }

  // Resim mesajı gönder
  async sendImageMessage(to, imageBuffer, caption = '') {
    try {
      // Önce medyayı yükle
      const mediaId = await this.uploadMedia(imageBuffer, 'image/jpeg');

      // Sonra mesajı gönder
      const response = await axios.post(
        `${this.apiUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: to,
          type: 'image',
          image: {
            id: mediaId,
            caption: caption
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('Resim mesajı gönderildi', { to, mediaId, caption });
      return response.data;
    } catch (error) {
      logError(error, { context: 'sendImageMessage', to });
      throw new Error('Resim mesajı gönderilemedi');
    }
  }

  // Dokunmatik mesaj gönder (butonlar)
  async sendInteractiveMessage(to, message, buttons) {
    try {
      const response = await axios.post(
        `${this.apiUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: to,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: {
              text: message
            },
            action: {
              buttons: buttons.map((button, index) => ({
                type: 'reply',
                reply: {
                  id: `btn_${index}`,
                  title: button
                }
              }))
            }
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('İnteraktif mesaj gönderildi', { to, buttons });
      return response.data;
    } catch (error) {
      logError(error, { context: 'sendInteractiveMessage', to });
      throw new Error('İnteraktif mesaj gönderilemedi');
    }
  }

  // Hızlı yanıt mesajı gönder
  async sendQuickReplyMessage(to, message, quickReplies) {
    try {
      const response = await axios.post(
        `${this.apiUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: to,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: {
              text: message
            },
            action: {
              buttons: quickReplies.map((reply, index) => ({
                type: 'reply',
                reply: {
                  id: `qr_${index}`,
                  title: reply
                }
              }))
            }
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('Hızlı yanıt mesajı gönderildi', { to, quickReplies });
      return response.data;
    } catch (error) {
      logError(error, { context: 'sendQuickReplyMessage', to });
      throw new Error('Hızlı yanıt mesajı gönderilemedi');
    }
  }

  // Mesaj durumunu kontrol et
  async getMessageStatus(messageId) {
    try {
      const response = await axios.get(
        `${this.apiUrl}/${this.phoneNumberId}/messages/${messageId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      return response.data;
    } catch (error) {
      logError(error, { context: 'getMessageStatus', messageId });
      throw new Error('Mesaj durumu alınamadı');
    }
  }
}

module.exports = new WhatsAppService(); 