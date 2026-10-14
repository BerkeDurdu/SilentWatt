# Dedektör koşusu — gerçek veriyle ilk kanıt dosyaları (p1-v3)

Tarih: 14 Ekim 2026. Dal: `develop` (yerel). Kapsam: `silentwatt-ml detect` komutu. Bu komut
Pecan Street Austin 15 dakikalık verisinden ve Open-Meteo sıcaklığından `silentwatt.evidence/0.2`
kanıt dosyaları üretir. Konsol bu dosyaları değişiklik yapmadan okur.

**Sonuç:**
- **Hane sayısı:** 23 hane değerlendirildi: klimada 21, buzdolabında 19, güneş panelinde 19.
- **Gözlenen vakalar:** Temmuz'da değiştirilmemiş veride 11 cihaz sapması (klima 4, buzdolabı 7) ve 13
  veri sorunu çıktı.
- **Doğrulama senaryoları:** Temmuz verisinin kopyalarına eklenen 75 senaryodan 62'si yakalandı.
- **Sınır:** Bu bir arıza tespit başarısı iddiası değildir. Gözlenen vakaların etiketi yoktur, senaryolar
  bilerek eklenmiş değişikliklerdir, birimler doğrulanmamış kaynak birimidir.

## Nasıl koşulur

```bash
PYTHONPATH=packages/ml/src python -m silentwatt_ml detect \
  --data-dir <csv klasörü> --output artifacts/evidence/<run-id> --set-current
```

- `--config` verilmezse `configs/ml/austin-2018-detect.json` kullanılır.
- `--set-current` seçeneği `artifacts/evidence/CURRENT` dosyasını yazar. Yerel konsol bu dosyadaki
  koşuyu açar; `SILENTWATT_EVIDENCE_DIR` verilirse o önceliklidir.
- Ölçümler `artifacts/` altında kalır ve depoya girmez. Veri lisansı nedeniyle ham seriler paylaşılmaz.
- Koşu dizüstü bilgisayarda yaklaşık 30 saniye sürer.

## Protokol

| Adım | Ne yapılır |
| --- | --- |
| Veri | Yalnız Ocak–Temmuz okunur. Ağustos–Aralık (kör test) satırları okuyucudan çıkmadan atılır |
| Eğitim | Ocak–Mayıs (train). Haziran eğitime girmez (A-04) |
| Kalibrasyon | Haziran, **p1-v3**: alt ve üst sınır ayrı ayrı, her biri α/2 ile (asimetrik CQR, Q-03) |
| Referans ayı | Haziran: z'nin medyanı ve ölçeği, cihazın düzeyi ve eşik seçimi |
| Değerlendirme | Temmuz (development) |

