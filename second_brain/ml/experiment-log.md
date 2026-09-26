---
type: log
area: ml
status: aktif
related: [Q-02]
updated: 2026-09-26
---

# Koşu kaydı

`artifacts/` Git dışındadır ve yalnız bu bilgisayarda bulunur. Bu tablo, her dizinin neden
oluşturulduğunu, sonucunu ve test dönemini görüp görmediğini kaydeder. Her yeni koşu bir
satır ekler; en yeni satır en üstte.

**Test gördü mü?** sütunu zorunludur. "Evet" olan koşuların metrikleri karar veya ayar için
kullanılmaz.

| Tarih | Dizin (`artifacts/…`) | Komut | Dönem | Amaç | Sonuç | Kanıt | Test gördü mü? |
|---|---|---|---|---|---|---|---|
| 2026-09-22 | — (kayıt yok) | tek seferlik sorgu | train | Negatif değerlerin yapısı | Sensör sıfır kayması kanıtı | [not](../data/negative-values-sensor-floor.md) | Hayır |
| 2026-09-22 | `notebook-data-understanding/` | notebook 01 | train + development kalite sütunları | Veriyi anlama; P0/P1'i bağımsız yeniden hesaplama | 82/82 kontrol uyumlu, 19 PNG, `verification.json` | [notebooks/README](../../notebooks/README.md) | Hayır |
| 2026-09-17 | `p1-2026-09-17/development-run03/`, `run04/` | `compare` | train / calibration / development | P1, son kod; tekrar üretilebilirlik | `retain_B0`; iki koşu byte düzeyinde eşit. **Referans koşu: run03** | [P1 raporu](../../docs/project-status/p1-ml-results-2026-09-17.md) | Hayır |
| 2026-09-17 | `p1-2026-09-17/legacy-baseline-check/` | `baseline` | train → development | Ortak kod çıkarımı eski baseline'ı bozdu mu? | Tahmin CSV'si byte eşit | P1 raporu | Hayır |
| 2026-09-17 | `p1-2026-09-17/development-run01/`, `run02/` | `compare` | train / calibration / development | P1, inceleme düzeltmelerinden önceki kod (paket hash `fe603343…`) | `retain_B0` | `development-run0*.log` | Hayır |
| 2026-09-17 | `p1-2026-09-17/development-before-timezone-fix.log` | `compare` | — | İlk P1 denemesi | Chicago/UTC sınır hatasıyla durdu; düzeltildi | P1 raporu | Hayır |
| 2026-09-17 | `p1-2026-09-17/p0-reaudit.json`, `p0-cohort-rediagnostics.json` | `audit` + tanılama | envanter + train | P1 öncesi P0'ı yeniden doğrulama | P0 ile aynı | P1 raporu | Hayır |
| 2026-09-17 | `p0-2026-09-17/` | `audit`, `review_p0_cohort.py`, güvenlik taramaları | envanter + train | P0: 25 hane muhasebesi, duyarlılık, skill ve bağımlılık kontrolleri | 8 aday; 16 Eylül ile aynı | [P0 karar kaydı](../../docs/project-status/p0-data-decisions-2026-09-17.md), [P0 doğrulama](../../docs/project-status/p0-verification-2026-09-17.md) | Hayır |
| 2026-09-16 | `review-2026-09-16/development-661/` | `baseline` | train → development | Düzeltilmiş baseline, hane 661 | MAE 0,6571; bant kapsaması %91,75; 2.764 / 2.976 slot | [foundation-review](../../docs/architecture/foundation-review.md) | Hayır |
| 2026-09-16 | `review-2026-09-16/data-audit.json` | `audit` (şema 1.1) | envanter + train | Düzeltilmiş denetim (provenance ile) | 8 aday | foundation-review | Hayır |
| 2026-09-16 | `data-audit.json` (kök) | `audit` (şema 1.0) | envanter | İlk kaynak denetimi | Şema 1.1 ile yenilendi | — | Hayır |
| 2026-09-16 | `baseline/661/` → 2026-09-26'da repo dışına taşındı (repo köküne göre `../artifacts-test-seen/baseline-661/`) | `baseline` (ilk foundation) | train → **test** | Hane 661 için ilk baseline | Keşifsel; **metrikleri kullanmayın** | [artifacts/README](../../artifacts/README.md), foundation-review risk 1 | **Evet** |

"Envanter" = tam yıl dosya taraması (bütünlük, anahtarlar); cohort seçimi yalnız train
verisiyle yapılır.
