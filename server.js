// Bu dosya, uygulamanın arka yüzünü (backend) temsil eder.
// Gerçek bir projede bu sunucuyu ayrı bir klasörde çalıştırırsınız.
// Bu kodun çalışması için Node.js ve bazı paketlerin (express, dotenv, node-fetch, cors) kurulu olması gerekir.

const express = require('express');
const fetch = require('node-fetch');
const dotenv = require('dotenv');
const cors = require('cors'); // CORS middleware'ini ekliyoruz

// .env dosyasındaki gizli anahtarları yükler
dotenv.config();

const app = express();
const port = 3000;

// Frontend'den gelen istekleri kabul etmek için CORS'u etkinleştirin
app.use(cors());
app.use(express.json()); // Gelen JSON verilerini okumak için

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
        // Render'a yüklendiğinde bu adresin de canlı olması gerekir.
        const redirectUri = `https://satici-paneli.onrender.com/shopify/callback`;
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
            
            // Shopify'dan gelen hatayı kontrol et
            if (responseJson.error) {
                console.error('Shopify API Hatası:', responseJson.error_description);
                return res.status(400).send(`Shopify Hatası: ${responseJson.error_description || responseJson.error}`);
            }

            const accessToken = responseJson.access_token;

            if (!accessToken) {
                console.error('Erişim anahtarı alınamadı. Shopify yanıtı:', responseJson);
                throw new Error('Erişim anahtarı alınamadı.');
            }
            
            console.log(`Erişim Anahtarı alındı: ${accessToken}`);
            userTokens[shop] = accessToken;

            // Kullanıcıyı ön yüze (frontend) geri yönlendir, mağaza adını da ekleyerek
            res.redirect(`https://sweet-pothos-58bd7f.netlify.app/#platform-connections?connected=shopify&shop=${shop}`);

        } catch (error) {
            console.error('Erişim anahtarı alınırken kritik hata:', error);
            res.status(500).send('Sunucuda bir hata oluştu. Lütfen Render loglarını kontrol edin.');
        }

    } else {
        res.status(400).send('Gerekli parametreler eksik');
    }
});


// 3. Adım: Ön yüzden gelen ürün yükleme isteğini işleme
app.post('/shopify/products', async (req, res) => {
    const { shop, title, body_html, price, inventory_quantity, tags } = req.body;
    const accessToken = userTokens[shop];

    if (!accessToken) {
        return res.status(403).json({ message: 'Mağaza için yetkilendirme bulunamadı. Lütfen tekrar bağlanın.' });
    }
    
    const productData = {
        product: {
            title: title,
            body_html: body_html,
            vendor: "Satıcı Paneli Uygulaması",
            product_type: "Özel Ürün",
            tags: tags,
            variants: [
                {
                    price: price,
                    inventory_quantity: inventory_quantity
                }
            ],
            status: "draft" // Ürünü taslak olarak oluştur
        }
    };

    try {
        const response = await fetch(`https://${shop}/admin/api/2023-10/products.json`, {
            method: 'POST',
            headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(productData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Shopify API Hatası:', errorData);
            throw new Error('Shopify ürünü oluşturamadı.');
        }

        const responseData = await response.json();
        res.json({ status: 'success', data: responseData });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});


app.listen(port, () => {
    console.log(`Sunucu http://localhost:${port} adresinde çalışıyor`);
});

