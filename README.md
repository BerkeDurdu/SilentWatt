# SilentWatt Console

SilentWatt'ın rol bazlı operasyon konsolu. Kullanıcı giriş yapar ve yalnızca kendisine atanmış ekranları görür. Diğer ekranlar menüde yer almaz; adresleri elle yazılsa bile kullanıcı kendi ana ekranına yönlendirilir. Var olmayan bir adresle aynı sonuç verdiği için ekranın varlığı anlaşılmaz.

Tüm veriler sunum için **örnek veridir**.

## Dil, renk ve logo

- **TR / EN:** Üst bardaki ve giriş ekranındaki düğmeyle değişir, seçim tarayıcıda hatırlanır. Arayüz metinleri `src/dict.ts` içindedir; arıza adları, SMS, bildirim ve rapor metinleri sunucuda seçilen dile göre üretilir (`X-Lang` başlığı).
- **Renk:** Beyaz zemin, yeşil marka rengi (`#16A34A`, metin ve düğmelerde `#0B7A3C`). Kehribar yalnızca sapma / sessiz kayıp için kullanılır. Tüm renkler `src/styles.css` başındaki değişkenlerdedir.
- **Logo:** Üç aday var — Yaprak Şimşek (varsayılan), Sessiz Dalga, Sayaç Kadranı. Karşılaştırma: `docs/logo-secenekleri.html`. Değiştirmek için `src/components/icons.tsx` içindeki `LOGO_VARIANT` ve `public/favicon.svg`.
- **Giriş görseli:** `public/visuals/solar-field.jpg` giriş ekranının sol alanında düşük kontrastlı arka plan olarak kullanılır. Kaynak: Unsplash (photo-1466611653911-95081537e5b7).

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

## Müşteri bilgilendirmesi ve kontrol talebi

Vaka açıldığında abonenin telefonuna bilgilendirme SMS'i gider: ne gördüğümüz sade bir dille anlatılır, aylık fark kWh olarak yazılır ve **isterse** talep oluşturabileceği bir adres verilir (`silentwatt.app/talep/<jeton>`).

- **Giriş yok.** Link tek bir vakaya bağlı, tahmin edilemez bir jeton taşır. Geçersiz jeton `404` döner ve sayfa "bu bağlantı geçerli değil" der; konsola yönlendirme yapılmaz.
- **Form dolu gelir.** Ad, telefon, e-posta ve adres abonelik kaydından doldurulur; **hiçbiri kilitli değildir**. Abone adresini düzeltirse ekip düzeltilmiş adrese gider ve konsolda "müşteri düzeltti" etiketi görünür.
- **Sayfa müşteriye göredir.** Sayaç numarası, hipotez olasılıkları, öncelik gibi iç veriler bu sayfada yoktur.
- **Konsolda karşılığı:** Vaka detayında "Müşteriye giden SMS" ve "Müşteri talebi" panelleri açılır, vaka geçmişine bir satır düşer, kuyrukta ve iş emri kartında "Talep var" rozeti çıkar, operatöre bildirim gider.
- **Maskeleme burada da geçerli:** Talepteki adres yönetime ilçe, operatöre mahalle düzeyinde gösterilir. Link ve içindeki jeton yalnızca tam adres yetkisi olan role (saha teknisyeni) açılır; diğerlerinde `silentwatt.app/talep/••••••` olarak görünür.
- **Kötüye kullanım:** Talep gönderimi IP başına saatte 20 istekle sınırlıdır; form alanları sunucuda doğrulanır ve `X-Requested-With` başlığı zorunludur.

Demo için: operatörle vakayı bir teknisyene atayın, teknisyen hesabında vaka detayındaki **Bağlantıyı aç** düğmesine basın — müşterinin gördüğü sayfa açılır.

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
  pages/Request.tsx  müşterinin SMS linkinden açtığı genel sayfa
  screens/         7 ekran
  components/      kabuk, vaka detayı, grafikler
```

## Sınırlamalar

- Veriler bellekte tutulur; sunucu yeniden başlayınca örnek veriye döner. Kalıcılık için `store.ts` bir veritabanı katmanıyla değiştirilmelidir (API şekli aynı kalır).
- SMS gönderimi simüledir; teknisyene giden mesaj gelen kutusunda, müşteriye giden mesaj vaka detayında gösterilir. Gerçek gönderim için bir SMS sağlayıcısı bağlanmalıdır.
- Müşteri linkinin jetonu sunucu her başladığında yeniden üretilir; eski linkler geçersiz olur.
