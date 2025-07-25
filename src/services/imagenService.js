const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');
const config = require('../config');

// Google Cloud authentication
const auth = new GoogleAuth({
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

// Access token al
async function getAccessToken() {
  try {
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    return token.token;
  } catch (error) {
    console.error('Google Cloud token alma hatası:', error.message);
    throw error;
  }
}

// Imagen 2 ile resim oluştur
async function generateImage(prompt, options = {}) {
  try {
    const accessToken = await getAccessToken();
    
    const response = await axios.post(
      'https://us-central1-aiplatform.googleapis.com/v1/projects/your-project-id/locations/us-central1/publishers/google/models/imagen-2.0:predict',
      {
        instances: [{
          prompt: prompt,
          aspectRatio: options.aspectRatio || '1:1',
          guidanceScale: options.guidanceScale || 'high',
          sampleCount: options.sampleCount || 1
        }]
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );
    
    console.log('Imagen 2 resim oluşturuldu:', { promptLength: prompt.length, options });
    
    // Base64 resimleri döndür
    return response.data.predictions.map(prediction => ({
      imageData: prediction.bytesBase64Encoded
    }));
    
  } catch (error) {
    console.error('Imagen 2 resim oluşturma hatası:', error.message);
    throw error;
  }
}

// Resmi düzenle
async function editImage(base64Image, prompt, options = {}) {
  try {
    const accessToken = await getAccessToken();
    
    const response = await axios.post(
      'https://us-central1-aiplatform.googleapis.com/v1/projects/your-project-id/locations/us-central1/publishers/google/models/imagen-2.0:edit',
      {
        instances: [{
          image: {
            bytesBase64Encoded: base64Image
          },
          prompt: prompt,
          aspectRatio: options.aspectRatio || '1:1',
          guidanceScale: options.guidanceScale || 'high'
        }]
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );
    
    console.log('Imagen 2 resim düzenlendi:', { promptLength: prompt.length, options });
    
    return response.data.predictions.map(prediction => ({
      imageData: prediction.bytesBase64Encoded
    }));
    
  } catch (error) {
    console.error('Imagen 2 resim düzenleme hatası:', error.message);
    throw error;
  }
}

// Resmi WhatsApp'a gönder
async function sendImageToWhatsApp(phoneNumber, base64Image, caption = '') {
  try {
    // 1. Resmi WhatsApp'a yükle
    const uploadResponse = await axios.post(
      `https://graph.facebook.com/v19.0/${config.whatsapp.phoneNumberId}/media`,
      {
        messaging_product: 'whatsapp',
        file: base64Image,
        type: 'image/jpeg',
        filename: 'generated_image.jpg'
      },
      {
        headers: {
          Authorization: `Bearer ${config.whatsapp.accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );
    
    const mediaId = uploadResponse.data.id;
    
    // 2. Resmi WhatsApp'a gönder
    await axios.post(
      `https://graph.facebook.com/v19.0/${config.whatsapp.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: phoneNumber,
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
    
    console.log('Resim WhatsApp\'a gönderildi:', { phoneNumber, captionLength: caption.length });
    
  } catch (error) {
    console.error('WhatsApp resim gönderme hatası:', error.message);
    throw error;
  }
}

module.exports = {
  generateImage,
  editImage,
  sendImageToWhatsApp
}; 