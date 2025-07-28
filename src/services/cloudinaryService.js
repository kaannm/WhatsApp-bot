const { v2: cloudinary } = require('cloudinary');
const config = require('../config');

class CloudinaryService {
  constructor() {
    // Cloudinary konfigürasyonu
    cloudinary.config({
      cloud_name: config.cloudinary.cloudName,
      api_key: config.cloudinary.apiKey,
      api_secret: config.cloudinary.apiSecret
    });
  }

  async uploadImage(imageData, publicId = null) {
    try {
      if (!config.cloudinary.cloudName || !config.cloudinary.apiKey || !config.cloudinary.apiSecret) {
        throw new Error('Cloudinary konfigürasyonu eksik');
      }

      // Public ID oluştur
      const timestamp = Date.now();
      const finalPublicId = publicId || `whatsapp-bot/${timestamp}`;

      // Cloudinary'ye yükle
      const uploadResult = await cloudinary.uploader.upload(
        imageData,
        {
          public_id: finalPublicId,
          folder: 'whatsapp-bot',
          resource_type: 'image',
          transformation: [
            { width: 800, height: 800, crop: 'limit' },
            { quality: 'auto', fetch_format: 'auto' }
          ]
        }
      );

      return {
        success: true,
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        assetId: uploadResult.asset_id,
        timestamp: timestamp
      };

    } catch (error) {
      console.error('Cloudinary yükleme hatası:', error.message);
      throw new Error(`Cloudinary yükleme hatası: ${error.message}`);
    }
  }

  async uploadFromUrl(imageUrl, publicId = null) {
    try {
      if (!config.cloudinary.cloudName || !config.cloudinary.apiKey || !config.cloudinary.apiSecret) {
        throw new Error('Cloudinary konfigürasyonu eksik');
      }

      // Public ID oluştur
      const timestamp = Date.now();
      const finalPublicId = publicId || `whatsapp-bot/${timestamp}`;

      // URL'den Cloudinary'ye yükle
      const uploadResult = await cloudinary.uploader.upload(
        imageUrl,
        {
          public_id: finalPublicId,
          folder: 'whatsapp-bot',
          resource_type: 'image',
          transformation: [
            { width: 800, height: 800, crop: 'limit' },
            { quality: 'auto', fetch_format: 'auto' }
          ]
        }
      );

      return {
        success: true,
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        assetId: uploadResult.asset_id,
        timestamp: timestamp
      };

    } catch (error) {
      console.error('Cloudinary URL yükleme hatası:', error.message);
      throw new Error(`Cloudinary URL yükleme hatası: ${error.message}`);
    }
  }

  async deleteImage(publicId) {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      return result.result === 'ok';
    } catch (error) {
      console.error('Cloudinary silme hatası:', error.message);
      return false;
    }
  }

  getOptimizedUrl(publicId, options = {}) {
    const defaultOptions = {
      fetch_format: 'auto',
      quality: 'auto',
      width: 500,
      height: 500,
      crop: 'fill',
      gravity: 'auto'
    };

    const finalOptions = { ...defaultOptions, ...options };
    return cloudinary.url(publicId, finalOptions);
  }
}

module.exports = new CloudinaryService(); 