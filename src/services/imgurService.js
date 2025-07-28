const axios = require('axios');
const config = require('../config');

class ImgurService {
  constructor() {
    this.clientId = config.imgur.clientId;
    this.baseURL = 'https://api.imgur.com/3';
  }

  async uploadImage(imageData, title = 'WhatsApp Bot Image') {
    try {
      if (!this.clientId) {
        throw new Error('Imgur Client ID bulunamadı');
      }

      // Base64 data URL'ini düzenle
      let base64Data = imageData;
      if (imageData.startsWith('data:image')) {
        base64Data = imageData.split(',')[1];
      }

      const formData = new FormData();
      formData.append('image', base64Data);
      formData.append('title', title);
      formData.append('description', 'WhatsApp Bot tarafından yüklendi');

      const response = await axios.post(`${this.baseURL}/image`, formData, {
        headers: {
          'Authorization': `Client-ID ${this.clientId}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data && response.data.success) {
        return {
          success: true,
          url: response.data.data.link,
          deleteHash: response.data.data.deletehash,
          id: response.data.data.id
        };
      } else {
        throw new Error('Imgur yükleme başarısız');
      }
    } catch (error) {
      console.error('Imgur yükleme hatası:', error.message);
      throw new Error(`Imgur yükleme hatası: ${error.message}`);
    }
  }

  async deleteImage(deleteHash) {
    try {
      if (!this.clientId) {
        throw new Error('Imgur Client ID bulunamadı');
      }

      const response = await axios.delete(`${this.baseURL}/image/${deleteHash}`, {
        headers: {
          'Authorization': `Client-ID ${this.clientId}`
        }
      });

      return response.data.success;
    } catch (error) {
      console.error('Imgur silme hatası:', error.message);
      return false;
    }
  }
}

module.exports = new ImgurService(); 