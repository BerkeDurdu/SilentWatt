# P1 ML temeli — geliştirme değerlendirmesi

Tarih: 17 Eylül 2026. Dal: `feat/ml-foundation`. Kapsam: P0 yeniden doğrulama,
kalibrasyon, günlük kalite kapıları ve çok haneli B0/B1 development karşılaştırması.

**Sonuç:** 8 hanede iki model için de ayrı Haziran kalibrasyonu üretildi.
Temmuz development karşılaştırmasında **B0 korunur**; B1 daha iyi ilan edilmez.
Her iki model de kalibre edilmiş olsa da toplam development kapsaması hedef
%87–93 aralığının altında. Bu teslim üretim veya fiziksel arıza başarısı onayı değildir.

## P0 geçiş kontrolü ve düzeltme

- P0 `0ccdfb5` commit'i, PR #1, uzak head ve ML/web/GitGuardian sonuçları doğrulandı.
- 18 eski test, pip check, typecheck/build tekrar geçti. Tam kaynak audit'i önceki
  audit ile zaman alanı dışında aynı; cohort diagnostikleri de birebir aynı.
- **Bulunan hata:** “172 HTML kontrolü geçti” iddiası çıktı satır sayımı ve exit-code
  maskeleme hatasıydı. Gerçek sonuç 165 dosyada 163 PASS / 2 katalog FAIL.
  `icons.html` ve `index.html` bağımsız diyagram değildir; atıf bağlantıları, yerel
  iframe ve galeri script'i manuel incelendi. 163 örnek/şablon ayrıca exit=0 ile geçti.
- Rapor ve PR açıklaması düzeltildi; `ec58b9a` ayrı P0 düzeltme commit'i olarak
  P1 kodundan önce kaydedildi/push edildi. Ders `tasks/lessons.md` içinde.
- Birim, interval, `air1`, negatiflerin anlamı ve ekip cohort onayı açık.
  P0 bu belirsizlikleri kanıtla kaydetmeyi tamamladı; G0 veri hazır kapısı açık kalır.

## Uygulanan P1 sözleşmesi

[Önceden kaydedilen protokol](../architecture/p1-ml-protocol.md),
[config](../../configs/ml/austin-2018.json),
[çalıştırma komutları](../../packages/ml/README.md).
`senior-data-scientist` + `data-quality-auditor` seçim/kalite/ölçüm sınırlarında;
`senior-ml-engineer` CQR ve pipeline sınırlarında; `ponytail` kod değişikliklerinde
uygulandı. Mevcut Express/UI ve bağımlılıkların temel kilidi korunuyor.

- Train: Ocak–Mayıs, calibration: Haziran, development: Temmuz. Yeni `compare`
  komutunda test seçeneği yok. Tam dosya hash'leri hesaplanır, fakat test ölçümleri
  hedef temizleme, kalite değerlendirmesi, eğitim, kalibrasyon ve seçime girmeden ayrılır.
- B0 mevcut ampirik sıcaklık/saat kuantilleri; B1 aynı bilgiyle hane bazında üç
  HistGradientBoosting kuantil modeli. Ayar taraması yapılmadı; seed 42, 100 iterasyon,
  15 yaprak, learning_rate 0,1, minimum yaprak 20; shuffled early stopping kapalı.
- İki model aynı kalite-kabul edilmiş train satırlarında eğitilir. Bu nedenle P1 B0,
  eski baseline komutunun **aynı tahmincisi ama farklı eğitim popülasyonudur**.
- CQR yalnız calibration skorlarını ve sonlu örneklem sıra istatistiğini kullanır;
  qhat≥0, alt sınır≥0, kuantil sırası kalibrasyondan önce düzeltilir. En az 14 uygun
  gün/1.000 slot gereklidir; aksi halde null bantlı `calibration_pending`.
