# P0 veri karar kaydı ve cohort değerlendirmesi

Tarih: 17 Eylül 2026. Dal: `feat/ml-foundation`. Veri sahibi/entegrasyon: Muharrem (B);
analitik sahibi: Yusuf (C). İnceleme: `senior-data-scientist`, `data-quality-auditor`,
`senior-ml-engineer`; analiz betiği: `ponytail`.

**Sonuç:** Mevcut kurallarla **8 teknik aday** yeniden doğrulandı. En az 10 uygun
hane kabul hedefi karşılanmıyor. Adaylar doğrulanmış sağlıklı HVAC cihazları değildir.
Eşik, kanal kuralı, split veya negatif değer dönüşümü değiştirilmedi.
**DQS: belirlenmedi** — fiziksel geçerlilik/birim/eşleme açıkken genel skill puanı
üretime hazır olma kanıtı olarak kullanılmadı.

## 1. Kanıt zinciri ve kapsam

- Çalışan kural: [`configs/ml/austin-2018.json`](../../configs/ml/austin-2018.json),
  [`audit.py`](../../packages/ml/src/silentwatt_ml/data/audit.py),
  [`quality.py`](../../packages/ml/src/silentwatt_ml/data/quality.py).
- Tarihsel envanter ve 1m/15m karşılaştırması:
  [`dataset-audit-2026-09-15.json`](../product/ekler/dataset-audit-2026-09-15.json),
  [PRD §5, §6, §15, §19](../product/SilentWatt-Teknik-PRD-v1.1.md).
- Yeni tam kaynak denetimi: yerel `artifacts/p0-2026-09-17/data-audit.json`.
  873.286 adet 15m, 13.100.539 adet 1m, 8.760 hava satırı; 25 hane.
  Elektrikte geçersiz zaman/ızgara ve yinelenen zaman anahtarı yok.
  Sonuç 16 Eylül audit'iyle üretim zamanı dışında birebir aynı.
- Yeni eğitim analizi: yerel `artifacts/p0-2026-09-17/cohort-diagnostics.json`;
  tekrar üretim betiği [review_p0_cohort.py](../product/ekler/review_p0_cohort.py).
  Kaynak hash'i, konfigürasyon, payda ve her hanenin geçerli slot sayısı paket
  audit'iyle karşılaştırılır; her slotun muhasebesi doğrulanır.
- Tam yıl taraması yalnız kaynak bütünlüğü/envanter için kullanıldı. Aşağıdaki
  seçim, negatif değer ve duyarlılık analizleri **yalnız train** dönemindedir.
  Yeni test metriği açılmadı, test verisiyle eşik seçilmedi. Önceki 661 test
  erişimi nedeniyle mevcut test bölümünün kör değerlendirme olmadığı gerçeği sürer.

| Kimlik | SHA-256 |
| --- | --- |
| electric_1m | `00f38f620b830faa7336b84bd240ed57a0a6558c4cf9b987bbc24b94049de8d5` |
| electric_15m | `eed0695c76f1effa3132712ad75edd24612ecaf331e84776d33d7c40a94b8301` |
| weather | `78045c34bc84b3f3dca329dda65f08ed8d76f69697e841724047fd05937588c8` |
| config_sha256 | `cfad3b66ef26e5c5bab7a1a224cb6bbde275789641c7d29dfc3156c488fdfa8d` |
| package_source_sha256 | `3d9f881e72c542583e794c5c1dc1dbd5abdf1d3f897124a7f4152a9bfa1a8c04` |

Ham CSV'ler, satır düzeyinde ölçümler ve üretilen büyük çıktılar commit edilmez.
Buradaki hane kodları mevcut proje envanterindeki anonim kaynak tanımlayıcılarıdır;
yeni kimlik/konum eşlemesi yapılmadı.

## 2. Neden 8 hane kaldı?

Train penceresi America/Chicago yerel saatinde `[2018-01-01, 2018-06-01)`.
UTC karşılığı `[2018-01-01T06:00Z, 2018-06-01T05:00Z)`; DST nedeniyle
151 × 96 − 4 = **14.492 beklenen slot**. Payda gözlenen satır sayısı değildir.
%95 için en az `ceil(14.492 × 0,95) = 13.768` geçerli slot gerekir;
en fazla 724 geçersiz/eksik slot kalabilir.

