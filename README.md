# SilentWatt Console

SilentWatt'ın rol bazlı operasyon konsolu. Kullanıcı giriş yapar ve yalnızca kendisine atanmış ekranları görür. Diğer ekranlar menüde yer almaz; adresleri elle yazılsa bile kullanıcı kendi ana ekranına yönlendirilir. Var olmayan bir adresle aynı sonuç verdiği için ekranın varlığı anlaşılmaz.

Vakalar ML'in yazdığı kanıt dosyalarından gelir ([kanıt sözleşmesi](docs/architecture/evidence-contract.md)). Gerçek dedektör çıktısı verilmezse depodaki sentetik örnek dosyalar gösterilir ve ekranlarda **Örnek kanıt dosyaları** etiketi görünür. Adres ve abone bilgileri her durumda örnek kayıttır; veri setinde kimlik ve adres yoktur.

## Dil, renk ve logo

- **TR / EN:** Üst bardaki ve giriş ekranındaki düğmeyle değişir, seçim tarayıcıda hatırlanır. Arayüz metinleri `src/dict.ts` içindedir; arıza adları, SMS, bildirim ve rapor metinleri sunucuda seçilen dile göre üretilir (`X-Lang` başlığı).
- **Renk:** Beyaz zemin, yeşil marka rengi (`#16A34A`, metin ve düğmelerde `#0B7A3C`). Kehribar yalnızca sapma / sessiz kayıp için kullanılır. Tüm renkler `src/styles.css` başındaki değişkenlerdedir.
- **Logo:** Üç aday var — Yaprak Şimşek (varsayılan), Sessiz Dalga, Sayaç Kadranı. Karşılaştırma: `docs/logo-secenekleri.html`. Değiştirmek için `src/components/icons.tsx` içindeki `LOGO_VARIANT` ve `public/favicon.svg`.
- **Giriş görseli:** `public/visuals/solar-field.jpg` giriş ekranının sol alanında düşük kontrastlı arka plan olarak kullanılır. Kaynak: Unsplash (photo-1466611653911-95081537e5b7).

## Çalıştırma

Node 22.12 veya üstü gerekir; ekip ve CI için Node 22 kullanılır (`.nvmrc`).

```bash
npm ci
npm run dev
```

Arayüz http://localhost:5173 adresinde, API http://localhost:3001 adresinde açılır. Vite, `/api` isteklerini API'ye yönlendirir.

Canlı ortam için:

```bash
npm run build
npm start
```

`npm start` hem API'yi hem derlenmiş arayüzü tek bir porttan sunar (`PORT` ortam değişkeni, varsayılan 3001). Canlı modda demo hesapları kapalıdır; hesap dosyası (`SILENTWATT_USERS_FILE`) verilmezse sunucu başlamaz.

Docker ile:

```bash
docker compose up --build
```

Gerçek dedektör çıktısını göstermek için `SILENTWATT_EVIDENCE_DIR` ile kanıt klasörünü verin. Tüm ortam değişkenleri, uçlar, hesap dosyası ve saklama: [API belgesi](docs/architecture/api.md). API testleri: `npm test`.

## AI/ML geliştirme

AI/ML kodu `packages/ml` altında ayrı bir Python paketi olarak tutulur. Büyük dataset dosyaları Git'e eklenmez. Dataset yolu `--data-dir` ile veya dışa aktarılmış `SILENTWATT_DATA_DIR` ortam değişkeniyle verilir. Python komutları `.env` dosyasını kendiliğinden yüklemez.

Ürün ve teknik kapsamın ana sözleşmesi: [`docs/product/SilentWatt-Teknik-PRD-v1.1.md`](docs/product/SilentWatt-Teknik-PRD-v1.1.md).

Claude Code proje skill’leri [`.claude/skills/README.md`](.claude/skills/README.md) içinde seçili ve kaynak commit’leriyle belgelenmiştir. Skill’ler pasif proje talimatlarıdır; uygulamanın MCP/hook çalışma zamanını değiştirmez. Üçüncü taraf lisansları [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) içinde bulunur.

17 Eylül P0 değerlendirmesi: [veri kararları ve 8 aday hane analizi](docs/project-status/p0-data-decisions-2026-09-17.md), [skill güvenliği ve doğrulama sonuçları](docs/project-status/p0-verification-2026-09-17.md). Veri anlamı ve nihai cohort onayı açık; eşikler değiştirilmedi.

Çalıştırılabilir akışlar kaynak denetimi, sıcaklık/saat kuantil baseline ve ayrı kalibrasyonlu çok haneli B0/B1 development karşılaştırmasıdır. [P1 sonuçları ve sınırlar](docs/project-status/p1-ml-results-2026-09-17.md) günlük kalite kapılarının etkisini ve model kararını açıklar. Kurulum ve komutlar `packages/ml/README.md`, veri sınırı `data/README.md`, modül sorumlulukları `docs/architecture/ml-pipeline.md` içinde açıklanır.

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r packages/ml/requirements.lock
python -m pip install --no-build-isolation -c packages/ml/requirements.lock -e packages/ml

silentwatt-ml audit --data-dir ../dataset \
  --config configs/ml/austin-2018.json \
  --output artifacts/data-audit.json