- Kalite: DST uyumlu yerel gün paydası, eksik satır/null/negatif/geçersiz hedef,
  eksik hava, %95 günlük ortak kapsam, geçmişe bakan donma şüphesi ve train sıcaklık
  desteği. Kapıdan geçen günlerin geçerli slotları birincil metrik paydasıdır.
  Ayrıca günlük kapıdan bağımsız destekli-slot diagnostikleri yayımlanır.
- Donma şüphesi: 16 ardışık özdeş pozitif slot; sıfır/off hariç, NaN/boşluk run'ı
  keser, ilk 15 slot geleceğe bakarak geriye dönük işaretlenmez. Bu sürümlü geçici
  araştırma eşiği fiziksel sensör doğrulaması değildir; sonuçlara bakıp değiştirilmedi.

## Development — Temmuz 2018

Birimler **doğrulanmamış kaynak birimi**. Pinball, ham sıralanmış q05/q50/q95
kayıplarının aritmetik ortalamasıdır; CQR alt/üst sınırları özgün kuantiller gibi
puanlanmaz. Bant kapsaması noktasaldır; arıza olasılığı veya olay recall'u değildir.

| Metrik | B0 | B1 |
| --- | ---: | ---: |
| Beklenen slot | 23,808 | 23,808 |
| Skorlanan slot | 13,423 | 13,423 |
| MAE | 0.687745 | 0.991388 |
| Ortalama pinball (slot ağırlıklı) | 0.165005 | 0.215685 |
| Ham kapsama | %81.115 | %79.677 |
| Ham bant genişliği | 1.914280 | 1.924881 |
| Kalibre kapsama | %86.687 | %84.370 |
| Kalibre bant genişliği | 1.991242 | 2.006972 |
| Eşit hane ağırlıklı pinball | 0.168172 | 0.216709 |

Skorlanan pay **%56.38**. İki modelin slot anahtarları
ve uygunluk maskeleri birebir eşittir. B1'in eşit hane ağırlıklı pinball kaybı
B0'dan **%28.86 yüksek**.
8 hanenin 2'sinde (1642, 7800) pinball iyileşirken 6'sında kötüleşir.
Bu gözlem istatistiksel anlamlılık veya genel nüfus üstünlüğü testi değildir.

| Hane | Skorlanan / 2.976 | Pinball B0 | Pinball B1 | Kalibre kapsama B0 | B1 | Kalibre genişlik B0 | B1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 661 | 1824 | 0.150973 | 0.231468 | %89.47 | %84.38 | 1.800152 | 1.831018 |
| 1642 | 1728 | 0.156670 | 0.148216 | %91.20 | %89.12 | 2.032284 | 1.966832 |
| 2335 | 1423 | 0.215752 | 0.274786 | %82.08 | %83.77 | 2.725389 | 2.807004 |
| 3456 | 1824 | 0.097892 | 0.170571 | %89.04 | %87.17 | 1.155743 | 1.214045 |
| 6139 | 1344 | 0.214418 | 0.226345 | %83.26 | %86.46 | 2.403541 | 2.459857 |
| 7536 | 1824 | 0.199760 | 0.279511 | %86.84 | %84.81 | 2.195977 | 2.096877 |
| 7800 | 1632 | 0.180390 | 0.177175 | %81.68 | %80.88 | 2.345112 | 2.370638 |
| 8565 | 1824 | 0.129524 | 0.225603 | %87.72 | %78.67 | 1.581046 | 1.640739 |

Model seçimi yalnız bu development sonuçlarıyla yapıldı. B1 pinball ve kapsama
koşullarını sağlamadı. B0'ın %86,687 kapsaması da %87 alt sınırını sağlamaz;
“B0 korunur” karşılaştırmalı araştırma kararıdır, kabul hedefi sağlandı demek değildir.
Kalibrasyonda %90 civarı sonuç almak Temmuzda %90 garanti etmez.

## Hane ve ay kırılımı — Haziran calibration diagnostikleri

Bu tablo qhat'ın hesaplandığı veriye aittir; bağımsız performans kanıtı değildir.
JSON ayrıca her ay için ham kapsama/genişlik, ayrı kuantil kayıpları ve
`supported_slots_diagnostic` popülasyonunu da içerir. Temmuz tek development ayıdır;
Ağustos–Aralık test ayları için metrik üretilmedi.