Geçerli hedef: dönemde, 15m ızgarasında, tekil anahtarlı, sonlu ve `air1 >= 0`.
Tekrar anahtarı varsa adaylık ayrıca reddedilir. `air2` veya `airwindowunit1`
eğitimde bir kez bile null değilse hane dışlanır; sıfır da gözlem sayılır.
Bu kural cihazın gerçekten çalıştığı veya bulunmadığı anlamına gelmez.

| Birbirini dışlayan grup | Hane sayısı |
| --- | ---: |
| Kapsam ve kanal koşullarını geçen | 8 |
| Yalnız kapsamı geçemeyen | 14 |
| Yalnız ek kanal nedeniyle dışlanan (`7951/air2`) | 1 |
| Hem kapsam hem kanal nedeniyle dışlanan (`5746`, `9922`) | 2 |
| Toplam | 25 |

Dolayısıyla 25 → kapsam ≥%95: **9** → ek kanal dışlaması: **8**.
Ters sırayla 25 → ek kanalsız: **22** → kapsam ≥%95: **8**.
Darboğaz esas olarak geçerli hedef kapsamıdır. 16 hane kapsamı geçemiyor;
bunların 14'ü ek kanal dışlamasından bağımsızdır. Negatifleri yalnız sayısal
bulunurluk açısından sayan, fiziksel olarak onaylanmamış karşı olguda ek kanalsız
21 hane %95'e ulaşır; bu **kural değişikliği değildir**.

| Hane | Geçerli slot | Geçerli kapsam | Eksik satır | Mevcut null/sonlu olmayan | Negatif | Sonuç |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 661 | 14205 | %98.020 | 4 | 4 | 279 | Aday |
| 1642 | 14300 | %98.675 | 12 | 180 | 0 | Aday |
| 2335 | 13804 | %95.253 | 0 | 1 | 687 | Aday |
| 2361 | 11620 | %80.182 | 0 | 0 | 2872 | kapsam |
| 2818 | 12801 | %88.331 | 0 | 0 | 1691 | kapsam |
| 3039 | 13613 | %93.935 | 0 | 472 | 407 | kapsam |
| 3456 | 14490 | %99.986 | 0 | 0 | 2 | Aday |
| 3538 | 11288 | %77.891 | 0 | 0 | 3204 | kapsam |
| 4031 | 0 | %0.000 | 0 | 14492 | 0 | kapsam |
| 4373 | 12505 | %86.289 | 0 | 4 | 1983 | kapsam |
| 4767 | 4715 | %32.535 | 1 | 0 | 9776 | kapsam |
| 5746 | 3188 | %21.998 | 0 | 133 | 11171 | kapsam, airwindowunit1 |
| 6139 | 14460 | %99.779 | 0 | 32 | 0 | Aday |
| 7536 | 14488 | %99.972 | 0 | 4 | 0 | Aday |
| 7719 | 13473 | %92.969 | 0 | 0 | 1019 | kapsam |
| 7800 | 14373 | %99.179 | 16 | 12 | 91 | Aday |
| 7901 | 12556 | %86.641 | 144 | 4 | 1788 | kapsam |
| 7951 | 14200 | %97.985 | 0 | 0 | 292 | air2 |
| 8156 | 13721 | %94.680 | 0 | 4 | 767 | kapsam |
| 8386 | 12126 | %83.674 | 0 | 4 | 2362 | kapsam |
| 8565 | 14484 | %99.945 | 0 | 0 | 8 | Aday |
| 9019 | 12222 | %84.336 | 108 | 0 | 2162 | kapsam |
| 9160 | 8613 | %59.433 | 32 | 0 | 5847 | kapsam |
| 9278 | 13514 | %93.251 | 1 | 704 | 273 | kapsam |
| 9922 | 13000 | %89.705 | 0 | 1492 | 0 | kapsam, air2 |

Her satırda geçerli + eksik satır + mevcut null/sonlu olmayan + negatif = 14.492.
Eğitimde toplam 46.681 negatif `air1` slotu var. `4031` hedefi tamamen eksik.
`7951` ve `9922` için `air2` sırasıyla 14.492 ve 13.000 kez dolu;
14.020 ve 1.022 kez pozitif. `5746/airwindowunit1` 14.492 kez dolu, 14.481
kez pozitif. Bu veri üzerinde dışlama yalnız tek bir sıfır kaydından kaynaklanmıyor.
`air3` eğitimde tüm hanelerde boş; yokluğu cihazın fiziksel yokluğunu kanıtlamaz.

