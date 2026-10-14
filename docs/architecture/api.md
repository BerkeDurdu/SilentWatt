# Konsol API'si

Express 5 + TypeScript (`server/`). Tüm uçlar `/api/v1` altında; konsol ve eski bağlantılar için aynı
uçlar `/api` altında da açıktır. Zamanlar ISO-8601 UTC, gövdeler JSON. Vakaların kendisi ML'in yazdığı
kanıt dosyalarından gelir ([kanıt sözleşmesi](evidence-contract.md)); API yalnızca insanların bu
vakalar üzerinde yaptıklarını (durum, atama, müşteri talebi, kullanıcı yetkisi) saklar.

## Uçlar

| Yöntem ve yol | Kim | Ne yapar |
|---|---|---|
| `GET /health` | herkes | `status`, `run_id`, `fixture`, `cases`, `uptime_s`; hassas içerik yok |
| `POST /auth/login` | anonim | Oturum çerezi; hatalı girişte genel `401`, 10 dakikada 5 hatadan sonra `429` |
| `POST /auth/logout` | oturum | Oturumu kapatır |
| `GET /me` | oturum | Kullanıcı, izinli ekranlar, yetkiler, `fixture` |
| `GET /notifications` | oturum | Role göre bildirimler; sentetik vakalar bildirim üretmez |
| `GET /cases?status=open\|closed\|synthetic\|all` | `queue` ekranı | Liste ve sayılar; sentetik vakalar ayrı sayılır |
| `GET /cases/{id}` | kuyruk veya atanmış teknisyen | Vaka, günlük ve 15 dakikalık seri, açıklama, geçmiş |
| `POST /cases/{id}/review` | `case.assign` | Yeni → incelemede |
| `POST /cases/{id}/assign` | `case.assign` | `{technicianId}`; teknisyene SMS (simüle) |
| `POST /cases/{id}/dismiss` | `case.dismiss` | İnceleme gerekmiyor olarak kapatır |
| `POST /cases/{id}/result` | atanmış teknisyen | `{result: verified\|other\|dismissed, note}` |
| `GET /technicians` | `case.assign` | Atanabilir teknisyenler |
| `GET /overview` | `overview` | Gözlenen vaka sayıları, sentetik değerlendirme, hane tablosu |
| `GET /jobs` | `jobs` | Teknisyenin açık işleri ve gelen SMS'ler |
| `GET /team` | `team` | Teknisyen iş yükü ve bulgu oranı |
| `GET /reports/monthly` · `.csv` | `reports` (CSV: `report.export`) | Köken × tür grupları; CSV Excel için BOM'lu |
| `GET /data-sources` | `data` | Koşu, dedektör eşikleri ve kaynağı, sentetik plan |
| `GET /users` · `PATCH /users/{id}` | `users` (değişiklik: `users.manage`) | Rol, ekran ve aktiflik |
| `GET /public/request/{token}` · `POST` | anonim, jetonla | Müşterinin SMS linkindeki sayfa; IP başına saatte 20 gönderim |

Kurallar:

- Yetkisi olmayan ekran, işlem veya başkasının vakası `403` değil `404` döner; varlığı sızmaz.
- Veri değiştiren her istek `X-Requested-With: silentwatt` başlığı taşır (CSRF).
- Sentetik vakada inceleme, atama, kapatma ve sonuç `409` döner; müşteri SMS'i ve linki yoktur.
- Veri sorunu vakasında müşteri SMS'i yoktur: cihaz sinyali değil, ölçüm sorunudur.
- Kanıt dosyası okunurken şema sürümü, birim ve yeniden oynatma penceresi denetlenir; pencere dışı
  bir tarih (ör. test dönemi) sunucuyu başlatmaz.

## Ortam değişkenleri