| Hane | Calibration slot | Kalibre kapsama B0 | B1 | Kalibre genişlik B0 | B1 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 661 | 2592 | %91.20 | %93.29 | 1.830121 | 1.880294 |
| 1642 | 2592 | %90.05 | %90.05 | 1.978206 | 2.016177 |
| 2335 | 2467 | %90.07 | %90.07 | 2.881039 | 2.888027 |
| 3456 | 2592 | %90.05 | %90.05 | 1.140069 | 1.240491 |
| 6139 | 1824 | %90.08 | %90.08 | 2.362720 | 2.461166 |
| 7536 | 2592 | %90.05 | %90.05 | 2.191341 | 2.146356 |
| 7800 | 2496 | %90.06 | %90.06 | 2.342308 | 2.379643 |
| 8565 | 2592 | %90.12 | %90.05 | 1.614139 | 1.676499 |

## Kalite kapılarının etkisi ve kalibrasyon desteği

| Hane | Kullanılan train günü | Train slot | Uygun calibration günü | Calibration slot | qhat B0 | qhat B1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 661 | 126 | 11997 | 27 | 2592 | 0.000000 | 0.000000 |
| 1642 | 93 | 8928 | 27 | 2592 | 0.113500 | 0.089100 |
| 2335 | 93 | 8840 | 26 | 2467 | 0.024000 | 0.066589 |
| 3456 | 122 | 11706 | 27 | 2592 | 0.117700 | 0.095275 |
| 6139 | 9 | 864 | 19 | 1824 | 0.084000 | 0.405570 |
| 7536 | 151 | 14488 | 27 | 2592 | 0.138550 | 0.042142 |
| 7800 | 46 | 4392 | 26 | 2496 | 0.005750 | 0.016930 |
| 8565 | 150 | 14396 | 27 | 2592 | 0.040650 | 0.007591 |

Başlangıç cohort'u hâlâ aynı 8 hanedir; 25 hanenin tüm train cohort kararları P0
ile eşleşti. Günlük kapılar hiçbir haneyi rapordan gizlemez. Her model/hane için
kalibrasyon yeterliliği sağlandı; tüm profiller Haziran verisinden öğrenildi.

| Dönem | Beklenen hane-gün | Uygun hane-gün | Eksik satır | Null hedef | Negatif hedef | Geçersiz hedef | Eksik hava | Donma şüpheli slot | Destek dışı slot |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| train | 1208 | 790 | 32 | 233 | 1067 | 0 | 0 | 6749 | 5144 |
| calibration | 240 | 206 | 0 | 0 | 39 | 0 | 0 | 46 | 156 |
| development | 248 | 140 | 1100 | 4 | 42 | 0 | 0 | 93 | 1744 |

Dışlama sayaçları örtüşebilir; toplama yapıp yeni payda üretmeyin. Bir günün tek
sıcaklık slotu bile train aralığı dışında olduğunda günün tamamı birincil
karşılaştırmadan çıkar. Bu muhafazakâr politika %56,38 skorlanan payın önemli
nedenidir; yalnız başarılı slotları saklayıp tam kapsama izlenimi verilmedi.

**Önemli risk:** `6139` için geçici donma şüphesi kapısı 151 günlük train dönemini
9 uygun güne / 864 slota düşürdü; `7800` 46 gün kaldı. Pozitif düşük sabit değer
meşru standby da olabilir. Bu nedenle bu kapı doğrulanmış sensör arızası kabul
edilemez; B+C sensör çözünürlüğü/standby politikasıyla onaylamalıdır. Kuralı sonuç
iyileştirmek için gevşetmedik. Nihai model yeterliliği bu profiller için açık kalır.
`6139` Haziranda 19 günle kalibrasyon kapısını geçse de bu, dar train desteğini çözmez.

## Testler ve tekrar üretilebilirlik

