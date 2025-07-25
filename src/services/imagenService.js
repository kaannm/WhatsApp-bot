const axios = require('axios');

class ImagenService {
  constructor() {
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  async getAccessToken() {
    // Token'ın geçerliliğini kontrol et
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      // Google Cloud CLI ile token al (alternatif olarak service account key kullanılabilir)
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      const { stdout } = await execAsync('gcloud auth print-access-token');
      this.accessToken = stdout.trim();
      this.tokenExpiry = Date.now() + (3600 * 1000); // 1 saat geçerli
      
      return this.accessToken;
    } catch (error) {
      console.error('Google Cloud token alma hatası:', error);
      throw new Error('Google Cloud kimlik doğrulama hatası');
    }
  }

  async generateImage(prompt, options = {}) {
    try {
      const token = await this.getAccessToken();
      
      const requestBody = {
        instances: [
          {
            prompt: prompt
          }
        ],
        parameters: {
          sampleCount: options.sampleCount || 1,
          guidanceScale: options.guidanceScale || 'medium',
          aspectRatio: options.aspectRatio || '1:1'
        }
      };

      // Negative prompt varsa ekle
      if (options.negativePrompt) {
        requestBody.parameters.negativePrompt = options.negativePrompt;
      }

      const response = await axios.post(
        `https://us-central1-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/us-central1/publishers/google/models/imagegeneration@006:predict`,
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.predictions.map(prediction => ({
        imageData: prediction.bytesBase64Encoded,
        mimeType: prediction.mimeType
      }));

    } catch (error) {
      console.error('Imagen 2 resim oluşturma hatası:', error.response?.data || error.message);
      throw new Error('Resim oluşturulamadı');
    }
  }

  async editImage(imageData, prompt, options = {}) {
    try {
      const token = await this.getAccessToken();
      
      const requestBody = {
        instances: [
          {
            prompt: prompt,
            image: {
              bytesBase64Encoded: imageData
            }
          }
        ],
        parameters: {
          sampleCount: options.sampleCount || 1,
          editMode: options.editMode || 'product-image',
          guidanceScale: options.guidanceScale || 60
        }
      };

      // Mask varsa ekle
      if (options.mask) {
        requestBody.instances[0].mask = {
          bytesBase64Encoded: options.mask
        };
      }

      const response = await axios.post(
        `https://us-central1-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/us-central1/publishers/google/models/imagegeneration@006:predict`,
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.predictions.map(prediction => ({
        imageData: prediction.bytesBase64Encoded,
        mimeType: prediction.mimeType
      }));

    } catch (error) {
      console.error('Imagen 2 resim düzenleme hatası:', error.response?.data || error.message);
      throw new Error('Resim düzenlenemedi');
    }
  }

  async inpaintImage(imageData, maskData, prompt, options = {}) {
    try {
      const token = await this.getAccessToken();
      
      const requestBody = {
        instances: [
          {
            prompt: prompt,
            image: {
              bytesBase64Encoded: imageData
            },
            mask: {
              bytesBase64Encoded: maskData
            }
          }
        ],
        parameters: {
          sampleCount: options.sampleCount || 1,
          editMode: options.editMode || 'inpainting-insert',
          guidanceScale: options.guidanceScale || 60
        }
      };

      const response = await axios.post(
        `https://us-central1-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/us-central1/publishers/google/models/imagegeneration@006:predict`,
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.predictions.map(prediction => ({
        imageData: prediction.bytesBase64Encoded,
        mimeType: prediction.mimeType
      }));

    } catch (error) {
      console.error('Imagen 2 inpainting hatası:', error.response?.data || error.message);
      throw new Error('Inpainting işlemi başarısız');
    }
  }

  async removeBackground(imageData) {
    try {
      const token = await this.getAccessToken();
      
      const requestBody = {
        instances: [
          {
            image: {
              bytesBase64Encoded: imageData
            }
          }
        ],
        parameters: {
          sampleCount: 1,
          editMode: 'inpainting-remove',
          maskType: 'background'
        }
      };

      const response = await axios.post(
        `https://us-central1-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/us-central1/publishers/google/models/imagegeneration@006:predict`,
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.predictions[0];

    } catch (error) {
      console.error('Imagen 2 arka plan kaldırma hatası:', error.response?.data || error.message);
      throw new Error('Arka plan kaldırılamadı');
    }
  }

  // Base64 resmi WhatsApp'a göndermek için hazırla
  async sendImageToWhatsApp(phoneNumber, imageData, caption = '') {
    try {
      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phoneNumber,
          type: 'image',
          image: {
            link: `data:image/png;base64,${imageData}`,
            caption: caption
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('WhatsApp resim gönderme hatası:', error.response?.data || error.message);
      throw new Error('Resim gönderilemedi');
    }
  }
}

module.exports = new ImagenService(); 