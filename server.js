// Bu dosya, uygulamanın arka yüzünü (backend) temsil eder.
const express = require('express');
const fetch = require('node-fetch');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config();

const app = express();
// Render.com genellikle PORT'u kendi belirler. process.env.PORT kullanmak en doğrusudur.
const port = process.env.PORT || 3000; 

app.use(cors());
app.use(express.json());

// --- ÖNEMLİ: Bu değişkenleri Render'daki Environment Variables bölümüne eklemelisiniz ---
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
// Bu, Render'ın projenize verdiği, sonunda ".onrender.com" olan tam adrestir.
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL; 
// Bu, Netlify'da çalışan panelinizin adresidir.
const FRONTEND_URL = process.env.FRONTEND_URL; 
const SHOPIFY_SCOPES = 'write_products,read_products';

app.get('/', (req, res) => {
    res.send('Yeni Satıcı Paneli Backend Sunucusu Çalışıyor!');
});

// 1. Adım: Kullanıcıyı Shopify Onay Ekranına Yönlendirme
app.get('/shopify/auth', (req, res) => {
    const shop = req.query.shop;
    if (shop) {
        // HATA 1 DÜZELTMESİ: Adresi sabit yazmak yerine dinamik olarak Environment'dan alıyoruz.
        const redirectUri = `${RENDER_EXTERNAL_URL}/shopify/callback`;
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
            const accessToken = responseJson.access_token;

            if (!accessToken) {
                console.error('Erişim anahtarı alınamadı. Shopify yanıtı:', responseJson);
                throw new Error('Erişim anahtarı alınamadı.');
            }
            
            console.log(`Mağaza için Erişim Anahtarı başarıyla alındı: ${shop}`);

            // HATA 3 DÜZELTMESİ: Aldığımız accessToken'ı güvenli bir şekilde ön yüze geri gönderiyoruz.
            res.redirect(`${FRONTEND_URL}/#platform-connections?connected=shopify&shop=${shop}&access_token=${accessToken}`);

        } catch (error) {
            console.error('Erişim anahtarı alınırken kritik hata:', error);
            res.status(500).send('Sunucuda bir hata oluştu. Lütfen Render loglarını kontrol edin.');
        }

    } else {
        res.status(400).send('Gerekli parametreler eksik');
    }
});


// 3. Adım: Ön yüzden gelen ürün yükleme isteğini işleme
// HATA 2 DÜZELTMESİ: Token'ı sunucuda tutmak yerine, her istekte ön yüzden alıyoruz.
app.post('/shopify/products', async (req, res) => {
    // Ön yüzden gelen accessToken'ı burada yakalıyoruz.
    const { shop, accessToken, title, body_html, price, inventory_quantity, tags } = req.body;

    if (!accessToken) {
        return res.status(403).json({ message: 'Mağaza için yetkilendirme anahtarı (access token) eksik.' });
    }
    
    const productData = {
        product: {
            title: title,
            body_html: body_html,
            tags: tags,
            variants: [{
                price: price,
                inventory_quantity: inventory_quantity
            }],
            status: "draft" // Ürünü taslak olarak oluştur
        }
    };

    try {
        const response = await fetch(`https://${shop}/admin/api/2024-04/products.json`, { // API versiyonu güncellendi
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
            // Shopify'dan gelen hatayı doğrudan ön yüze gönderelim.
            throw new Error(JSON.stringify(errorData.errors || 'Shopify ürünü oluşturamadı.'));
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