- 35/35 sentetik test geçti: eski 18 + 17 P1 testi. Kalibrasyon rank/pending/sıra,
  DST, %95 sınırı, gece yarısı donma, sıfır/off, boş metrik, aylık payda, kaynak
  değişmezliği, test/development hedef izolasyonu, CLI overwrite ve test yasağı.
- CLI sentetik tekrarında rapor, CSV'ler ve model dosyası byte düzeyinde eşit.
- Son kodla gerçek `development-run03` / `development-run04` koşularında da dört artifact byte düzeyinde eşit; rapor mevcut config/kod/kaynak hash'leriyle eşleşiyor.
- Eski gerçek `661` baseline komutunun tahmin CSV'si byte eşit; metrikleri ve
  öğrenilmiş kuantil tabloları P0 ile aynı. Ortak fonksiyon çıkarımı davranışı korudu.
- Geliştirmede bulunan boş B0 tablosu dtype ve Chicago/UTC sınırı sorunları
  düzeltildi; sentetik testlerle kapsandı.
- Base bağımlılık sürümleri korunarak ayrı modeling lock eklendi. 13 kilitli Python
  paketinin OSV sorgusunda advisory yok. Uzak CI modeling ortamını kuracak şekilde güncellendi.
- Yerel gerçek artifact'lar `artifacts/p1-2026-09-17/development-run03/` altında;
  ham veri/predictions/model binary'leri commit edilmez. `report.json` diğer üç
  artifact'ın SHA-256 değerlerini ve tam provenance'ı taşır.

## Açık kararlar ve teslim sınırı

1. P0 D-01–D-05 değişmedi: birim, interval, fiziksel eşleme, negatif politika,
   nihai cohort/10 hane kabul hedefi alan sahibi kararını bekliyor.
2. Donma şüphesi eşiği ve günün tamamını kapatma politikası doğrulanmalı.
   Öneri: bilinen standby/sensör metadata'sıyla incelemek; doğrulanmış donma
   etiketleri olmadan 4 saatin hassasiyet/özgüllüğünü iddia etmemek.
3. Mevsim kayması, dar eğitim desteği, haneler arası heterojenlik ve zamansal
   bağımlılık sürüyor. Yeni hiperparametre araması yapılmadı; B1'in bu preset'i
   başarısız, bütün kuantil boosting ailesi başarısız ilan edilmiyor.
4. Önceki 661 test erişimi geri alınamaz; nihai kör değerlendirme için yeni veri
   gerekir. Kalibrasyon/bant metrikleri olay tespiti veya tasarruf iddiası değildir.
5. Akut/kronik dedektör, adaptif kalibrasyon, 1m çalışma imzası, gerçek API/UI ve
   üretim model yükleyicisi bu P1 talebine dahil değildir.


## Son artifact kimliği ve kod incelemesi

| Kimlik | SHA-256 |
| --- | --- |
| report.json | `a505b9b888da53007a788a039b6b88c8fe9d2bedadc70ce11781e89695cc80f8` |
| package source | `a5ebc11929cb173f2e1eea9afdd8f4f0975dfc73bbf72ab77dd42eb43e920400` |
| config | `6c25c5f2b07cb273a51fc284eff2f0aff049a43e58eea64f3e289519432a454f` |

`ponytail-review`: ortak cohort ve B0 fit/predict parçaları yeniden kullanıldı;
ikinci parser veya servis eklenmedi. Günlük kalite, kalibrasyon, orkestrasyon ve
metrikler görev sınırlarına göre küçük modüllerdir. Testler gerçek hata/sızıntı
koşullarını kapsar; veri/çıktı kopyalama veya yeni framework yok. İncelemede
flag-only modunun dolaylı slot dışlaması düzeltildi; yetersiz kalibrasyonda model
tercihi artık `insufficient_evidence` döner. Varsayılan gerçek koşu sonuçları değişmedi.
Yeni dosyalarda sözdizimi/bağlantı kontrolleri ve `git diff --check` geçti.
