const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

async function generateVeo3Video(prompt, downloadDir = 'videos') {
  // Video dosyasını kaydedeceğimiz klasörü hazırla
  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
  }
  
  let operation = await ai.models.generateVideos({
    model: 'veo-3.0-generate-preview',
    prompt: prompt,
  });

  // Operasyon tamamlanana kadar bekle
  while (!operation.done) {
    console.log('Veo 3: Video üretimi bekleniyor...');
    await new Promise((resolve) => setTimeout(resolve, 10000));
    operation = await ai.operations.getVideosOperation({
      operation: operation,
    });
  }

  // Videoyu indir
  const videoFile = operation.response.generatedVideos[0].video;
  const fileName = `veo3_${Date.now()}.mp4`;
  const filePath = path.join(downloadDir, fileName);
  await ai.files.download({
    file: videoFile,
    downloadPath: filePath,
  });
  console.log(`Veo 3: Video kaydedildi -> ${filePath}`);
  return filePath;
}

// Veo 2 ile metin + görselden video üretimi
async function generateVeo2Video(prompt, imagesBase64Array, downloadDir = 'videos') {
  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
  }
  let operation = await ai.models.generateVideos({
    model: 'veo-2.0-generate-001',
    prompt: prompt,
    images: imagesBase64Array, // birden fazla görsel
  });
  while (!operation.done) {
    console.log('Veo 2: Video üretimi bekleniyor...');
    await new Promise((resolve) => setTimeout(resolve, 10000));
    operation = await ai.operations.getVideosOperation({
      operation: operation,
    });
  }
  const videoFile = operation.response.generatedVideos[0].video;
  const fileName = `veo2_${Date.now()}.mp4`;
  const filePath = path.join(downloadDir, fileName);
  await ai.files.download({
    file: videoFile,
    downloadPath: filePath,
  });
  console.log(`Veo 2: Video kaydedildi -> ${filePath}`);
  return filePath;
}

module.exports = {
  generateVeo3Video,
  generateVeo2Video,
}; 