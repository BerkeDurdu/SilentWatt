---
type: guide
area: process
updated: 2026-09-22
---

# Sözlük

Kısa tanımlar; ayrıntı kaynakta. Yeni terim çıkınca buraya eklenir.
Kısaltmalar: P0 = [P0 karar kaydı](../docs/project-status/p0-data-decisions-2026-09-17.md),
P1 = [P1 raporu](../docs/project-status/p1-ml-results-2026-09-17.md),
Protokol = [P1 protokolü](../docs/architecture/p1-ml-protocol.md),
PRD = [Teknik PRD v1.1](../docs/product/SilentWatt-Teknik-PRD-v1.1.md).

## Veri

| Terim | Anlamı | Kaynak |
|---|---|---|
| `air1` | Hedef kanal. Klima/soğutma devresi olduğu varsayılıyor; fiziksel eşleme doğrulanmadı. Ürün dili: "air1 kanal sapması". | D-03, PRD §3.1 |
| Kaynak birimi (source unit) | Elektrik değerlerinin birimi doğrulanmadı; kW/kWh diye sunulmaz. | D-01 |
| Slot | 15 dakikalık zaman aralığı. Normal gün 96, ileri saate geçiş günü 92, geri saate geçiş günü 100 slot. | PRD §5.3 |
| Beklenen slot (payda) | Takvimden hesaplanan slot sayısı; dosyadaki satır sayısı değil. Train: 14.492 / hane. | P0 §2 |
| Geçerli slot | Dönem içinde, 15 dk ızgarasında, tekil anahtarlı, sonlu ve ≥ 0 hedef. | P0 §2 |
| Veri kapsamı | Geçerli slot / beklenen slot. Bant kapsamasıyla karıştırılmamalı. | P0 §2 |
| Cohort / teknik aday | Train kapsamı ≥ %95, `air2`/`airwindowunit1` gözlenmemiş, yinelenen anahtar yok. Sağlıklı cihaz anlamına gelmez. | P0 §2, D-05 |
| Ek kanal kuralı | `air2` veya `airwindowunit1` train'de bir kez bile doluysa (sıfır dahil) hane dışlanır. | [config](../configs/ml/austin-2018.json) |
| Dönemler (split) | Train Oca–May, calibration Haz, development Tem, test Ağu–Ara (kapalı). Sınırlar yerel tarihtir. | [config](../configs/ml/austin-2018.json) |
| Günlük kalite kapısı | Günlük hedef+hava kapsamı ≥ %95, donma şüphesi yok, sıcaklık destek içinde. | Protokol |
| Donma şüphesi | 16 ardışık özdeş pozitif değer (4 saat); 16. slottan itibaren işaretlenir; sıfırlar muaf. Doğrulanmış arıza değildir. | Protokol, Q-01 |
| Sıcaklık desteği | Hanenin kalite sonrası train slotlarındaki sıcaklık min–max aralığı. | Protokol |
| Destek dışı (out of support) | Sıcaklık bu aralığın dışında. Günün tek slotu bile öyleyse gün dışlanır. | Protokol, A-04 |
| Ölü bant (deadband) | Öneri: mutlak değeri ε'dan küçük veya eşit okumalar "kapalı" sayılır. Henüz kural değil. | [not](data/negative-values-sensor-floor.md) |

## Model ve değerlendirme

| Terim | Anlamı | Kaynak |
|---|---|---|
| B0 | Ampirik baseline: 2 °C sıcaklık kutusu × yerel saat için kuantiller; sıcaklık-yalnız ve global yedekler. | Protokol |
| B1 | Hane başına HistGradientBoosting kuantil modeli (q05/q50/q95). | Protokol |
| Kuantil (q05, q50, q95) | Beklenen tüketimin %5, %50 ve %95 seviyeleri; q05–q95 tahmin bandını verir. | PRD §7.3 |
| Pinball kaybı | Kuantil tahmin hatası; düşük daha iyi. Birincil ölçüt: eşit hane ağırlıklı ortalama. | P1 |
| Bant kapsaması | Gerçek değerin banda düşme oranı (nominal %90, hedef %87–93). Olay yakalama oranı veya arıza olasılığı değildir. | KPI-02 |
| CQR | Conformalized quantile regression. Bandı yalnız calibration (Haziran) hatalarından hesaplanan qhat kadar genişletir. | Protokol |
| qhat | CQR'ın bant düzeltme payı; ≥ 0. | P1 |
| `calibration_pending` | Hanede 14 uygun gün ve 1.000 slot yoksa kalibre sınırlar boş kalır. | Protokol |
| `retain_B0` / `insufficient_evidence` | Karşılaştırma kararları: B0 korunur / karar için yeterli kanıt yok. | Protokol |
| Development taraması | Temmuz'daki model karşılaştırması; kabul testi değildir. | P1 |
| Akut / kronik dedektör | Ani ve yavaş tüketim sapmasını yakalayacak dedektörler; henüz yok. | PRD §8 |
| Sentetik enjeksiyon | Veriye kontrollü sapma ekleyip dedektör başarısını ölçme; henüz yok. | PRD §10 |

## Proje ve süreç

| Terim | Anlamı | Kaynak |
|---|---|---|
| Rol A / B / C | A: Berke Durdu (UX/frontend), B: Muharrem Dokgöz (backend/veri/bulut), C: Yusuf Ziya Demirel (AI/ML). | PRD §3.2 |
| P0 / P1 | Teslim aşamaları. P0: veri denetimi ve cohort kararları; P1: kalibre ML temeli. İkisi de 2026-09-17. | [log](log.md) |
| G0–G4 | Sürüm kapıları: veri hazır, analitik hazır, ürün akışı, işletim, iddia kontrolü. | PRD §19.3 |
| KPI-01…09 | Başlangıç kabul hedefleri; test döneminde ölçülecek. | PRD §15.2 |
| ID önekleri | `D-` veri kararı, `C-` değişiklik önerisi (P0); `A-` varsayım, `R-` risk, `DQ-` kalite kuralı, `FR-`/`NFR-` gereksinim (PRD); `Q-` second_brain açık sorusu. | [decisions.md](decisions.md) |
| Provenance | Koşunun config, kaynak ve kod hash'leri ile runtime sürümleri. | [ML README](../packages/ml/README.md) |
| Artifact | Git dışındaki koşu çıktısı (`artifacts/`). | [artifacts/README](../artifacts/README.md) |
