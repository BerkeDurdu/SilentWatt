# SilentWatt Console

SilentWatt'ın rol bazlı operasyon konsolu. Kullanıcı giriş yapar ve yalnızca kendisine atanmış ekranları görür. Diğer ekranlar menüde yer almaz; adresleri elle yazılsa bile kullanıcı kendi ana ekranına yönlendirilir. Var olmayan bir adresle aynı sonuç verdiği için ekranın varlığı anlaşılmaz.

Tüm veriler sunum için **örnek veridir**.

## Dil, renk ve logo

- **TR / EN:** Üst bardaki ve giriş ekranındaki düğmeyle değişir, seçim tarayıcıda hatırlanır. Arayüz metinleri `src/dict.ts` içindedir; arıza adları, SMS, bildirim ve rapor metinleri sunucuda seçilen dile göre üretilir (`X-Lang` başlığı).
- **Renk:** Beyaz zemin, yeşil marka rengi (`#16A34A`, metin ve düğmelerde `#0B7A3C`). Kehribar yalnızca sapma / sessiz kayıp için kullanılır. Tüm renkler `src/styles.css` başındaki değişkenlerdedir.
- **Logo:** Üç aday var — Yaprak Şimşek (varsayılan), Sessiz Dalga, Sayaç Kadranı. Karşılaştırma: `docs/logo-secenekleri.html`. Değiştirmek için `src/components/icons.tsx` içindeki `LOGO_VARIANT` ve `public/favicon.svg`.

## Çalıştırma

Node 20 veya üstü gerekir.

```bash
npm install
npm run dev
```

Arayüz http://localhost:5173 adresinde, API http://localhost:3001 adresinde açılır. Vite, `/api` isteklerini API'ye yönlendirir.

Canlı ortam için:

```bash
npm run build
npm start
```

`npm start` hem API'yi hem derlenmiş arayüzü tek bir porttan sunar (`PORT` ortam değişkeni, varsayılan 3001).

## Demo hesapları

Tüm hesapların şifresi `SilentWatt2026!`. Giriş ekranındaki demo listesi yalnızca `npm run dev` ile görünür, canlı derlemede çıkmaz.

| E-posta | Rol | Gördüğü ekranlar |
|---|---|---|
| emre@silentwatt.demo | Saha Teknisyeni | İş Emirlerim |
| deniz@silentwatt.demo | Saha Teknisyeni | İş Emirlerim |
| operator@silentwatt.demo | Operatör | Vaka Kuyruğu, Saha Ekibi, Veri Kaynakları |
| yonetim@silentwatt.demo | Yönetim | Genel Bakış, Vaka Kuyruğu (salt okunur), Raporlar |
| admin@silentwatt.demo | Sistem Yöneticisi | Kullanıcılar ve Yetkiler, Veri Kaynakları |

Toplam 7 ekran var. Roller yalnızca başlangıç ayarıdır; sistem yöneticisi **Kullanıcılar ve Yetkiler** ekranından her kullanıcıya tek tek ekran ekleyip çıkarabilir.

### Uçtan uca demo akışı

1. `operator@…` ile girin → Vaka Kuyruğu → `SW-F-24817` → Emre Kaya'ya atayın.
2. Çıkış yapıp `emre@…` ile girin. Teknisyen yalnızca **İş Emirlerim** ekranını görür; menü yoktur.
3. Gelen SMS'teki linki açın → saha sonucunu kaydedin.
4. `yonetim@…` ile girip vakanın kapandığını görün.

## Yetki modeli

- **Oturum:** Giriş başarılı olunca sunucu `httpOnly`, `SameSite=Lax` bir çerez verir. Canlı ortamda çerez `Secure` olur. Oturum 8 saat sürer.
- **Şifreler:** `scrypt` ile tuzlanarak saklanır. Bilinmeyen e-posta ile yanlış şifre aynı sürede ve aynı mesajla reddedilir.
- **Kaba kuvvet:** Aynı IP ve e-posta için 10 dakikada 5 hatalı denemeden sonra `429` döner.
- **CSRF:** Veri değiştiren her istek `X-Requested-With: silentwatt` başlığı taşımak zorundadır.
- **Ekran erişimi sunucuda denetlenir:** Her API ucu bir ekrana veya yetkiye bağlıdır (`requireScreen`, `requireCapability`). Kullanıcıda o ekran yoksa yanıt `403` değil `404` olur; ekranın varlığı böylece sızmaz.
- **Vaka erişimi:** Teknisyen yalnızca kendisine atanmış vakayı açabilir. Diğer vaka numaraları ona `404` döner.
- **Alan maskeleme sunucuda yapılır:** Yönetim adresi ilçe düzeyinde, operatör mahalle düzeyinde, teknisyen tam adres olarak görür. Sayaç numarası da buna göre kısaltılır.
- **Arayüz:** Erişilemeyen her adres (başka rolün ekranı, başkasının vakası, giriş sonrası eski bir `next` adresi) kullanıcının ana ekranına yönlendirir. `/api/me` yalnızca izinli ekranları döner. Menü ve rotalar bu listeden üretilir; her ekranın kodu ayrı parçaya bölünmüştür ve yalnızca o ekrana sahip kullanıcı açtığında indirilir.

> Not: Derlenmiş JS parça dosyalarının adları statik sunucuda durur. Bunlar veri içermez; veriye ve işlemlere erişim yukarıdaki sunucu kontrolleriyle korunur.

## Proje yapısı

```
server/            Express + TypeScript API
  catalog.ts       7 ekranın tanımı, rol ön ayarları
  auth.ts          oturum, giriş, CSRF, requireScreen / requireCapability
  store.ts         örnek veri ve iş kuralları (şimdilik bellekte)
  index.ts         API uçları, canlı ortamda statik dosya sunumu
shared/types.ts    API ile arayüzün ortak tipleri
src/               React + TypeScript arayüz (Vite)
  App.tsx          giriş kapısı ve izinli rotalar
  registry.ts      ekran anahtarı → tembel yüklenen bileşen
  pages/Login.tsx
  screens/         7 ekran
  components/      kabuk, vaka detayı, grafikler
```

## Sınırlamalar

- Veriler bellekte tutulur; sunucu yeniden başlayınca örnek veriye döner. Kalıcılık için `store.ts` bir veritabanı katmanıyla değiştirilmelidir (API şekli aynı kalır).
- SMS gönderimi simüledir; teknisyenin gelen kutusunda gösterilir.