| Değişken | Varsayılan | Anlamı |
|---|---|---|
| `SILENTWATT_EVIDENCE_DIR` | `shared/fixtures/evidence` | Gösterilecek dedektör çıktısı (`index.json` + `cases/`) |
| `SILENTWATT_DATABASE_URL` | — | PostgreSQL (RDS for PostgreSQL, GaussDB veya compose `db`); verilirse durum dosyası yerine kullanılır |
| `SILENTWATT_DATABASE_CA` | — | Yönetilen veritabanının CA sertifikası (TLS) |
| `SILENTWATT_STATE_FILE` | `.data/console-state.json` (Docker: `/data/console-state.json`) | Konsol durumu; `off` bellekte tutar |
| `SILENTWATT_USERS_FILE` | — | Gerçek hesaplar; canlıda demo hesapları kapalıyken zorunlu |
| `SILENTWATT_DEMO_ACCOUNTS` | geliştirmede `on`, canlıda `off` | Ortak parolalı demo hesapları |
| `SILENTWATT_COOKIE_SECURE` | canlıda `on` | `Secure` çerez; HTTPS arkasında açık kalmalı |
| `SILENTWATT_TRUST_PROXY` | `loopback` | Ters vekil arkasında istemci IP'si için (ör. `uniquelocal`) |
| `SILENTWATT_REQUEST_LOG` | `on` | İstek başına bir JSON satırı: `request_id`, `run_id`, yol, durum, süre, kullanıcı |
| `PORT` / `API_PORT` | `3001` | Canlıda `PORT`, geliştirmede `API_PORT` |

Canlı mod (`npm start`, Docker) hiçbir hesap yoksa başlamaz ve nedenini yazar.

## Hesaplar

`users.json` bir dizidir; her kayıt `{id, name, email, role, salt, hash}` taşır. Parola komut
satırına yazılmaz, standart girdiden okunur:

```bash
npm run hash-password -- u-ayse operator ayse@kurum.com.tr "Ayşe Yılmaz" < parola.txt
```

Çıkan kayıtları bir diziye koyun. `users.json` Git'e eklenmez (`.gitignore`).

## Saklama

`SILENTWATT_DATABASE_URL` verilirse durum PostgreSQL'de `console_state` tablosunda tek satır (jsonb) olarak tutulur; yazmalar sıraya alınır, en son durum kazanır, kapanışta (`SIGTERM`) bekleyen yazma tamamlanır. Veritabanı yoksa konsol durumu tek bir JSON dosyasıdır; her değişiklikten sonra geçici dosyaya yazılıp yeniden
adlandırılır, yarım dosya kalmaz. Yeniden başlatmada yalnızca hâlâ kanıtta bulunan vakalar ve hâlâ var
olan kullanıcılar geri yüklenir; müşteri linkleri aynı kalır. Oturumlar bellekte tutulur, yeniden
başlatmada kullanıcı tekrar giriş yapar. Geliştirmede baştan başlamak için `.data/` klasörünü silin. PRD §11.1'deki ayrıntılı tablo şeması (karar kaydı, kanıt anlık görüntüsü) sonraki adımdır; değişiklik `server/persist.ts` ile sınırlıdır.

## Docker

```bash
docker compose up --build                                   # http://localhost:3001
SILENTWATT_DEMO_ACCOUNTS=on SILENTWATT_COOKIE_SECURE=off docker compose up --build   # yerel demo
```

İmaj arayüzü derler ve API ile birlikte tek porttan sunar; konsol durumu `console-state` biriminde
kalır, `HEALTHCHECK` `/api/health` uçunu yoklar. Gerçek kanıt ve hesap dosyaları
`docker-compose.yml` içindeki yorumlu satırlarla salt okunur bağlanır. İnternete açmadan önce önüne
TLS sonlandıran bir vekil (ör. Caddy) konur ve `SILENTWATT_COOKIE_SECURE` açık kalır.

Bulut kurulumu (Huawei Cloud ECS, OBS, SWR, isteğe bağlı RDS; HTTPS vekili, yedekler): [deploy/huawei/README.md](../../deploy/huawei/README.md).

## Testler

```bash
npm test
```

`server/test/`: sağlık ucu, yetki gizleme, CSRF, sentetik vakada işlem engeli, uçtan uca iş akışı ve
kaydı, yeniden başlatmada geri yükleme, hesap dosyası, canlıda hesapsız açılmama, kanıt doğrulaması,
açıklama kalkanı ve PostgreSQL deposu (`SILENTWATT_TEST_DATABASE_URL` verilince; CI'da bir postgres
servisiyle). CI ayrıca Docker imajını derler, bulut compose dosyasını ve Terraform'u doğrular.