Tarihsel **20 aday** yıllık null olmayan kapsamı ve ek kanal yokluğunu kullanıyordu.
Yeni **8 aday** train dönemindeki negatif olmayan geçerli kapsamı kullanıyor.
Bu sayılar aynı ölçütün önce/sonra başarısı olarak karşılaştırılamaz; yıllık liste
gelecek veri bulunurluğu içerdiğinden model seçiminde kullanılamaz.

## 3. Metodolojik değerlendirme

**Savunulabilir sınırlar:** Yalnız train'den seçim, DST uyumlu sabit payda,
tekrar/sonsuz değerleri saymama ve eksik hedefi sıfıra dönüştürmeme doğru korumalardır.
Negatifleri doğrulama gelene kadar kullanmamak temkinli bir işletim kuralıdır;
onların fiziksel olarak geçersiz olduğunu kanıtlamaz.

**%95 istatistiksel olarak doğrulanmış bir optimum değildir.** PRD'deki başlangıç
kalite politikasıdır; hata maliyeti, günlük kullanılabilirlik veya sensör doğruluğu
ile kalibre edildiğine dair kanıt yoktur. %95 toplam kapsam uzun kesintileri
saklayabilir: aday `1642` eğitimde 152 slotluk (**38 saat**) kesintiye rağmen
%98,675 geçer; en düşük aylık kapsamı %93,55'tir. Aday `2335` toplam %95,253
geçerken en düşük ayı %92,09'dur. Günlük hedef+hava kapısı ve çalışma imzası
kalitesi ayrı kontrol edilmeden bu 8 haneye “operasyonel olarak uygun” denemez.

**Sıfır çevresindeki seçim yanlılığı:** `8156` %94,680 ve 767 negatif slotla,
`3039` %93,935 ve 407 negatif slotla dışarıda; eşik için sırasıyla 47 ve 155
geçerli slot eksikleri var. Birçok hanede negatif medyanı −0,001/−0,002 ham
birimdir. Bu, sensör tabanı/yuvarlama araştırmasını gerektirir; gürültü kanıtı
değildir. Cihaz kapalıyken oluşan küçük değerler negatifse bunları atmak kapalı
rejimi eksik temsil edebilir, hedef dağılımını yukarı kaydırabilir ve sensör
özelliğine göre hane seçebilir. Bu mekanizma **olasıdır, doğrulanmış değildir**;
MCAR/MAR/MNAR sınıflaması yapılmadı. IQR ile otomatik silme veya sıfıra kırpma yok.

**Kanal kuralı örneklemi daraltır:** “Null olmayan ek kanal” basit tek-devre
pilotuna uygundur; evin tüm HVAC'ını izlediğimizin kanıtı değildir. Ek cihazlı
haneleri dışlamak daha geniş nüfusa genellemeyi sınırlar. `air1`e koşullu devam,
hane bazlı fiziksel eşleme ve kanal envanteri onayıyla birlikte ele alınmalı.

**8 ya da 10 hane bir güç analizi sonucu değildir.** PRD en az 10 uygun haneyi
kabul önkoşulu yapar; 10'a erişmek bilimsel yeterliliği tek başına sağlamaz.
Aynı hanenin ardışık slotları bağımsız gözlem değildir. İleride belirsizlik hane
ve zamansal blok düzeyinde; olay başarısı hane-hafta/olay paydalarıyla raporlanmalı.
Bu 25 hane rastgele örneklem olarak gösterilmemeli. Sağlıklı eğitim etiketi yok.

**ML mimarisi:** Offline artifact → Express → UI sınırı korunmalı. Train Jan–May
soğutma mevsimini sınırlı kapsayabilir: önceki Temmuz `661` koşusunda 212/2.976
slot eğitim sıcaklık desteği dışında. Mevcut 2°C kutu, 20 saat×sıcaklık ve 50
sıcaklık örneği minimumları istatistiksel güven garantisi değildir; 20 örnekte
%5 kuyruk yaklaşık bir gözleme dayanır, otokorelasyon etkin örneklemi azaltır.
Bu ayarlar değiştirilmedi; train/development desteği ve kalibrasyon ayrı teslimdir.
Yeni servis, feature store veya model ailesi eklemek bu P0 sorununu çözmez.

