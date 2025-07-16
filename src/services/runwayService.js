const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { logger, logError } = require('../utils/logger');

class RunwayService {
  constructor() {
    this.apiUrl = 'https://api.runwayml.com/v1';
    this.apiKey = config.runway.apiKey;
  }

  // Fotoğrafı geçici olarak kaydet
  async saveTempImage(base64Data, filename) {
    try {
      const buffer = Buffer.from(base64Data, 'base64');
      const tempDir = path.join(__dirname, '../../temp');
      
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const filePath = path.join(tempDir, filename);
      fs.writeFileSync(filePath, buffer);
      
      return filePath;
    } catch (error) {
      logError(error, { context: 'saveTempImage' });
      throw new Error('Fotoğraf kaydedilemedi');
    }
  }

  // Runway API'ye fotoğraf yükle
  async uploadImage(imagePath) {
    try {
      const formData = new FormData();
      formData.append('file', fs.createReadStream(imagePath));
      
      const response = await axios.post(`${this.apiUrl}/files`, formData, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          ...formData.getHeaders()
        }
      });
      
      return response.data.id;
    } catch (error) {
      logError(error, { context: 'uploadImage', imagePath });
      throw new Error('Fotoğraf yüklenemedi');
    }
  }

  // AI görsel oluştur
  async generateImage(userImageId, friendImageId, prompt) {
    try {
      const generationData = {
        model: 'gen-3', // Runway Gen-3 modeli
        prompt: prompt,
        input_image: userImageId,
        reference_image: friendImageId,
        width: 1024,
        height: 1024,
        num_frames: 1,
        num_steps: 50,
        guidance_scale: 7.5,
        negative_prompt: 'blurry, low quality, distorted, ugly, bad anatomy'
      };

      const response = await axios.post(`${this.apiUrl}/generations`, generationData, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      logError(error, { context: 'generateImage', prompt });
      throw new Error('AI görsel oluşturulamadı');
    }
  }

  // Oluşturulan görseli indir
  async downloadImage(generationId) {
    try {
      const response = await axios.get(`${this.apiUrl}/generations/${generationId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      if (response.data.status === 'completed') {
        const imageUrl = response.data.output.images[0];
        const imageResponse = await axios.get(imageUrl, {
          responseType: 'arraybuffer'
        });

        return Buffer.from(imageResponse.data);
      } else {
        throw new Error('Görsel henüz hazır değil');
      }
    } catch (error) {
      logError(error, { context: 'downloadImage', generationId });
      throw new Error('Görsel indirilemedi');
    }
  }

  // Geçici dosyaları temizle
  cleanupTempFiles(filePaths) {
    filePaths.forEach(filePath => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        logger.warn('Geçici dosya silinemedi', { filePath, error: error.message });
      }
    });
  }

  // Ana işlem fonksiyonu
  async processImages(userImageBase64, friendImageBase64, prompt) {
    const tempFiles = [];
    
    try {
      // Fotoğrafları geçici olarak kaydet
      const userImagePath = await this.saveTempImage(userImageBase64, `user_${Date.now()}.jpg`);
      const friendImagePath = await this.saveTempImage(friendImageBase64, `friend_${Date.now()}.jpg`);
      
      tempFiles.push(userImagePath, friendImagePath);

      // Runway'e yükle
      const userImageId = await this.uploadImage(userImagePath);
      const friendImageId = await this.uploadImage(friendImagePath);

      // AI görsel oluştur
      const generation = await this.generateImage(userImageId, friendImageId, prompt);

      // Görseli indir
      const imageBuffer = await this.downloadImage(generation.id);

      return {
        success: true,
        imageBuffer,
        generationId: generation.id
      };

    } catch (error) {
      logError(error, { context: 'processImages', prompt });
      throw error;
    } finally {
      // Geçici dosyaları temizle
      this.cleanupTempFiles(tempFiles);
    }
  }
}

module.exports = new RunwayService(); 