```

Rol sahipleri:

- Berke Durdu: UX/UI ve frontend
- Muharrem Dokgöz: backend, veri hattı ve bulut işletimi
- Yusuf Ziya Demirel: AI/ML, kalibrasyon, anomali tespiti ve değerlendirme

ML akışı çevrimdışıdır; konsola kanıt dosyalarıyla bağlanır. Baseline varsayılan olarak geliştirme dönemini değerlendirir. İnceleme bulguları ve kalan teslimler: [teknik değerlendirme](docs/architecture/foundation-review.md).

## Demo hesapları

Tüm hesapların şifresi `SilentWatt2026!`. Bu hesaplar geliştirmede açıktır; canlı modda yalnızca `SILENTWATT_DEMO_ACCOUNTS=on` ile açılır. Giriş ekranındaki demo listesi yalnızca `npm run dev` ile görünür.

| E-posta | Rol | Gördüğü ekranlar |
|---|---|---|
| emre@silentwatt.demo | Saha Teknisyeni | İş Emirlerim |
| deniz@silentwatt.demo | Saha Teknisyeni | İş Emirlerim |
| operator@silentwatt.demo | Operatör | Vaka Kuyruğu, Saha Ekibi, Veri Kaynakları |
| yonetim@silentwatt.demo | Yönetim | Genel Bakış, Vaka Kuyruğu (salt okunur), Raporlar |
| admin@silentwatt.demo | Sistem Yöneticisi | Kullanıcılar ve Yetkiler, Veri Kaynakları |

Toplam 7 ekran var. Roller yalnızca başlangıç ayarıdır; sistem yöneticisi **Kullanıcılar ve Yetkiler** ekranından her kullanıcıya tek tek ekran ekleyip çıkarabilir.

### Uçtan uca demo akışı

1. `operator@…` ile girin → Vaka Kuyruğu → `SW-HVAC-90003-20180703-ACU` → Emre Kaya'ya atayın. Sentetik vakalar **Sentetik** filtresinde durur; üzerlerinde işlem yapılmaz.
2. Çıkış yapıp `emre@…` ile girin. Teknisyen yalnızca **İş Emirlerim** ekranını görür; menü yoktur.
3. Gelen SMS'teki linki açın → saha sonucunu kaydedin.
4. `yonetim@…` ile girip vakanın kapandığını görün.

## Müşteri bilgilendirmesi ve kontrol talebi

Vaka açıldığında abonenin telefonuna bilgilendirme SMS'i gider: ne ölçtüğümüz sade bir dille, model referansına göre fark olarak anlatılır (birim, enerji veya para yazılmaz) ve **isterse** talep oluşturabileceği bir adres verilir (`silentwatt.app/talep/<jeton>`).

- **Giriş yok.** Link tek bir vakaya bağlı, tahmin edilemez bir jeton taşır. Geçersiz jeton `404` döner ve sayfa "bu bağlantı geçerli değil" der; konsola yönlendirme yapılmaz.
- **Form dolu gelir.** Ad, telefon, e-posta ve adres abonelik kaydından doldurulur; **hiçbiri kilitli değildir**. Abone adresini düzeltirse ekip düzeltilmiş adrese gider ve konsolda "müşteri düzeltti" etiketi görünür.
- **Sayfa müşteriye göredir.** Hane kimliği, dedektör ayrıntıları ve öncelik gibi iç veriler bu sayfada yoktur. Sentetik ve veri sorunu vakalarında SMS ve link hiç oluşmaz.
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
- **Alan maskeleme sunucuda yapılır:** Yönetim adresi ilçe düzeyinde, operatör mahalle düzeyinde, teknisyen tam adres olarak görür.
- **Arayüz:** Erişilemeyen her adres (başka rolün ekranı, başkasının vakası, giriş sonrası eski bir `next` adresi) kullanıcının ana ekranına yönlendirir. `/api/me` yalnızca izinli ekranları döner. Menü ve rotalar bu listeden üretilir; her ekranın kodu ayrı parçaya bölünmüştür ve yalnızca o ekrana sahip kullanıcı açtığında indirilir.

> Not: Derlenmiş JS parça dosyalarının adları statik sunucuda durur. Bunlar veri içermez; veriye ve işlemlere erişim yukarıdaki sunucu kontrolleriyle korunur.

## Proje yapısı

```
server/            Express + TypeScript API
  config.ts        ortam değişkenleri
  catalog.ts       7 ekranın tanımı, rol ön ayarları
  auth.ts          oturum, giriş, CSRF, requireScreen / requireCapability
  evidence.ts      kanıt dosyalarını okur ve sözleşmeye göre denetler
  explain/         vaka açıklaması: şablon ve metin kalkanı
  store.ts         hesaplar, vaka iş akışı, ekran verileri
  persist.ts       konsol durumunun JSON dosyasına kaydı
  app.ts           API uçları, canlı ortamda statik dosya sunumu
  index.ts         sunucuyu başlatır
  test/            API testleri (npm test)
shared/types.ts    API ile arayüzün ortak tipleri
shared/evidence.ts kanıt sözleşmesinin tipleri
shared/fixtures/   sentetik örnek kanıt dosyaları
scripts/           hash-password: hesap dosyası kaydı üretir
src/               React + TypeScript arayüz (Vite)
  App.tsx          giriş kapısı ve izinli rotalar
  registry.ts      ekran anahtarı → tembel yüklenen bileşen
  pages/Login.tsx
  pages/Request.tsx  müşterinin SMS linkinden açtığı genel sayfa
  screens/         7 ekran
  components/      kabuk, vaka detayı, grafikler
```

## Sınırlamalar

- Konsol durumu bir JSON dosyasında tutulur; PostgreSQL sonraki adımdır (`server/persist.ts`). Oturumlar bellektedir; sunucu yeniden başlayınca kullanıcılar tekrar giriş yapar.
- SMS gönderimi simüledir; teknisyene giden mesaj gelen kutusunda, müşteriye giden mesaj vaka detayında gösterilir. Gerçek gönderim için bir SMS sağlayıcısı bağlanmalıdır.
- Müşteri linklerinin jetonları durum dosyasıyla birlikte saklanır; durum dosyası silinirse eski linkler geçersiz olur.
- HTTPS sunucunun önündeki vekilde sonlanır; imaj kendi başına TLS sunmaz.