## 4. Duyarlılık — uygulanan politika değildir

Kanal dışlaması ve negatifleri reddetme sabitken:

| Varsayımsal minimum kapsam | Aday sayısı |
| --- | ---: |
| %90 | 12 |
| %93 | 11 |
| %94 | 9 |
| **%95 (mevcut)** | **8** |
| %97 | 7 |
| %99 | 5 |

Yalnız %95 kapsam eşiğini düşürmek kayıp/gürültü nedenini çözmez. Tam 10 hane
üreten bir kesme noktası aramak hedef sayıya göre seçimdir; önerilmedi.

%95 ve kanal dışlaması sabitken `air1 >= -epsilon` sayılırsa:

| Varsayımsal epsilon (birimi doğrulanmamış) | Aday sayısı |
| --- | ---: |
| 0 (mevcut) | 8 |
| 0,001 | 12 |
| 0,005 | 20 |
| 0,010 | 21 |

Bunlar yalnız hangi verilerin sayılacağını gösterir; negatifleri olduğu gibi
modele vermek veya sıfıra çevirmek için izin değildir. Kalibrasyon/sensör belgesi
olmadan bu toleranslardan hiçbiri önerilen üretim eşiği sayılamaz. Kapsam,
negatif politika ve kanal dışlamasını aynı anda değiştirerek etki karıştırılmadı.

## 5. Muharrem / B+C decision log

**Onay durumu:** Aşağıdaki kayıtlar ekip kararına sunulan teknik dosyadır.
Muharrem veya ekip adına onay verilmedi. Kullanıcının talimatıyla mevcut kurallar
korundu; nihai cohort ve veri anlamı onayı bekliyor. Yanıtlar karar ID'si altında
kanıt bağlantısı/sürümü, karar veren, tarih ve etkilenen config sürümüyle kaydedilmeli.

| ID / durum | Mevcut kanıt | Muharrem'den istenen karar veya belge | Onaya kadar uygulama |
| --- | --- | --- | --- |
| D-01 — AÇIK: güç birimi | CSV başlıkları birim taşımıyor; kaynak audit'i `unverified`. Sayı büyüklüğü birim kanıtı değildir. | Bu dosya sürümü için `air1` ve güç kanalları W mı, kW mı, enerji mi? Ölçek, ölçüm hassasiyeti ve varsa kanal istisnaları içeren sağlayıcı veri sözlüğü. | `source_unit_unverified`; kW/kWh dönüşümü ve tasarruf iddiası yok. |
| D-02 — AÇIK: interval | Zamanlar ofsetli ve 15m ızgarasına uyuyor. Tarihsel `661/air1` kontrolünde 34.699 tam kutu, sol kapalı 1m ortalamasıyla en çok 0,000467 ham birim fark gösteriyor. Tek hanede aritmetik uyum; fiziksel zaman tanımı değil. | Değer ortalama güç, anlık örnek, toplam enerji veya başka agregasyon mu? Etiket başlangıç/bitiş/merkez mi; aralık kapalı yönü, eksik dakika işlemi, yuvarlama ve DST kuralları nedir? | Mevcut aynı-UTC-saat hava eşlemesi hesap davranışı olarak belgeli; fiziksel doğrulama sayılmaz. Onay sonrası tüm adaylarda 1m/15m hizalama kontrolü gerekir. |
| D-03 — AÇIK: `air1` | Kanal adı ve ölçümler var; devre/ekipman metadata'sı yok. `furnace1/2`, `air2/3` gibi başka sütunlar da var. | Her aday için `air1` hangi devreyi ölçüyor: kompresör/dış ünite, fan, birleşik soğutma mı? Tüm HVAC'ın kapsamı nedir? Null diğer kanal cihaz yokluğu mu, ölçüm yokluğu mu? | “air1 kanal sapması”; HVAC arızası veya sağlıklı cihaz iddiası yok. Eşleme yoksa ayrıca açık koşullu demo kararı gerekli. |
| D-04 — AÇIK: negatifler | Train'de 46.681 negatif; tarihsel tüm dosya minimumları 1m −0,264, 15m −0,064 ham birim. Küçük negatiflerin cohort etkisi yukarıda ölçüldü. | Kanal/sensör bazında işaret yönü, sıfır ofseti, çözünürlük, kalibrasyon ve geçersiz kayıt kodları nedir? Gürültü ise hangi tolerans ve işlem (işaretle/koru/düzelt) yetkilendiriliyor? | Ham kaynak korunur; modelde negatifler geçersiz/eksik. `grid` gibi net akış kanallarına bu hedef kuralı genellenmez. |
| D-05 — TEKNİK SONUÇ DOĞRULANDI; EKİP ONAYI AÇIK | 8 aday: `661, 1642, 2335, 3456, 6139, 7536, 7800, 8565`; seçim kuralı ve tüm dışlamalar bu belgede. 10 hane kabul hedefi sağlanmadı. | B+C, bu listeyi mevcut %95/train/kanal kuralları altında koşullu geliştirme cohort'u olarak kayda alıyor mu? Nihai kabul için ek uygun veri sağlayacak mı? Karar veren/tarih henüz yok. | Aynı 8 aday ve kurallar korunur. “10 uygun hane” ya da “G0 tamamlandı” denmez. |

