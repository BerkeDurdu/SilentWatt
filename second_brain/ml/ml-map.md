---
type: map
area: ml
status: aktif
related: [KPI-01, KPI-02, KPI-03, A-04, Q-01, Q-02, Q-03]
updated: 2026-09-22
---

# ML haritası

Modeller, değerlendirme protokolü, sonuçlar ve sıradaki ML adımları.
Durumlar [decisions.md](../decisions.md)'de tutulur.

## Yetkili kaynaklar

| Ne | Nerede |
|---|---|
| Pipeline sınırı ve backend sözleşmesi | [ml-pipeline.md](../../docs/architecture/ml-pipeline.md) |
| Önceden dondurulmuş P1 protokolü | [p1-ml-protocol.md](../../docs/architecture/p1-ml-protocol.md) |
| P1 sonuçları (development) | [P1 raporu](../../docs/project-status/p1-ml-results-2026-09-17.md) |
| Komutlar ve çıktı biçimleri | [packages/ml/README.md](../../packages/ml/README.md) |
| Ayarlar (`baseline`, `p1` blokları) | [configs/ml/austin-2018.json](../../configs/ml/austin-2018.json) |
| Tahmin görevi, dönemler, konformal profil | PRD §7 |
| Anomali tespiti, kanıt, sentetik deneyler | PRD §8–10 |
| Değerlendirme sözleşmesi ve KPI'lar | PRD §15 ([PRD](../../docs/product/SilentWatt-Teknik-PRD-v1.1.md)) |
| Koşuların listesi | [experiment-log.md](experiment-log.md) |

## Mevcut modeller ve protokol

- **Dönemler:** train Ocak–Mayıs, calibration Haziran, development Temmuz, test
  Ağustos–Aralık (kapalı).
- **B0:** 2 °C sıcaklık kutusu × yerel saat için ampirik kuantiller; sıcaklık-yalnız ve
  global yedekler.
- **B1:** hane başına HistGradientBoosting kuantil modeli (q05/q50/q95). Ayar taraması yok;
  seed 42, early stopping kapalı.
- **Kalibrasyon:** split CQR, alpha 0,1, yalnız Haziran verisi. En az 14 uygun gün ve
  1.000 slot; yoksa `calibration_pending`.
- **Değerlendirme:** yalnız Temmuz; iki model aynı slotlarda karşılaştırılır. Birincil
  ölçüt eşit hane ağırlıklı pinball; B1 seçim kuralı protokolde.

## Sonuç (P1, 2026-09-17)

- Karar `retain_B0`. Eşit hane ağırlıklı pinball: B0 0,168172, B1 0,216709.
- Kalibre kapsama: B0 %86,687, B1 %84,370; ikisi de %87–93 hedefinin altında (Q-03).
- Skorlanan pay 13.423 / 23.808 slot (%56,38). Ana nedenler: günlük kalite kapıları ve
  destek dışı sıcaklıklar (A-04).
- B1, 8 hanenin 2'sinde (1642, 7800) daha iyi, 6'sında daha kötü.

## Kod ve testler

| Dosya | Sorumluluk |
|---|---|
| [cli.py](../../packages/ml/src/silentwatt_ml/cli.py) | `audit`, `baseline`, `compare` komutları |
| [baseline.py](../../packages/ml/src/silentwatt_ml/models/baseline.py) | B0 eğitimi ve tahmini, veri hazırlığı |
| [calibration.py](../../packages/ml/src/silentwatt_ml/models/calibration.py) | Hane bazında CQR |
| [comparison.py](../../packages/ml/src/silentwatt_ml/models/comparison.py) | Dönem sınırları ve B0/B1 orkestrasyonu |
| [evaluation.py](../../packages/ml/src/silentwatt_ml/models/evaluation.py) | Hane/ay metrikleri, eşleştirilmiş karşılaştırma |
| [provenance.py](../../packages/ml/src/silentwatt_ml/provenance.py) | Config, kaynak ve kod hash'leri |

Testler: `packages/ml/tests/` altında 35 sentetik test; CI'da çalışır. Notebook'un 2 erişim
testi (`notebooks/test_support.py`) CI dışında (Q-07).

## Dikkat edilecekler

- Bant kapsaması olay yakalama oranı veya arıza olasılığı değildir.
- Kalibrasyon ayında görülen %90, Temmuz için %90 garantisi değildir.
- P1'deki B0, eski baseline ile aynı tahmincidir ama farklı (kalite kapısından geçmiş)
  eğitim verisi kullanır.
- B1'in bu ayarı başarısız oldu; bu, bütün kuantil boosting ailesinin başarısız olduğu
  anlamına gelmez.
- Hane 661'in test sonuçları keşif amaçlıdır; kör test sayılmaz (Q-02).

## Henüz olmayanlar (PRD)

- Akut ve kronik dedektör (§8.2–8.3); vaka birleştirme (§8.5).
- 1 dakikalık çalışma imzası (§9.1).
- Sentetik enjeksiyon benchmark'ı (§10).
- Model paketi ve kanıt JSON'u (§7.5, §11.2; Q-04).
- Uyarlanabilir kalibrasyon.

## Açık konular

KPI durumu, Q-01 (donma kuralının eğitim verisine etkisi), Q-02 (kör test verisi),
Q-03 (kapsama), A-04 (mevsim desteği), D-04 (negatif politikası eğitim popülasyonunu
etkiliyor). Ayrıntı: [decisions.md](../decisions.md).
