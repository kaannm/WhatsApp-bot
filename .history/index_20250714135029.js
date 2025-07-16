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
  const body = req.body;

  // Örnek veriler (normalde bot ile adım adım alınır)
  const fullName = body.fullName || "Bilinmiyor";
  const phone = body.phone || "Bilinmiyor";
  const email = body.email || "Bilinmiyor";
  const city = body.city || "Bilinmiyor";

  try {
    await db.collection('users').add({
      fullName,
      phone,
      email,
      city,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log("Kullanıcı Firestore'a kaydedildi.");
    res.json({ success: true, message: "Kayıt başarılı!" });

  } catch (error) {
    console.error("Firestore kaydetme hatası:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Bot sunucusu ${PORT} portunda çalışıyor.`);
});
