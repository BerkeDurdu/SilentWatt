---
type: map
area: architecture
status: aktif
related: [Q-04, Q-05, Q-07, A-08, A-09, A-11]
updated: 2026-09-23
---

# Mimari haritası

Sistem parçaları, aralarındaki sözleşmeler ve altyapı kararları.
Durumlar [decisions.md](../decisions.md)'de tutulur.

## Bugünkü durum

```text
../dataset/ (CSV, salt okunur)
      │
      ▼
packages/ml  ── audit · baseline · compare ──►  artifacts/ (Git dışı JSON/CSV, provenance'lı)

src/ (React konsol) ◄──►  server/ (Express API, bellek içi örnek veri)

İki taraf arasında henüz bağlantı yok (Q-04).
```

Hedef zincir ([PRD §6, §11–12](../../docs/product/SilentWatt-Teknik-PRD-v1.1.md)):
ML sürümlü kanıt paketi → B: saklama ve API → A: vaka listesi ve detay ekranları.

## Parçalar

| Parça | Özet | Kaynak |
|---|---|---|
| Web konsolu | React 19 + Vite; Express 5 API; rol ve ekran yetkisi sunucuda denetlenir; TR/EN; 7 ekran | [kök README](../../README.md) (Proje yapısı, Yetki modeli) |
| Demo veri deposu | Bellek içi; sunucu yeniden başlayınca örnek veriye döner | [server/store.ts](../../server/store.ts) |
| Demo API tipleri | Arıza aileleri, hipotezler, `lossKwhMonth` gibi alanlar. **ML kanıt şeması değildir.** | [shared/types.ts](../../shared/types.ts) |
| ML paketi | Python 3.12; `data/` (okuma, kalite, denetim, günlük kapılar), `models/` (baseline, kalibrasyon, karşılaştırma, değerlendirme); CLI `silentwatt-ml` | [packages/ml/README.md](../../packages/ml/README.md) |
| Config | Dosya, kolon, dönem, cohort ve model ayarları | [austin-2018.json](../../configs/ml/austin-2018.json) |
| Notebook'lar | Analiz; kendi kilit dosyası; test hedeflerine erişmez | [notebooks/README.md](../../notebooks/README.md) |
| CI | Web typecheck/build + ML kurulum/test/CLI | [ci.yml](../../.github/workflows/ci.yml) |
| Ajan skill'leri | `.claude/skills` altında dokuz sabitlenmiş skill; `ponytail` ailesi `.codex/skills`'te kullanılmıyor | [.claude/skills/README.md](../../.claude/skills/README.md) |

## Sözleşmeler ([ml-pipeline.md](../../docs/architecture/ml-pipeline.md))

- C sürümlü artifact yazar; B okur ve kullanıcıya dönük vakaları saklar. C uygulama
  veritabanına doğrudan yazmaz.
- Kanıt JSON'u veri, config, model, kalibrasyon, dedektör ve kod sürümlerini taşımalı.
  Eksik veya destek dışı tahminler sayısal sıfır değil, neden kodu taşır.
- Ampirik kuantiller veya anomali skorları demo arıza olasılıklarına ya da kWh
  tasarrufuna eşlenmez.
- Kaynak ayrıştırma kuralları `silentwatt_ml.data` içindedir. İleride bir ingestion paketi
  bunları regresyon testleriyle taşır; ikinci bir parser yazılmaz.

## Alınmış mimari kararlar

- Express korunur; ikinci bir FastAPI servisi yok (2026-09-16).
- `apps/` ve `services/` klasörleri yalnız gerçek bir servis ayrımı gerekince açılır.
- ML kodu bulut bağımsızdır (yerel yollar); Google Cloud veya Huawei SDK'sına bağlı değildir.
- PostgreSQL, nesne deposu, Parquet ve bulut batch işleri sonraki B teslimleridir.
- MVP bulutu Google Cloud; Huawei'ye geçiş sonra (PRD §6.3–6.4; A-08, A-11).

## Bilinen sınırlar (kök README)

- Bellek içi depo kalıcı değil.
- SMS gönderimi simüle ediliyor.
- Müşteri bağlantısı jetonu her sunucu başlangıcında yenileniyor.

## CI kapsamı dışında kalanlar

Notebook testleri (Q-07), API sözleşme/E2E testleri, lint, tam veri benchmark'ı.

## Açık konular

Q-04 (kanıt JSON ↔ API sözleşmesi) · Q-05 (Claude bağlamı ve skill keşfi) · Q-07 ·
A-08, A-09, A-11. Ayrıntı: [decisions.md](../decisions.md).
