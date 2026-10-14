---
type: note
area: data
status: aktif
related: [Q-13, Q-14, D-04, D-05, A-05]
updated: 2026-09-27
---

# Kanal envanteri ve metadata: kapsam girdileri

## Soru

Hangi ekipman aileleri için yeterli hane ve veri var? Dataport metadata dosyası hanelerimiz
hakkında ne söylüyor ve verimizle tutarlı mı? Bu not, [kapsam önerisinin](../product/scope-broadening-proposal.md)
(Q-13) veri girdisidir.

## Yöntem

- Yalnız train penceresi (yerel 2018-01-01 – 2018-06-01); test satırları zaman damgası
  çözümlenir çözümlenmez atılıyor. Test dönemine ait değer hesaba girmedi.
- Betikler: [review_hvac_and_energy_balance.py](../../docs/product/ekler/review_hvac_and_energy_balance.py)
  (kanal varlığı, enerji dengesi, negatifler) ve
  [review_metadata_consistency.py](../../docs/product/ekler/review_metadata_consistency.py)
  (metadata özeti, bayrak kontrolü). Çıktılar: `artifacts/data-review-2026-09-27/`.
- Metadata: `../dataset/metadata_pecanstreetdata.csv` (2026-09-27'de eklendi; 2.072 hane,
  130 sütun; SHA-256 `2f476b84…`).

## Kanıt

**Kanal varlığı (train):** 44 kanalda en az bir hanede değer var. En az 20 hanede:
`dishwasher1` 25, `grid` 25, `air1` 24, `clotheswasher1` 24, `furnace1` 24,
`refrigerator1` 23, `microwave1` 22, `kitchenapp1` 20, `solar` 20. En az 10 hanede
olanlar bunlara ek olarak `drye1` 18, `kitchenapp2` 16, `oven1` 16, `disposal1` 15,
`lights_plugs1` 12, `bathroom1` 11, `bedroom1` 11, `dryg1` 10. `car1` 9 hanede;
`waterheater1` ve `freezer1` 2 hanede.

**GES:** `solar` 20 hanede var ama 19'unda üretim var. 5746'nın kanalı tümüyle sıfır ve
metadata'da GES'i yok.

**Enerji dengesi:** İzlenen devrelerin toplamı hane tüketiminin (`grid` + `solar`) medyan
0,720'si (p10 0,532, p90 0,890; en düşük 0,225, en yüksek 0,984). Hane başına değer
taşıyan devre sayısı 8–19 (medyan 14).

**Negatif değerler (19 GES'li hane):** `grid` slotlarının 0,261'i negatif. `solar`
slotlarının 0,518'i negatif: gece çekirdeğinde (21:00–04:59) 0,978, öğle çekirdeğinde
(10:00–14:59) 0,004. En düşük `solar` değeri −0,068.

**Metadata (25 hanemiz):** Hepsi Austin, Texas'ta; 24 müstakil ev, 1 sıra ev (8565).
Yapım yılı 1953–2010 (medyan 2008; 20 hane 2007–2010). Alan 1.625–3.250 ft². GES bayrağı
19 hanede; kapasite 18 hanede kayıtlı (2,88–6,9 kW). EV bayrağı 9 hanede. Dataport'ta iç
ortam sıcaklığı 11 hane için listelenmiş: 1642, 2335, 2818, 3039, 3456, 3538, 4031, 4767,
6139, 7719, 7800. Nest termostatı 6139 ve 7951'de.

**Bayrak ↔ veri:** 75 kanalda 1.875 hane-kanal çiftinin 1.842'si uyumlu (%98,2).
33 uyumsuzluğun 13'ü 5746'da (metadata kaydı eksik). Diğerleri: 4373 (5), 6139 (5;
`refrigerator1` bayrağı var, verisi yok), 9278 (3; `car1` verisi var, bayrağı yok),
3039 (2), 9019 (2), 2361 (`car1`), 4031 (`air1` bayrağı var, verisi yok), 8565 (1).

**Veri kalitesi örneği:** 9160'ta `solar` bir slotta 8,687; kapasitesi 4,5 kW, %99,9
yüzdeliği 3,212.

## Yorum (doğrulanmadı)

- Veri, `air1` dışındaki ailelere de yetiyor: HVAC (`air1` + `furnace1`), buzdolabı ve GES
  en az 19 hanede var. Bulaşık/çamaşır makinesi ve mikrodalga yaygın ama sapmaları
  çoğunlukla kullanıcı tercihidir; arıza hedefi değil, bağlam göstergesi olabilirler.
- İzlenen pay medyan ~%72: tüketimin yaklaşık dörtte biri devre düzeyinde görünmüyor.
  Tüm ev ve taban yük analizi bu payı kapsar.
- `solar`'daki negatifler büyük olasılıkla gece inverter bekleme tüketimi, `grid`'dekiler
  şebekeye verilen elektrik. D-04'te kararlaştırılan ölü bant (2026-10-06) yalnız hedef
  kanal içindir; kural kanal bazında olmalı ve bu kanallara genellenemez.
- Metadata bayrakları "devre tanımlı" demek; 2018'de veri olduğunu garanti etmez.
  Kapsam için veri varlığı esas alınmalı. GES kapasitesi, bina alanı ve yapım yılı
  normalleştirme ve gruplama için kullanılabilir.

## Açık kalan

- Kanal bazında kalite (doluluk oranı, negatif/sıfır, donma, uzun boşluklar): EDA
  notebook'u `02`.
- İç ortam sıcaklığı verisi ücretsiz erişimle alınabilir mi? HVAC sapmalarını açıklamada
  değerli olur (PRD R-03).
- Metadata dosyası config'e eklenmedi; `silentwatt-ml` komutları onu okumuyor.

## Sonraki adım

- EDA notebook'u `02`: kanal kalite matrisi ve aile bazında uygunluk tablosu (Yusuf, 30 Eylül).
- Kapsam önerisinin ekipte görüşülmesi (Q-13, 1–2 Ekim).

## Kaynaklar

- [Kaynak anlamı kanıtları](source-semantics-evidence.md)
- [Negatif air1 değerleri notu](negative-values-sensor-floor.md)
- [P0 karar kaydı](../../docs/project-status/p0-data-decisions-2026-09-17.md): §2 (25 hane muhasebesi)
- [PRD](../../docs/product/SilentWatt-Teknik-PRD-v1.1.md): §4.5 (tarama), §5.2 (DQ-06)
- [Tarihsel envanter](../../docs/product/ekler/dataset-audit-2026-09-15.json)
