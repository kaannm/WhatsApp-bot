const admin = require('firebase-admin');
const config = require('../config');

class FirebaseStorageService {
  constructor() {
    this.bucket = admin.storage().bucket();
  }

  async uploadImage(imageData, fileName) {
    try {
      // Base64 data URL'ini düzenle
      let base64Data = imageData;
      if (imageData.startsWith('data:image')) {
        base64Data = imageData.split(',')[1];
      }

      // Buffer'a çevir
      const buffer = Buffer.from(base64Data, 'base64');
      
      // Dosya adı oluştur
      const timestamp = Date.now();
      const filePath = `whatsapp-bot/${timestamp}_${fileName}.jpg`;
      
      // Firebase Storage'a yükle
      const file = this.bucket.file(filePath);
      await file.save(buffer, {
        metadata: {
          contentType: 'image/jpeg',
          metadata: {
            uploadedBy: 'WhatsApp Bot',
            timestamp: timestamp.toString()
          }
        }
      });

      // Public URL oluştur
      await file.makePublic();
      const publicUrl = `https://storage.googleapis.com/${this.bucket.name}/${filePath}`;

      return {
        success: true,
        url: publicUrl,
        filePath: filePath,
        timestamp: timestamp
      };

    } catch (error) {
      console.error('Firebase Storage yükleme hatası:', error.message);
      throw new Error(`Firebase Storage yükleme hatası: ${error.message}`);
    }
  }

  async deleteImage(filePath) {
    try {
      const file = this.bucket.file(filePath);
      await file.delete();
      return true;
    } catch (error) {
      console.error('Firebase Storage silme hatası:', error.message);
      return false;
    }
  }
}

module.exports = new FirebaseStorageService(); 