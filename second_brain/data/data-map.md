---
type: map
area: data
status: aktif
related: [D-01, D-02, D-03, D-04, D-05, A-03, A-04, Q-01, Q-13, Q-14]
updated: 2026-09-27
---

# Veri haritası

Veri kaynakları, kalite kuralları ve cohort seçimiyle ilgili her şeyin giriş noktası.
Durumlar [decisions.md](../decisions.md)'de tutulur.

## Yetkili kaynaklar

| Ne | Nerede |
|---|---|
| Veri sınırı ve dosya adları | [data/README.md](../../data/README.md) |
| Veri profili ve kalite kuralları (DQ-01…DQ-10), kohort kabulü | [PRD §4–5](../../docs/product/SilentWatt-Teknik-PRD-v1.1.md) |
| Dosya, kolon, dönem ve cohort ayarları | [configs/ml/austin-2018.json](../../configs/ml/austin-2018.json) |
| 25 hanenin seçim muhasebesi, duyarlılık, D-01…D-05 | [P0 karar kaydı](../../docs/project-status/p0-data-decisions-2026-09-17.md) |
| Günlük kalite politikası v1 | [P1 protokolü](../../docs/architecture/p1-ml-protocol.md) |
| Bağımsız yeniden hesap ve grafikler | [Veri anlama notebook'u](../../notebooks/01_data_understanding.ipynb) · [README](../../notebooks/README.md) |
| Tarihsel envanter (15 Eylül) | `docs/product/ekler/dataset-audit-2026-09-15.json`, [review_p0_cohort.py](../../docs/product/ekler/review_p0_cohort.py) |
| Birim, aralık, HVAC ve metadata kontrolleri (27 Eylül, train) | [kaynak anlamı notu](source-semantics-evidence.md), [kanal notu](channel-inventory-and-metadata.md), `docs/product/ekler/review_*.py` |

## Kod

| Modül | Sorumluluk |
|---|---|
| [readers.py](../../packages/ml/src/silentwatt_ml/data/readers.py) | CSV okuma, hash, parça parça tarama |
| [quality.py](../../packages/ml/src/silentwatt_ml/data/quality.py) | Zaman damgası, ızgara maskesi, geçerli hedef (`valid_target`), hava çerçevesi |
| [audit.py](../../packages/ml/src/silentwatt_ml/data/audit.py) | Kaynak denetimi ve cohort kararı (`training_cohort_record`) |
| [daily.py](../../packages/ml/src/silentwatt_ml/data/daily.py) | Günlük kalite kapıları (`daily_quality`) |

## Kaynaklar (P0 §1, 2026-09-17; metadata 2026-09-27)

| Kaynak | Satır | Not |
|---|---|---|
| 15 dk elektrik | 873.286 | 25 hane; model girdisi |
| 1 dk elektrik | 13.100.539 | 2,6 GB; envanter ve 1 dk/15 dk hizalama kontrolü (train) |
| Saatlik hava (Open-Meteo) | 8.760 | °C; aynı UTC saatine eşlenir |
| Dataport metadata | 2.072 hane | 130 sütun; `../dataset/metadata_pecanstreetdata.csv`; config'te yok, komutlar okumuyor |

## Uygulanan kurallar (özet)

- **Zaman:** Elektrik zamanları UTC'ye çevrilir; yerel gün `America/Chicago`; günde 92/96/100 slot.
- **Geçerli hedef:** Dönemde, ızgarada, tekil, sonlu ve ≥ 0. Negatifler onaya kadar geçersiz (D-04).
- **Cohort:** Train geçerli kapsamı ≥ %95; `air2`/`airwindowunit1` train'de gözlenmemiş;
  yinelenen anahtar yok. Sonuç 25 → 9 → 8 → 8
  ([notebook](../../notebooks/01_data_understanding.ipynb), bölüm D).
- **Günlük kalite v1:** Günlük hedef+hava kapsamı ≥ %95; donma şüphesi olan gün dışlanır;
  tek slotu bile destek dışı olan gün dışlanır.
- **Hava:** Aynı UTC saatine eşleme; ileri/geri doldurma yok.

## Bilinen tuzaklar

- Yıllık kapsamla aday seçmek geleceği sızdırır; eski 20 adaylık liste yalnız envanterdir.
- `America/Chicago` yalnız saat dilimi adıdır; veri Austin'den gelir.
- Boş bir kanal (ör. `air3`) cihazın olmadığını kanıtlamaz.
- Hava eşlemesi bir hesap kabulüdür; fiziksel interval doğrulaması değildir (D-02).
- 1 dk dosyası parça parça okunur; bütünüyle belleğe alınmaz.
- Test dönemine ait hedefler analizde kullanılmaz. Notebook'taki katı okuyucular:
  [_support.py](../../notebooks/_support.py).
- Metadata bayrağı "devre tanımlı" demektir; 2018'de veri olduğunu garanti etmez
  (ör. 4031 `air1`, 5746).
- `solar` ve `grid`'deki negatifler fiziksel (gece inverter tüketimi, şebekeye verme);
  `air1` için konan negatif kuralı bu kanallara uygulanmaz.

## Açık konular

D-01, D-02 (birim, interval; öneri hazır) · D-03 (`air1` eşlemesi; kanıt toplanıyor) ·
D-04 (negatifler) · D-05 (cohort onayı) · A-03 (hava kaynağı) · A-04 (mevsim desteği) ·
Q-01 (donma / standby) · Q-13 (kapsam) · Q-14 (test dönemi tüm kanallarda kapalı).
Ayrıntı: [decisions.md](../decisions.md).

## Notlar

- [Negatif air1 değerleri ve sensörün sıfır seviyesi](negative-values-sensor-floor.md)
- [Kaynak anlamı: birim, 15 dk aralığı ve HVAC kanalları](source-semantics-evidence.md)
- [Kanal envanteri ve metadata: kapsam girdileri](channel-inventory-and-metadata.md)
