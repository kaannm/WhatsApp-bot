const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

// WhatsApp Cloud API'ye mesaj gönder
const sendMessage = async (to, text) => {
  try {
    // Rate limiting için kısa bekleme
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const response = await axios.post(
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
        },
        timeout: 10000
      }
    );
    
    console.log('WhatsApp mesajı gönderildi:', { to, textLength: text.length });
    return response.data;
  } catch (error) {
    console.error('WhatsApp mesaj gönderme hatası:', error.message, { 
      to, 
      status: error.response?.status,
      data: error.response?.data 
    });
    throw error;
  }
};

// WhatsApp Cloud API'ye medya gönder
const sendMedia = async (to, mediaId, caption = '') => {
  try {
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${config.whatsapp.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'image',
        image: {
          id: mediaId,
          caption: caption
        }
      },
      {
        headers: { 
          Authorization: `Bearer ${config.whatsapp.accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    
    console.log('WhatsApp medya gönderildi:', { to, mediaId, captionLength: caption.length });
    return response.data;
  } catch (error) {
    console.error('WhatsApp medya gönderme hatası:', error.message, { 
      to, 
      mediaId,
      status: error.response?.status,
      data: error.response?.data 
    });
    throw error;
  }
};

// Medya URL'sini al
const getMediaUrl = async (mediaId) => {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/v19.0/${mediaId}`,
      {
        headers: { 
          Authorization: `Bearer ${config.whatsapp.accessToken}`
        },
        timeout: 10000
      }
    );
    
    return response.data.url;
  } catch (error) {
    console.error('Medya URL alma hatası:', error.message);
    throw error;
  }
};

// Medyayı Base64 olarak indir
const downloadMediaAsBase64 = async (mediaUrl) => {
  try {
    const response = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    });
    
    const buffer = Buffer.from(response.data, 'binary');
    return buffer.toString('base64');
  } catch (error) {
    console.error('Medya indirme hatası:', error.message);
    throw error;
  }
};

// WhatsApp Cloud API'ye template mesajı gönder (hızlı butonlar için)
const sendTemplateMessage = async (to, templateName, language = 'tr') => {
  try {
    // Rate limiting için kısa bekleme
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${config.whatsapp.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: {
            code: language
          }
        }
      },
      {
        headers: { 
          Authorization: `Bearer ${config.whatsapp.accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    
    console.log('WhatsApp template mesajı gönderildi:', { to, templateName, language });
    return response.data;
  } catch (error) {
    console.error('WhatsApp template mesajı gönderme hatası:', error.message, { 
      to, 
      status: error.response?.status,
      data: error.response?.data 
    });
    throw error;
  }
};



// WhatsApp Cloud API'ye flow mesajı gönder
const sendFlowMessage = async (to, flowToken, text = 'Kayıt formunu dolduralım! 📝') => {
  try {
    // Rate limiting için kısa bekleme
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${config.whatsapp.phoneNumberId}/messages`,
      {
    messaging_product: 'whatsapp',
    to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: {
            text: text
          },
          action: {
            buttons: [
              {
                type: 'flow',
                flow: {
                  flow_token: flowToken
                }
              }
            ]
          }
        }
      },
      {
        headers: { 
          Authorization: `Bearer ${config.whatsapp.accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    
    console.log('WhatsApp flow mesajı gönderildi:', { to, flowToken, textLength: text.length });
    return response.data;
  } catch (error) {
    console.error('WhatsApp flow mesajı gönderme hatası:', error.message, { 
      to, 
      flowToken,
      status: error.response?.status,
      data: error.response?.data 
    });
    throw error;
  }
};

// WhatsApp Cloud API'ye liste mesajı gönder (kayıt formu için)
const sendListMessage = async (to, text, sections) => {
  try {
    // Rate limiting için kısa bekleme
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${config.whatsapp.phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: {
            text: text
          },
          action: {
            button: 'Seç',
            sections: sections
          }
        }
        },
        {
          headers: {
          Authorization: `Bearer ${config.whatsapp.accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    
    console.log('WhatsApp liste mesajı gönderildi:', { to, textLength: text.length, sectionsCount: sections.length });
    return response.data;
  } catch (error) {
    console.error('WhatsApp liste mesajı gönderme hatası:', error.message, { 
      to, 
      status: error.response?.status,
      data: error.response?.data 
    });
    throw error;
  }
};

// Webhook doğrulama
const verifyWebhook = (mode, token, challenge, verifyToken) => {
  if (mode && token && mode === 'subscribe' && token === verifyToken) {
    return challenge;
  }
  return null;
};

module.exports = {
  sendMessage,
  sendMedia,
  getMediaUrl,
  downloadMediaAsBase64,
  sendTemplateMessage,
  sendFlowMessage,
  sendListMessage,
  verifyWebhook
}; 