| Aile | Kanal | Referans (`expected_from`) | Vaka türü |
| --- | --- | --- | --- |
| Klima | `air1` | Dış sıcaklık × saat (B0); cihazın Haziran düzeyi; komşu hanelerin aynı günkü ortak değişimi | tüketim sapması |
| Buzdolabı | `refrigerator1` | Aynı yöntem. Buzdolabı içeride durduğu için sıcak gün destek dışı sayılmaz, sıcaklık eğitim aralığına sıkıştırılır | tüketim sapması |
| Güneş paneli | `solar` | Kapasite (train'deki üretimin 99. yüzdeliği) × aynı anda diğer sistemlerin normalize üretiminin medyanı; Haziran düzeyi | üretim açığı |

**Eşikler:** Kural (6 Ekim kararı) şudur: Haziran'da alarm bütçesini aşmayan en hassas ızgara noktası
seçilir. Bütçe aile başına ayda en fazla 1 akut ve 1 kronik vakadır. Seçilen değer Temmuz'da
değiştirilmez.

| Aile | Akut (z / aşım payı / gün) | Kronik (k / h) | Haziran vakası |
| --- | --- | --- | --- |
| Klima | 1,5 / %10 / 2 | 1,0 / 5 | 0 akut, 0 kronik |
| Buzdolabı | 1,5 / %40 / 2 | 0,5 / 15 | 1 akut, 0 kronik |
| Güneş paneli | 1,5 / %10 / 2 | 0,5 / 3 | 0 akut, 0 kronik |

Haziran'daki z, aynı Haziran günlerinden ölçeklenir. Bu yüzden Haziran'daki vaka sayısı iyimserdir
(örneklem içi). Temmuz sonuçlarının bütçeyi aşması bu nedenle beklenen bir durumdur.

## Sonuçlar (Temmuz, değiştirilmemiş veri)

| | Klima | Buzdolabı | Güneş |
| --- | --- | --- | --- |
| Değerlendirilen hane | 21 | 19 | 19 |
| Cihaz sapması | 4 | 7 | 0 |
| Veri sorunu (bütçe dışı) | 5 | 3 | 5 |

- **Bütçe:** Klima ve güneş bütçe içinde, buzdolabı bütçenin üstünde: 7 vaka, bütçe ayda 2. Buzdolabı
  vakalarının çoğu Haziran'a göre %14–18'lik uzun (24–29 gün) bir artış. Mevsimsel olabilir
  (yaz mutfağı, daha sık kapı açma); bir eşik veya model kararı gerektirir.
- **Değerlendirilen gün:** 1.509 hane-gün puanlandı. Klimada Temmuz'un sıcak günleri eğitim desteği
  dışında kaldığı için değerlendirilemedi (A-04); ekranda "değerlendirilemedi" olarak görünür.

## Doğrulama senaryoları

Her senaryo 4–17 Temmuz içinde, o ailede vakası olmayan **bütün** hanelere eklenir. Hane başına sayılır.

| Senaryo | Eklenen | Yakalanan | Medyan gecikme |
| --- | --- | --- | --- |
| Klima · basamak +%30, 7 gün | 13 | 7 | 2 gün |
| Klima · kademeli +%40, 14 gün | 13 | 10 | 10 gün |
| Klima · veri kesintisi, 3 gün | 13 | 13 | 1 gün |
| Klima · donmuş ölçüm, 3 gün | 13 | 13 | 1 gün |
| Buzdolabı · basamak +%40, 7 gün | 9 | 6 | 4 gün |
| Güneş · üretim düşüşü −%35, 7 gün | 14 | 13 | 0 gün |

Kanıt dizinine senaryo başına bir örnek vaka yazılır (6 dosya). Değerlendirme sayıları bütün
eklemelerden gelir.

## Temmuz'a bakılarak yapılan model seçimleri (açıkça)

İlk koşuda klimada 15 kronik vaka çıktı. 15 hanenin 11'inde Temmuz'un medyan z değeri 0,9 ile 2,1
arasındaydı, yani ilkbaharda eğitilmiş model bütün evlerde Temmuz'u birlikte düşük tahmin ediyordu
(Q-19, mevsim kayması). Eşiklere dokunulmadı. Q-19'un izin verdiği şekilde (kör test kapalı,
karşılaştırma Temmuz'da) şu model seçimleri karşılaştırıldı ve eklendi:

| Seçim | Neden | Etki (gözlenen sapma / yakalanan senaryo) |
| --- | --- | --- |
| Başlangıç (Ocak–Mayıs eğitim) | — | 19 / 36 (50 eklemede) |
| Eğitimi Nisan–Mayıs veya yalnız Mayıs ile sınırlamak | Sezon içi eğitim | 18 ve 14; kayma sürdü, **seçilmedi** |
| Komşu düzeltmesi | Aynı gün bütün evleri birlikte yükselten değişim (hava, mevsim) arıza değildir; hanenin kendi sapması kendi çarpanına girmez | klima 15 → 5 |
| Haziran düzeyi | Haziran dedektörün referans ayıdır. Model bir cihazın Haziran'daki gerçek düzeyinin üstünde ya da altında kalıyorsa, z ile ekrandaki "%X üzerinde" farklı şeyleri ölçer | yakalanan 49/70 → 62/75 |
| Göreli ölçek tabanı (%5) | Çok düzgün bir Haziran küçük kaymaları büyük z yapmasın | — |
| En küçük etki (%10) | Referansın %10'undan küçük bir fark ekranda vaka olarak gösterilmez | — |

Bu seçimler 14 Ekim'de, Temmuz sonuçları görüldükten sonra yapıldı. Resmî sayılar ancak ekip
onayından ve sonraki bir veri döneminde tekrar koşulduktan sonra kesinleşir. Öneri: Q-20.

## Sınırlar

- Haziran hem z ölçeğini hem eşik seçimini belirliyor (örneklem içi).
- Gözlenen Temmuz vakaları etiketli arıza değildir; alarm bütçesine sayılırlar.
- Güneş referansı komşu sistemlerin medyanını izler. Sistemlerin çoğunu birlikte etkileyen bir sorun
  (bölgesel kesinti) gizlenir.
- Komşu düzeltmesi ortak bir arızayı da (aynı hafta birçok klimanın bozulması) gizler; bu durum olası
  değildir ama sıfır da değildir.
- Hafta günü etkisi modelde yoktur (Q-16).
- Ayrıntılar (her hanenin durumu, kalibrasyon payları, Haziran referansı, senaryo başına z değerleri)
  koşu dizinindeki `run-report.json` dosyasında.
