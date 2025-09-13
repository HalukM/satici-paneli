// Bu dosya, uygulamanın arka yüzünü (backend) temsil eder.
// Gerçek bir projede bu sunucuyu ayrı bir klasörde çalıştırırsınız.
// Bu kodun çalışması için Node.js ve bazı paketlerin (express, dotenv, node-fetch) kurulu olması gerekir.

const express = require('express');
const fetch = require('node-fetch');
const dotenv = require('dotenv');

// .env dosyasındaki gizli anahtarları yükler
dotenv.config();

const app = express();
const port = 3000;

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SHOPIFY_SCOPES = 'write_products,read_products'; // İzinler

// Bu, kullanıcı token'larını saklamak için geçici bir bellektir.
// Gerçek bir uygulamada bu bilgileri bir veritabanında saklamalısınız.
const userTokens = {}; 

app.get('/', (req, res) => {
    res.send('Satıcı Paneli Backend Sunucusu Çalışıyor!');
});

// 1. Adım: Kullanıcıyı Shopify Onay Ekranına Yönlendirme
app.get('/shopify/auth', (req, res) => {
    const shop = req.query.shop;
    if (shop) {
        const redirectUri = `http://localhost:${port}/shopify/callback`;
        const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${SHOPIFY_SCOPES}&redirect_uri=${redirectUri}`;
        res.redirect(installUrl);
    } else {
        return res.status(400).send('Mağaza adı eksik');
    }
});

// 2. Adım: Shopify'dan Gelen Onayı İşleme ve Erişim Anahtarı Alma
app.get('/shopify/callback', async (req, res) => {
    const { shop, hmac, code } = req.query;

    if (shop && hmac && code) {
        // HMAC doğrulamasını burada yapmanız gerekir (güvenlik için)
        // Bu örnekte basitlik için atlanmıştır.

        const accessTokenRequestUrl = `https://${shop}/admin/oauth/access_token`;
        const accessTokenPayload = {
            client_id: SHOPIFY_API_KEY,
            client_secret: SHOPIFY_API_SECRET,
            code,
        };

        try {
            const response = await fetch(accessTokenRequestUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(accessTokenPayload),
            });

            const responseJson = await response.json();
            const accessToken = responseJson.access_token;
            
            console.log(`Erişim Anahtarı alındı: ${accessToken}`);
            
            // Anahtarı (token) kullanıcıyla ilişkilendirerek saklayın
            // Bu örnekte basit bir obje kullanıyoruz, gerçekte veritabanı olmalı.
            userTokens[shop] = accessToken;

            // Kullanıcıyı ön yüze (frontend) geri yönlendir
            // Bağlantının başarılı olduğunu belirtmek için bir parametre ekleyebilirsiniz.
            res.redirect(`http://127.0.0.1:5500/e-ticaret-yonetim-paneli.html#platform-connections?connected=shopify`);

        } catch (error) {
            console.error('Erişim anahtarı alınırken hata:', error);
            res.status(500).send('Bir hata oluştu.');
        }

    } else {
        res.status(400).send('Gerekli parametreler eksik');
    }
});


// 3. Adım: Ön yüzden gelen ürün yükleme isteğini işleme
app.post('/shopify/products', async (req, res) => {
    // Bu kısım, ön yüzden ürün verisini alıp Shopify'a gönderecek
    // olan API endpoint'idir. Gerçek bir uygulamada bu bölümü
    // doldurmanız gerekir.
    
    // const { shop, title, description, price } = req.body;
    // const accessToken = userTokens[shop];

    // if (!accessToken) {
    //     return res.status(403).send('Yetkisiz erişim');
    // }

    // // Shopify'a ürünü oluşturmak için API çağrısı yap...
    
    res.json({ status: 'success', message: 'Ürün başarıyla Shopify\'a yüklendi (simülasyon)' });
});


app.listen(port, () => {
    console.log(`Sunucu http://localhost:${port} adresinde çalışıyor`);
});