## 6. Ayrı değişiklik kararları — uygulanmadı

| ID / öneri | Teknik gerekçe | Beklenen etki / kabul için gereken |
| --- | --- | --- |
| C-01 — Önce metadata ve ek uygun hane verisi iste | Sayı hedefi için mevcut kalite kapısını gevşetmez. | En az 2 ek uygun hane gerekir; yeni kaynak görülmeden kazanım garantisi yok. Aynı kurallarla audit ve hash/sürüm kaydı; B+C onayı. |
| C-02 — D-04 onayından sonra sensör toleransını ayrı değerlendir | Negatiflerin geçersiz mi gürültü mü olduğu seçimde büyük etki yaratıyor. | Varsayımsal 0,001 için 8→12, 0,005 için 8→20; yalnız train hesabı. Metadata + hane/sensör bazlı inceleme + sürümlü dönüşüm + regresyon/development etkisi ve yeni onay gerekir. |
| C-03 — %95'i düşürme önerisi şu an desteklenmiyor | Kayıp mekanizması ve günlük çalışma güvenilirliği doğrulanmadı. | %94 yalnız 9, %93 11 aday verir; bu sayı artışı kaliteyi kanıtlamaz. Değişiklik istenirse hata maliyeti/günlük kullanılabilirlik gerekçesiyle ayrı karar; 10'a göre ayarlama yok. |
| C-04 — Ek kanal dışlamasını kaldırma şu an desteklenmiyor | Tek devre kapsamını ve genellemeyi değiştirir. | %95 korunursa yalnız `7951` eklenir: 8→9; hedefi tek başına sağlamaz. Önce fiziksel devre haritası, açık çok-cihaz kapsamı ve ekip onayı gerekir. |

Hiçbir teklif mevcut config'e uygulanmadı. Test sonuçlarına göre tolerans/bölme
seçilmeyecek. Mevcut açık test geçmişi nedeniyle nihai kabul için görülmemiş veri
ve önceden dondurulmuş bir değerlendirme planı ayrıca gerekli.

## 7. Tekrar üretim

Repo kökünde, kilit dosyasıyla kurulmuş Python ortamında:

```bash
.venv/bin/python -m silentwatt_ml audit --data-dir ../dataset \
  --config configs/ml/austin-2018.json \
  --output artifacts/p0-2026-09-17/data-audit.json
.venv/bin/python docs/product/ekler/review_p0_cohort.py \
  --data-dir ../dataset --audit artifacts/p0-2026-09-17/data-audit.json \
  > artifacts/p0-2026-09-17/cohort-diagnostics.json
```

Audit mevcut çıktıyı üzerine yazmaz; yeni koşuda yeni artifact yolu seçin.
Python 3.12.14, NumPy 2.3.5, pandas 2.2.3, tzdata 2026.3 ile doğrulandı.
Bu diagnostik betik temiz eğitim anahtarları olan bu snapshot için fail-closed
çalışır; yinelenen/ızgara dışı veride genel temizleme aracı yerine geçmez.
