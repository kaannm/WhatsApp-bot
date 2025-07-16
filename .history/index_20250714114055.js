const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

app.post('/webhook', (req, res) => {
  const incomingMessage = req.body.message || "Mesaj yok";
  console.log("Gelen mesaj:", incomingMessage);

  // Simule cevap
  const reply = "Merhaba! Bu bir simülasyondur. Mesajın: " + incomingMessage;

  res.json({ reply });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Bot sunucusu ${PORT} portunda çalışıyor.`);
});
