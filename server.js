// Bu dosya, uygulamanın arka yüzünü (backend) temsil eder.
const express = require('express');
const fetch = require('node-fetch');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000; 

// Body parser limitini artırarak büyük base64 imaj verilerinin gönderilmesini sağlıyoruz.
app.use(express.json({ limit: '10mb' }));
app.use(cors());


// --- ÖNEMLİ: Bu değişkenleri Render'daki Environment Variables bölümüne eklemelisiniz ---
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL; 
const FRONTEND_URL = process.env.FRONTEND_URL; 
const SHOPIFY_SCOPES = 'write_products,read_products';

app.get('/', (req, res) => {
    res.send('Yeni Satıcı Paneli Backend Sunucusu Çalışıyor!');
});

// 1. Adım: Kullanıcıyı Shopify Onay Ekranına Yönlendirme
app.get('/shopify/auth', (req, res) => {
    const shop = req.query.shop;
    if (shop) {
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
            res.redirect(`${FRONTEND_URL}/#platform-connections?connected=shopify&shop=${shop}&access_token=${accessToken}`);

        } catch (error) {
            console.error('Erişim anahtarı alınırken kritik hata:', error);
            res.status(500).send('Sunucuda bir hata oluştu. Lütfen Render loglarını kontrol edin.');
        }

    } else {
        res.status(400).send('Gerekli parametreler eksik');
    }
});


// 3. Adım: Ön yüzden gelen ürün ve FOTOĞRAF yükleme isteğini işleme
app.post('/shopify/products', async (req, res) => {
    // YENİ: Ön yüzden gelen 'images' dizisini de alıyoruz.
    const { shop, accessToken, title, body_html, price, inventory_quantity, tags, images } = req.body;

    if (!accessToken) {
        return res.status(403).json({ message: 'Mağaza için yetkilendirme anahtarı (access token) eksik.' });
    }
    
    // Önce ürünü fotoğraflar OLMADAN oluşturuyoruz.
    const productData = {
        product: {
            title: title,
            body_html: body_html,
            tags: tags,
            variants: [{
                price: price,
                inventory_quantity: inventory_quantity
            }],
            status: "draft"
        }
    };

    try {
        // AŞAMA 1: Ürünü oluştur
        const createProductResponse = await fetch(`https://${shop}/admin/api/2024-04/products.json`, {
            method: 'POST',
            headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(productData)
        });

        if (!createProductResponse.ok) {
            const errorData = await createProductResponse.json();
            console.error('Shopify Ürün Oluşturma Hatası:', errorData);
            throw new Error(JSON.stringify(errorData.errors || 'Shopify ürünü oluşturamadı.'));
        }

        const productResponseData = await createProductResponse.json();
        const productId = productResponseData.product.id;
        console.log(`Ürün başarıyla oluşturuldu. ID: ${productId}`);

        // AŞAMA 2: Fotoğrafları yükle
        if (images && images.length > 0) {
            console.log(`${images.length} adet fotoğraf yükleniyor...`);
            
            for (const imageBase64 of images) {
                const imageUploadPayload = {
                    image: {
                        attachment: imageBase64 // Base64 formatındaki metin
                    }
                };

                const imageUploadResponse = await fetch(`https://${shop}/admin/api/2024-04/products/${productId}/images.json`, {
                    method: 'POST',
                    headers: {
                        'X-Shopify-Access-Token': accessToken,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(imageUploadPayload)
                });

                 if (!imageUploadResponse.ok) {
                    const errorData = await imageUploadResponse.json();
                    console.warn(`Bir fotoğraf yüklenemedi. Hata: ${JSON.stringify(errorData)}`);
                    // Bir fotoğraf hata verse bile devam etmesi için burada durmuyoruz.
                }
            }
             console.log('Fotoğraf yükleme işlemi tamamlandı.');
        }

        res.json({ status: 'success', data: productResponseData });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});


app.listen(port, () => {
    console.log(`Sunucu http://localhost:${port} adresinde çalışıyor`);
});

