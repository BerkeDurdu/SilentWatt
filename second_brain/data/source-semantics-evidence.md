---
type: note
area: data
status: aktif
related: [D-01, D-02, D-03, A-01, A-02, R-04]
updated: 2026-09-27
---

# Kaynak anlamı: birim, 15 dk aralığı ve HVAC kanalları

## Soru

Elektrik değerlerinin birimi ne (D-01)? Bir 15 dk değeri hangi dakikaları özetliyor ve
zaman damgası aralığın neresi (D-02)? `air1` ve `furnace1` hangi cihazları ölçüyor (D-03)?

## Yöntem

- **Web (2026-09-27):** Pecan Street sayfaları ve üçüncü taraf Dataport kaynakları
  (Kaynaklar bölümü). Resmî "Metadata Data Dictionary" Dataport girişi istediği için okunmadı.
- **Veri:** Üç betik, yalnız train penceresi (yerel 2018-01-01 – 2018-06-01). Test satırları
  zaman damgası çözümlenir çözümlenmez atılıyor (P1 standardı); test dönemine ait hiçbir
  değer hesaba girmedi. Metadata: `../dataset/metadata_pecanstreetdata.csv`.
- **Betikler:** [review_unit_magnitudes.py](../../docs/product/ekler/review_unit_magnitudes.py),
  [review_resolution_alignment.py](../../docs/product/ekler/review_resolution_alignment.py),
  [review_hvac_and_energy_balance.py](../../docs/product/ekler/review_hvac_and_energy_balance.py).
  Çıktılar Git dışında: `artifacts/data-review-2026-09-27/`
  ([koşu kaydı](../ml/experiment-log.md)).
- **İlk sürüm:** Aynı sorular önce geçici betiklerle çalıştı; repo betikleri aynı sayıları
  verdi. İki payda düzeltildi: `grid` negatif payı artık yalnız üreten 19 GES'li hanede
  hesaplanıyor (5746 dahilken 0,248, şimdi 0,261). Soğuk/sıcak `air1` payları eksik
  değerleri paydaya katmıyor (9278'in sıcak havadaki payı 0,642 yerine 0,872).

## Kanıt

**Birim (D-01)**
- Pecan Street'in ücretsiz veri sayfası (2025) örnek veri için "Real Power (kW)" diyor.
  2019 duyurusundaki "real power is measured in watts" fiziksel büyüklüğün birimidir,
  dosyadaki değerlerin birimi değil. Üçüncü taraf bir Dataport aracı: "Load is in average
  kW per interval".
- Metadata'daki GES kapasitesiyle karşılaştırma (kW): 18 hanede train dönemindeki %99,9
  yüzdelik üretim, kapasitenin 0,636–0,827'si (medyan 0,750).
- Hane bazında %99 yüzdeliklerin medyanı / en büyük değer (kaynak birimi): `air1`
  2,581 / 4,681; `refrigerator1` 0,281 / 0,683; `solar` 4,151 / 8,687; `grid`
  4,339 / 16,461; `car1` 3,354 / 6,902; `drye1` 2,454 / 5,682.

**15 dk aralığı (D-02)**
- 25 hane, 6 kanal (`air1`, `furnace1`, `refrigerator1`, `solar`, `grid`, `car1`),
  1.768.207 tam aralık (15 dakikanın hepsi mevcut).
- Hipotez A (etiket t, dakikalar t … t+14): altı kanalda da farkların %100'ü tolerans
  içinde; en büyük fark 0,000467; toleransı aşan hane yok.
- Hipotez B (t−15 … t−1) ve C (t−14 … t): hemen her hanede tolerans dışı; ör. `grid`'de
  pencerelerin yalnız %1,3–1,4'ü tolerans içinde.
- Tolerans 0,0011: iki dosya da 0,001'e yuvarlı, bu yüzden 0,001'e kadar fark beklenir.

**HVAC kanalları (D-03)**
- Pecan Street veri sayfası HVAC kompresörünü ve iç ünite (air handler) devresini ayrı
  gösteriyor.
- `air1` > 0,5 iken `furnace1` > 0,1 olan slot payı: 23 hanede medyan 1,000, ortalama
  0,928, en düşük 0,222.
- Soğukta (< 5 °C) `air1` > 0,3 payı: 9278'de 0,768, diğer hanelerde en fazla 0,002.
- Soğukta `furnace1` %95 yüzdeliği: 21 hanede 0,110–1,015; 7951'de 3,306 (sıcakta 0,152).

## Yorum (doğrulanmadı)

- **D-01:** Değerler büyük olasılıkla kW cinsinden aralık ortalaması gerçek güç. kW olarak
  okunduğunda bilinen cihaz güçleriyle örtüşüyor (ev tipi EV şarjı ~3,3 kW, buzdolabı
  0,3–0,7 kW). 15 dk kWh olsaydı GES oranı ~0,19, watt olsaydı 0,001'in altında olurdu.
  Enerji = güç × 0,25 saat.
- **D-02:** 15 dk değer, [t, t+15) içindeki 1 dk değerlerin ortalaması; etiket aralığın
  başı. İki dosya aynı ölçümün iki çözünürlüğü; bağımsız veri değil (PRD §4.3). Veriden
  çözülemeyen tek nokta, 1 dk etiketinin dakikanın başı mı sonu mu olduğu (en fazla bir
  dakikalık kayma).
- **D-03:** `air1` dış ünite kompresörü, `furnace1` iç ünite fanı gibi davranıyor. Isıtma
  çoğu hanede elektrik dışı görünüyor (muhtemelen gaz). 9278 büyük olasılıkla ısı pompası,
  7951'de büyük olasılıkla elektrikli dirençli ısıtma var. HVAC tüketimi `air1` +
  `furnace1` olarak ele alınmalı.

## Açık kalan

- Resmî veri sözlüğüyle son teyit.
- D-01 ve D-02 için B+C karar kaydı. Kapanana kadar `AGENTS.md`'deki
  `source_unit_unverified` kuralı geçerli; raporlarda kW/kWh dili yok.
- D-03 için hane bazında fiziksel eşleme: metadata'da HVAC tipi alanı yok.

## Sonraki adım

- 1–2 Ekim ekip toplantısında D-01 ve D-02 kararı (Yusuf + Muharrem). Karar sonrası
  `AGENTS.md` değişmezi, rapor dili ve [sözlük](../glossary.md) güncellenir.
- Bu kontrolleri EDA notebook'u `02`'ye taşımak (Yusuf).

## Kaynaklar

- [P0 karar kaydı](../../docs/project-status/p0-data-decisions-2026-09-17.md): §5 (D-01…D-03)
- [PRD](../../docs/product/SilentWatt-Teknik-PRD-v1.1.md): §4.2–4.5, §19.2 (A-01, A-02)
- [Kanal envanteri ve metadata](channel-inventory-and-metadata.md)
- [Pecan Street — free residential datasets (2025)](https://www.pecanstreet.org/2025/07/public-data/)
- [Pecan Street — Dataport update (2019)](https://www.pecanstreet.org/2019/06/new-dataport/)
- [Pecan Street Data Sheet (Şubat 2025)](https://www.pecanstreet.org/wp-content/uploads/2025/02/Pecan-Street-Data-Sheet-Feb-2025.pdf)
- [marcus-voss/pecanstreet-load](https://github.com/marcus-voss/pecanstreet-load/blob/master/README.md)
