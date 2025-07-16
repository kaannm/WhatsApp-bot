const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const serviceAccount = require('./firebase-key.json'); // kendi dosya adınla değiştir

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const app = express();
app.use(bodyParser.json());

app.post('/webhook', async (req, res) => {
    const { fullName, phone, email, city } = req.body;
  
    try {
      await db.collection('users').add({
        fullName: fullName || "Bilinmiyor",
        phone: phone || "Bilinmiyor",
        email: email || "Bilinmiyor",
        city: city || "Bilinmiyor",
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
  
      console.log(`Kullanıcı eklendi: ${fullName}`);
      res.json({
        success: true,
        message: `Teşekkürler ${fullName}, bilgilerin kaydedildi!`
      });
  
    } catch (error) {
      console.error("Firestore kaydetme hatası:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Bot sunucusu ${PORT} portunda çalışıyor.`);
});
