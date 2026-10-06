> **ARŞİV — referans alınmaz.** Bu belge PRD v0.9 (8 Eylül 2026) sürümünün kopyasıdır ve geçerliliğini yitirmiştir.
> Gereksinim, eşik, metrik veya karar için kullanılmaz. Arşiv kuralı: [docs/archive/README.md](README.md).

# SilentWatt — Ürün ve Sistem Şartnamesi

**Sayaç arkası enerji ekipmanlarında sessiz performans kaybını tespit eden, nedenini kanıtlayan ve operasyonel iş emrine dönüştüren karar sistemi.**

| | |
|---|---|
| **Sürüm** | 0.9 — taslak |
| **Tarih** | 8 Eylül 2026 |
| **Sahip** | Y. Z. Demirel |
| **Durum** | İnceleme için açık |
| **Kapsam** | Faz 1 · MVP |

---

## İçindekiler

- [00 · Kapsam ve okuma notu](#00--kapsam-ve-okuma-notu)
- [01 · Problem tanımı ve değer önerisi](#01--problem-tanımı-ve-değer-önerisi)
- [02 · Uçtan uca fonksiyonel kapsam](#02--uçtan-uca-fonksiyonel-kapsam)
- [03 · Teknik mimari ve veri akışı](#03--teknik-mimari-ve-veri-akışı)
- [04 · Kısıtlar, riskler ve hafifletme planı](#04--kısıtlar-riskler-ve-hafifletme-planı)
- [05 · Aşamalı geliştirme yol haritası](#05--aşamalı-geliştirme-yol-haritası)
- [06 · Ekler](#06--ekler)

---

## 00 · Kapsam ve okuma notu

Bu doküman, SilentWatt'ın ne olduğunu, neyi çözdüğünü ve nasıl inşa edileceğini tek bir referansta toplar. Pazarlama anlatısı değil, **uygulama sözleşmesidir**.

### İki tür ifade, iki farklı ağırlık

Doküman boyunca her sayısal iddia iki kategoriden birine düşer ve etiketlenir:

- `[DOĞRULANMIŞ]` — birincil kaynağa dayanır, kaynak Ek A'da listelidir.
- `[VARSAYIM]` — henüz ölçülmemiştir; bir hedef, bir tahmin ya da doğrulanacak bir hipotezdir.

Bu ayrım kozmetik değildir: **projenin tüm doğrulama planı, varsayım etiketli satırları doğrulanmış hâle getirmek üzerine kuruludur.**

> ### ⚠ Bugünkü gerçek durum
>
> Elde bulunan tek veri kaynağı **Pecan Street Dataport 2018, Austin (Teksas), 20 hane** — devre seviyesinde aktif güç ölçümü. Arıza etiketi, servis kaydı, teknisyen geri bildirimi ve saha ortağı **yoktur**.
>
> Faz 1 kapsamı tamamen bu kısıt üzerine tasarlanmıştır. Operatör, sevk ve saha döngüsünü tarif eden bölümler **hedef mimaridir** ve o şekilde işaretlenmiştir.

---

## 01 · Problem tanımı ve değer önerisi

### 1.1 Ürün nedir

SilentWatt, konutlardaki iklimlendirme, su ısıtma ve güneş üretim ekipmanlarının **çalışmaya devam ederken verim kaybetmesini** tespit eden bir yazılım katmanıdır. Girdi olarak yalnızca hâlihazırda toplanan sayaç ve devre tüketim verisini kullanır; hane içine hiçbir donanım kurmaz.

Kapattığı boşluk şudur: bir cihaz tamamen bozulduğunda kullanıcı fark eder ve servis çağırır. Ancak **kademeli verim kaybında hiç kimse fark etmez** — cihaz çalışmaya devam eder, konfor değişmez, hata kodu üretilmez. Ne ev sahibinin karşılaştırma tabanı vardır, ne dağıtım şirketinin ayda tek toplam sayı dışında görünürlüğü.

### 1.2 Problemin doğrulama gerekçesi

| Bulgu | İçerik | Kaynak | Durum |
|---|---|---|---|
| **%70–90** | Hanelerde en az bir HVAC arızası bulunma oranı; kanal kaçakları dahil edildiğinde %90–100 | PNNL-30077 (DOE) | `[DOĞRULANMIŞ]` |
| **%9** | Yalnızca iki montaj arızasının (iç ünite hava debisi + soğutucu şarjı) yol açtığı fazla enerji tüketimi | Winkler ve ark., *Applied Energy* 278 (2020) | `[DOĞRULANMIŞ]` |
| **20,7 TWh** | Aynı iki arızanın ABD tek ailelik konutlarında yıllık modellenmiş fazla tüketimi | Winkler ve ark. (2020) | `[DOĞRULANMIŞ]` |
| **%50–72** | Saha incelemelerinde denetlenen cihazlarda bu iki arızanın bulunma oranı | PNNL-30077 | `[DOĞRULANMIŞ]` |
| **104,2 M** | ABD'de konut AMI sayacı kurulu tabanı (2022 verisi) | EIA | `[DOĞRULANMIŞ]` |
| **%63** | Avrupa'da akıllı elektrik sayacı penetrasyonu (2024 sonu) | Berg Insight | `[DOĞRULANMIŞ]` |

Bu tablo iki şeyi birlikte kanıtlar: **problem yaygın ve ölçülmüştür**, ve **onu görmek için gereken veri altyapısı zaten kuruludur.** Eksik olan analitik katmandır.

#### Neden bugüne kadar çözülmedi

PNNL-30077'nin saydığı benimseme engelleri, ürünün varlık gerekçesini oluşturur — her engel bir tasarım kararına karşılık gelir:

| Engel | SilentWatt'ın karşılığı |
|---|---|
| Gömülü tanılama yalnızca premium, değişken hızlı modellerde mevcut | Ölçüm sayaç tarafında → kurulu tabanın tamamı, cihaz yaşı ve markası fark etmez |
| Standart arıza kodu yok, üreticiye özel | Üreticiden tamamen bağımsız; tek girdi aktif güç zaman serisi |
| Sektör çapında haberleşme protokolü yok | Mevcut AMI/OSOS veri hattı kullanılır, yeni protokol gerekmez |
| Yeni donanım maliyeti | Hane içinde sıfır donanım; işlem operatör çevriminde |

### 1.3 Benzersiz değer önerisi

> **Tek cümle:** Hangi marka olursa olsun, hiçbir ek donanım kurmadan, sadece mevcut sayaç verisinden hangi cihazın bozulduğunu, ne kadar kaybettirdiğini ve teknisyenin ne zaman gitmesi gerektiğini söyler — **ve önerilerinin ne kadarının boşa çıkacağını önceden taahhüt eder.**

| Ayrışma ekseni | Mevcut alternatifler | SilentWatt |
|---|---|---|
| Kapsam | Akıllı termostat: yalnızca kendi cihazını görür | Devre seviyesinde tüm ev |
| Kurulum | Cihaz tabanlı izleme (Sense, Emporia sınıfı): pano içi donanım gerekir | Hane içinde donanım yok |
| Çıktı türü | Ayrıştırma analitiği (Bidgely sınıfı): cihaz görünürlüğü ve anomali sinyali | Gerekçeli, önceliklendirilmiş iş emri |
| Alarm eşiği | Kural tabanlı sistemler: sabit eşik, öngörülemeyen yanlış alarm | Konformal kalibrasyon ile ayarlanabilir yanlış alarm oranı |
| Yavaş bozulma | Uyarlanabilir modeller kademeli kaybı yeni normal olarak öğrenir | Dondurulmuş referans dedektörü kaymayı görünür tutar |
| Öğrenme | Statik model | Her saha teyidi etikete dönüşür, sistem kullanıldıkça iyileşir |

> Rakip değerlendirmesi kamuya açık ürün konumlandırmasına dayanır; karşılaştırmalı ürün testi yapılmamıştır. `[VARSAYIM]`

### 1.4 Persona ve çekirdek kullanım senaryosu

**P1 · Birincil — Filo operasyon sorumlusu**
Bir dağıtım şirketinin verimlilik programında ya da bir enerji servis şirketinde çalışır. Sorumluluğu binlerce ila yüz binlerce haneden oluşan bir portföyün enerji performansıdır. Bütçesi ve sahada ekibi vardır; eksik olan **nereye bakacağı bilgisidir.** Bugünkü yöntemi: şikâyet geldiğinde tepki vermek ya da portalları elle taramak.

**P2 · İkincil — Saha teknisyeni**
İş emrini alıp haneye giden kişi. Derdi doğruluk: boşa giden bir sevk yarım gün demektir. Sistemden beklentisi, gitmeden önce **ne arayacağını bilmek.** Aynı zamanda sistemin en kritik veri kaynağıdır — teyit/ret kararı etiket üretir.

**P3 · Üçüncül — Servis ağı yöneticisi**
Doğrulanmış bulguyu ticari fırsat olarak görür. Ödeme isteği en yüksek taraf olabilir; ancak yanlış bulgunun maliyetini de doğrudan o taşır.

> ### Çekirdek kullanım senaryosu — UC-01
>
> **Pazartesi sabahı önceliklendirme.** P1 haftalık listeyi açar. Sistem, geçen hafta bozulma sinyali veren siteleri tahmini kayıp enerjiye ve güven skoruna göre sıralamış hâlde sunar. P1 her satırda bulguyu, kanıtı ve önerilen ilk kontrolü görür; sevk et / ertele / kapat kararını verir. Sevk edilen vakalar P2'ye iş emri olarak düşer. P2 sahada bulguyu teyit veya reddeder; bu karar sisteme etiket olarak geri döner.

---

## 02 · Uçtan uca fonksiyonel kapsam

### 2.1 Kullanıcı yolculuğu

Aşağıdaki akış, tek bir olayın doğuşundan kapanışına kadar izlediği yoldur.

| # | Adım | Ne olur | Sistem karşılığı |
|---|---|---|---|
| 1 | **Veri akar** | Sayaç ve devre ölçümleri düzenli aralıklarla gelir, kalite kapısından geçer | `M1` · her 15 dk · toplu veya akış |
| 2 | **Beklenti hesaplanır** | Her devre için o hava koşulunda ve o saatte ne kadar tüketilmesi gerektiği tahmin edilir — hem güncel davranışa hem sağlıklı referansa göre | `M3` + `M4` · iki dedektör paralel |
| 3 | **Sapma olaya dönüşür** | Fark kalibre bandın dışına çıkar ve ısrarla tekrarlarsa olay kaydı oluşur; tek seferlik sapmalar elenir | `M4` · `Event` nesnesi üretilir |
| 4 | **Olay elenir** | Veri hatası mı, hava olayı mı, bölgedeki tüm hanelerde mi görülüyor? Olayların çoğu burada kapanır | `M6` · Triyaj |
| 5 | **Neden aranır** | Sapmanın hangi devreden geldiği hesaplanır, davranış imzası kütüphaneyle eşleştirilir | `M5` + `M6` · sıralı hipotezler |
| 6 | **Karara bağlanır** | Tahmini kurtarılabilir enerji ve güven skoru, sevk maliyetiyle karşılaştırılır | `M6` · sevk / izle / kapat |
| 7 | **Operatör görür ve karar verir** | Haftalık sıralı liste; her satırda bulgu, kanıt grafiği, tahmini kayıp, önerilen ilk kontrol | `M7` · UC-01 |
| 8 | **Saha döner, sistem öğrenir** | Teknisyen bulguyu teyit veya reddeder; bu karar etiket olarak saklanır | `M8` · geri besleme döngüsü |

### 2.2 Modül dökümü

| ID | Modül | Sorumluluk | Faz |
|---|---|---|---|
| `M1` | Veri Alım ve Kalite | Ölçüm alımı, yeniden örnekleme, kalite kapıları, zaman dilimi normalizasyonu | **MVP** |
| `M2` | Öznitelik ve Bağlam | Hava, ışınım, takvim ve hane özniteliklerinin birleştirilmesi | **MVP** |
| `M3` | Tahmin Motoru | Global kuantil tahmin modeli; devre ve hane gömmeleriyle tek model tüm portföyü servis eder | **MVP** |
| `M4` | Tespit ve Kalibrasyon | Konformal band, kalıcılık filtresi, dondurulmuş referans dedektörü, olay üretimi | **MVP** |
| `M5` | Teşhis | Devre ayrıştırma, imza öznitelikleri, kütüphane eşleştirme, açıklanabilirlik artefaktları | **MVP** |
| `M6` | Karar Akışı | Üç aşamalı durum makinesi (triyaj → teşhis → karar) ve deterministik guardrail | MVP: yarı otomatik |
| `M7` | Operatör Konsolu | Haftalık sıralı liste, vaka detayı, kanıt görünümü, karar butonları | MVP: salt okunur |
| `M8` | Olay Deposu ve Öğrenme | Olay, teşhis, iş emri ve etiket kayıtları; geri besleme hattı | **MVP** |
| `M9` | Model Fabrikası | Eğitim, hiperparametre arama, sürüm kaydı, uç dağıtım paketi üretimi | Faz 2 |

### 2.3 Fonksiyonel gereksinimler

#### M1–M2 · Veri ve öznitelik

| ID | Gereksinim | Öncelik |
|---|---|---|
| `FR-101` | Sistem, devre seviyesinde aktif güç ölçümlerini 1 dakikalık ve 15 dakikalık çözünürlükte alabilmelidir. 15 dk modelleme, 1 dk imza çıkarımı içindir. | **Must** |
| `FR-102` | Her ölçüm penceresi kalite kapılarından geçmelidir: eksik oran ≤ %5, aynı değerin 60 ardışık tekrarı (donmuş sensör), enerji dengesi tutarlılığı, saat dilimi ve yaz saati hizalaması. | **Must** |
| `FR-103` | Kalite kapısından geçemeyen pencereler modele girmemeli; bunun yerine `data_fault` tipinde ayrı bir olay üretmelidir. | **Must** |
| `FR-104` | Sistem, dış sıcaklık, bağıl nem ve güneş ışınımı verisini harici bir servisten alıp ölçüm zaman serisiyle hizalamalıdır. | **Must** |
| `FR-105` | Türetilmiş öznitelikler hesaplanmalıdır: derece-gün, gecikmeli değerler, hareketli istatistikler, takvim öznitelikleri. | **Must** |

#### M3–M4 · Tahmin ve tespit

| ID | Gereksinim | Öncelik |
|---|---|---|
| `FR-201` | Tahmin modeli, her devre için nokta tahmini değil **kuantil aralığı** üretmelidir (alt sınır, medyan, üst sınır). | **Must** |
| `FR-202` | Model global olmalı; hane ve devre kimliği statik öznitelik olarak verilmelidir. Yeni bir hane, geçmiş veri birikmeden kohort davranışı üzerinden servis edilebilmelidir. | **Must** |
| `FR-203` | Tahmin aralığı, ayrılmış bir kalibrasyon kümesi üzerinde konformal olarak düzeltilmeli ve hedeflenen kapsama oranına ayarlanabilmelidir. | **Must** |
| `FR-204` | Kalibrasyon, zaman içindeki dağılım kaymasına karşı çevrimiçi güncellenmelidir (uyarlanabilir konformal düzeltme). | **Must** |
| `FR-205` | Tek noktalı sapmalar olay üretmemelidir. Normalize artık üzerinde bir kalıcılık filtresi (kümülatif toplam kontrolü) uygulanmalıdır. | **Must** |
| `FR-206` | Sistem **iki bağımsız dedektör** çalıştırmalıdır: (a) uyarlanabilir model + konformal band → ani arızalar; (b) dondurulmuş referans modeli + performans indeksi sürüklenmesi → kademeli bozulma. | **Must** |
| `FR-207` | Kronik dedektörün referans modeli bir kez eğitilip **sürüm kilidiyle dondurulmalı**, yeniden eğitim hattına dahil edilmemelidir. | **Must** |
| `FR-208` | Kronik sinyalin tek yönlülüğü istatistiksel bir eğilim testiyle doğrulanmalı; rastgele dalgalanma olay üretmemelidir. | **Must** |
| `FR-209` | Aynı anda birden çok hanede görülen sapmalar sistemik olarak işaretlenmeli ve haneye özgü olaylardan ayrıştırılmalıdır. | Should |

#### M5 · Teşhis

| ID | Gereksinim | Öncelik |
|---|---|---|
| `FR-301` | Her olay için toplam sapmanın devre bazında yüzdesel dağılımı hesaplanmalıdır. Bu, birincil kanıt olarak sunulur. | **Must** |
| `FR-302` | 1 dakikalık veriden davranış imzası öznitelikleri çıkarılmalıdır: çalışma oranı, saatlik çevrim sayısı, ortalama açık kalma süresi, derece-gün başına çalışma süresi. | **Must** |
| `FR-303` | İmza kütüphanesi **versiyonlanmış bir veri dosyası** olarak tutulmalı, koda gömülmemelidir. Her tanım fiziksel gerekçe, tipik enerji etkisi ve önerilen ilk kontrol içermelidir. | **Must** |
| `FR-304` | Açıklanabilirlik atfı, hanenin **kendi sağlıklı dönemleri** arka plan dağılımı alınarak hesaplanmalıdır; böylece açıklama "genel modele göre" değil "bu hanenin normaline göre" olur. | Should |
| `FR-305` | Teşhis çıktısı sıralı hipotez listesi olmalı; her hipotez destekleyici kanıt, karşı kanıt ve güven skoru taşımalıdır. **Boş liste (yetersiz kanıt) geçerli bir çıktıdır.** | **Must** |

#### M6 · Karar akışı

| ID | Gereksinim | Öncelik |
|---|---|---|
| `FR-401` | Karar akışı serbest diyalog değil, **açık durumlu bir durum makinesi** olarak uygulanmalıdır. Her durumun tanımlı giriş/çıkış şeması vardır. | **Must** |
| `FR-402` | Her ajan adımının en az bir **erken çıkış** yolu olmalıdır; olayların iş emrine dönüşmeden kapanabilmesi zorunludur. | **Must** |
| `FR-403` | Dil modeli aritmetik yapmamalı, eşik belirlememeli ve kütüphane dışından hipotez üretmemelidir. Hesaplar deterministik araç çağrılarıyla yapılır. | **Must** |
| `FR-404` | Üretilen metindeki her sayısal iddia bir araç çağrısı sonucuna izlenebilir olmalıdır. İzlenemeyen çıktı iş emrine dönüşemez, insan incelemesine düşer. | **Must** |
| `FR-405` | Sevk kararı ekonomik olmalıdır: tahmini kurtarılabilir enerji × güven skoru, sevk maliyetiyle karşılaştırılır. | **Must** |
| `FR-406` | Maliyeti olan hiçbir eylem insan onayı olmadan tetiklenmemelidir. | **Must** |

#### M7–M8 · Konsol ve öğrenme

| ID | Gereksinim | Öncelik |
|---|---|---|
| `FR-501` | Operatör konsolu, haftalık vakaları tahmini kayıp × güven skoruna göre sıralı tek bir listede sunmalıdır. | **Must** |
| `FR-502` | Her vaka satırı açıldığında kanıt görünümü sunulmalıdır: gerçek ve beklenen tüketim grafiği, devre dağılımı, eşleşen imza, önerilen ilk kontrol. | **Must** |
| `FR-503` | Operatör her vaka için sevk / ertele / kapat kararı verebilmeli; karar ve gerekçesi kaydedilmelidir. | **Must** |
| `FR-601` | Saha sonucu (teyit / ret) yapılandırılmış bir etiket olarak saklanmalı, olay kaydına ve kaynak zaman serisine bağlanmalıdır. | **Must** |
| `FR-602` | Biriken etiketler üç hedefi beslemelidir: alarm eşiği yeniden kalibrasyonu, imza kütüphanesi güncellemesi, model yeniden eğitimi. | Should |
| `FR-603` | Her olay, kendisini üreten model ve kalibrasyon sürümüyle birlikte saklanmalıdır (yeniden üretilebilirlik). | **Must** |

### 2.4 MVP kapsam matrisi

| Yetenek | MVP (Faz 1) | Faz 2 | Faz 3 |
|---|---|---|---|
| Arıza ailesi | Tek aile — veri uygunluğuna göre PV veya HVAC | + HVAC, su ısıtıcısı, kompresör kısa çevrimi | Çok aile, otomatik imza öğrenme |
| Veri kaynağı | Pecan Street 2018, 20 hane | + Tasarım ortağı verisi | Çok operatörlü portföy |
| Karar akışı | Yarı otomatik — insan triyaj, otomatik kanıt üretimi | Tam durum makinesi + guardrail | Öğrenen politika |
| Konsol | Statik haftalık rapor | İnteraktif konsol, karar kaydı | Çok kullanıcılı, rol bazlı |
| Dağıtım | Tek sunucu, toplu işlem | Uç/bulut ayrımı, Ascend portu | Çok uçlu filo yönetimi |
| Etiket | Sentetik enjeksiyon + uzman kör puanlama | Gerçek saha teyidi | Sürekli öğrenme döngüsü |

#### Kapsam dışı — bilinçli

Aşağıdakiler **hiçbir fazda** kapsamda değildir ve sunum ile dokümantasyonda böyle beyan edilir:

- **Şebeke tarafı arızalar** (kısa devre, röle açması) — 1 dakikalık ortalama güç verisinde bu olayların sinyali fiziksel olarak bulunmaz.
- **Ark arızası ve yangın öncüsü tespiti** — kHz–MHz mertebesinde dalga formu ölçümü gerektirir; AMI sayaçları sağlamaz.
- **Cihaz ayrıştırmanın kendisi (NILM)** — bir amaç değil, gerektiğinde kullanılan bir araçtır.
- **Tarife optimizasyonu, talep yanıtı, faturalandırma** — bitişik alanlar, bu ürünün konusu değil.

---

## 03 · Teknik mimari ve veri akışı

Mimarinin taşıdığı tek yapısal ilke: **yavaş değişen ve mahremiyete duyarlı olan uçta, hızlı değişen ve merkezi bilgi gerektiren bulutta.**

### 3.1 Katmanlı mimari

| Katman | Bileşen | Sorumluluk | Gerekçe |
|---|---|---|---|
| **Uç**<br>(operatör kenarı) | Alım ve kalite servisi | Ölçüm alımı, yeniden örnekleme, kalite kapıları | Ham tüketim profili hane davranışını ifşa eder; operatör çevriminden çıkmaması hem yasal erişimi hem maliyeti belirler |
| | Çıkarım çalışma zamanı | Kuantil tahmin, konformal band, kalıcılık filtresi | |
| | Olay yayıcı | Olay nesnesi üretimi ve buluta iletim | |
| **Sunucu**<br>(bulut) | Olay alım API'si | Doğrulama, kuyruğa alma, kalıcılaştırma | Merkezi bilgi (akran grubu, imza kütüphanesi, geçmiş vakalar) tek uçta bulunamaz; ayrıca bu katman haftalık güncellenir |
| | Teşhis servisi | Devre ayrıştırma, imza eşleştirme, atıf üretimi | |
| | Karar orkestratörü | Durum makinesi, araç çağrıları, guardrail doğrulaması | |
| | İş emri servisi | Kuyruk, öncelik, SLA, karar kaydı | |
| **Veri** | Zaman serisi deposu | Ölçümler, öznitelikler, tahmin çıktıları | Sıcak/soğuk ayrımı maliyeti kontrol eder; olay deposu ilişkisel, ölçüm deposu sütun tabanlı olmalıdır |
| | Olay deposu | Olay, teşhis, iş emri, etiket | |
| | Artefakt deposu | Model sürümleri, kalibrasyon profilleri, imza kütüphanesi | |
| **İstemci** | Operatör konsolu | Liste, vaka detayı, kanıt görünümü, karar | Salt okunur başlar; karar yazma yeteneği Faz 2'de eklenir |
| **Harici** | Hava ve ışınım servisi | Sıcaklık, nem, ışınım zaman serisi | İkisi de sistemin kontrolü dışındadır; kesinti hâlinde davranış tanımlı olmalıdır (NFR-04) |
| | Ölçüm kaynağı | AMI / OSOS veri hattı veya dosya aktarımı | |

#### Hedef teknoloji yığını

| Katman | Bileşen | Not |
|---|---|---|
| Uç çıkarım | Ascend 310B · CANN / ATC | Model `.om` formatına dönüştürülür. **Yedek yol:** PyTorch → ONNX → ATC. İki yol da Faz 2'nin ilk haftasında test edilir. |
| Model geliştirme | MindSpore | Ana yol. Hazır TFT implementasyonu bulunmadığı için port maliyeti planda ayrı kalem olarak tutulur (R-02). |
| Eğitim ve sürüm | ModelArts | Eğitim, hiperparametre arama, model kaydı, ablasyon tablosu üretimi. |
| Muhakeme katmanı | MindIE üzerinde açık ağırlıklı model | Ajan katmanının Ascend üzerinde koşması, uçtan buluta tek ekosistem hikâyesini tamamlar. |
| Depolama | OBS (veri gölü) · GaussDB (olay deposu) | Ölçümler Parquet olarak bölümlenir; olay ve etiket kayıtları ilişkiseldir. |

### 3.2 Veri modeli

```sql
-- ÖLÇÜM TARAFI (yüksek hacim, append-only, sütun tabanlı)
household     (household_id PK, region, floor_area, pv_capacity_kw,
               hvac_type, has_ev, tariff_class)
circuit       (circuit_id PK, household_id FK, circuit_type, nominal_kw)
reading       (circuit_id FK, ts, power_kw, quality_flag)
               -- bölümleme: household_id + ay
weather_obs   (region, ts, temp_c, rel_humidity, ghi, poa)

-- MODEL TARAFI (artefakt, sürümlü)
model_version      (model_id PK, kind, trained_at, params, metrics, frozen bool)
calibration_profile(profile_id PK, household_id FK, circuit_id FK, model_id FK,
                    alpha_target, q_offset, coverage_observed, updated_at)
signature_def      (signature_id PK, version, equipment, predicates jsonb,
                    physical_rationale, typical_impact_pct, first_check)

-- KARAR TARAFI (düşük hacim, durumlu, denetlenebilir)
event         (event_id PK, household_id FK, circuit_id FK,
               detector enum(acute|chronic),
               t_start, t_end, anomaly_score, magnitude_kwh, severity,
               model_id FK, profile_id FK,
               status enum(new|triaged|diagnosed|dispatched|closed))
triage        (event_id FK, verdict enum(valid|false_positive|data_fault|systemic),
               peer_sync_rate, evidence jsonb, decided_at)
diagnosis     (diagnosis_id PK, event_id FK, created_at, tool_calls jsonb)
hypothesis    (hypothesis_id PK, diagnosis_id FK, signature_id FK, rank,
               confidence, supporting jsonb, contradicting jsonb, est_kwh)
work_order    (wo_id PK, event_id FK, hypothesis_id FK, priority,
               expected_value, first_check, sla_due, assignee,
               status enum(queued|dispatched|closed))
label         (label_id PK, work_order_id FK, event_id FK,
               outcome enum(confirmed|rejected|inconclusive),
               actual_fault, technician_note, closed_at)
```

> **Model tasarımındaki iki kritik karar**
>
> **1 · Her olay kendi model ve kalibrasyon sürümüne bağlıdır.** `event.model_id` ve `event.profile_id` olmadan, altı ay sonra "bu alarm neden çıktı?" sorusuna cevap verilemez. Denetlenebilirlik bu iki alanda saklıdır.
>
> **2 · `label`, `work_order` üzerinden `event`'e bağlıdır.** Etiket doğrudan olaya bağlansaydı, hangi hipotezin doğrulandığı kaybolurdu — ve öğrenme döngüsü yanlış şeyi öğrenirdi.

### 3.3 Bileşenler arası iletişim

| Sınır | Mekanizma | Yük | Kural |
|---|---|---|---|
| Ölçüm kaynağı → Uç | Toplu dosya veya akış | Ham zaman serisi | En az bir kez teslim; tekrarlanan kayıtlar `(circuit_id, ts)` ile tekilleştirilir |
| Uç → Bulut | Asenkron olay yayını | **Yalnızca olay nesnesi + günlük artık özeti** | Ham ölçüm bu sınırı geçmez (NFR-02) |
| Bulut içi: alım → teşhis | Kuyruk | `event_id` | Geri basınç kuyrukta emilir; teşhis servisi ölçeklenebilir tüketicidir |
| Teşhis → karar akışı | Senkron çağrı, şema doğrulamalı | Sıralı hipotezler | Şema dışı çıktı reddedilir, insan incelemesine düşer |
| Karar → konsol | REST | İş emri kuyruğu | Sayfalama zorunlu; sıralama sunucu tarafında |
| Konsol → olay deposu | REST | Operatör kararı | Değişmez kayıt; güncelleme değil, yeni satır |
| Saha → olay deposu | REST veya toplu içe aktarım | Etiket | Geç gelen etiket kabul edilir; zaman damgası korunur |

#### Temel API sözleşmeleri

```http
POST   /v1/events                      # uçtan olay alımı
GET    /v1/events/{id}                 # olay + triyaj + teşhis birleşik görünüm
GET    /v1/queue?week=&limit=&cursor=  # haftalık sıralı liste (FR-501)
GET    /v1/cases/{id}/evidence         # kanıt paketi: seri, devre dağılımı, imza (FR-502)
POST   /v1/cases/{id}/decision         # sevk | ertele | kapat (FR-503)
POST   /v1/work-orders/{id}/label      # saha sonucu (FR-601)
GET    /v1/signatures?version=         # imza kütüphanesi, sürümlü (FR-303)
GET    /v1/models/{id}/calibration     # kapsama raporu (NFR-05)
```

### 3.4 Algoritmik sözleşmeler

Uygulama detayı değil, **modüller arası anlaşma**: her katmanın ne üretmek zorunda olduğu.

| Katman | Girdi | Çıktı | Değişmez kural |
|---|---|---|---|
| Tahmin | Geçmiş pencere, bilinen gelecek kovaryatlar, statik öznitelikler | Kuantil demeti | Nokta tahmini asla tek başına yayılmaz |
| Kalibrasyon | Kuantil demeti + kalibrasyon kümesi | Düzeltilmiş band + hedef α | Kapsama sapması raporlanabilir olmalı |
| Akut tespit | Düzeltilmiş band, gözlem | Normalize artık, birikim skoru | Tek örneklik sapma olay üretmez |
| Kronik tespit | Dondurulmuş referans, gözlem | Performans indeksi serisi + eğilim testi | Referans modeli hiçbir koşulda güncellenmez |
| Ayrıştırma | Devre bazlı artıklar | Yüzdesel katkı vektörü | Katkılar toplamı 1'dir — bu bir yorum değil kimliktir |
| Eşleştirme | İmza öznitelikleri | Sıralı imza adayları | Kütüphane dışından aday üretilemez |
| Karar | Hipotezler + maliyet parametreleri | Beklenen fayda, aksiyon | Negatif beklenen fayda sevk üretmez |

---

## 04 · Kısıtlar, riskler ve hafifletme planı

### 4.1 Fonksiyonel olmayan gereksinimler

| ID | Boyut | Gereksinim | Doğrulama yöntemi |
|---|---|---|---|
| `NFR-01` | Gecikme | Uç çıkarım < 200 ms/hane/döngü; teşhis < 5 sn; uçtan uca < 60 sn `[VARSAYIM]` | Yük testi, yüzdelik dilim raporu (p50/p95) |
| `NFR-02` | Mahremiyet | Ham tüketim serisi operatör çevrimini terk etmez; buluta yalnızca olay ve toplulaştırılmış istatistik gider | Ağ trafiği denetimi; sınır testi |
| `NFR-03` | Ölçeklenebilirlik | Bulut maliyeti ham veri hacmiyle değil olay sayısıyla ölçeklenmelidir | Hane sayısı 10× artırıldığında bulut maliyeti < 3× |
| `NFR-04` | Dayanıklılık | Hava servisi kesintisinde sistem durmaz; etkilenen pencereler `degraded` işaretlenir ve olay üretmez | Kaos testi: harici servis kapatılır |
| `NFR-05` | Denetlenebilirlik | Her olay, üreten model ve kalibrasyon sürümüyle yeniden üretilebilir olmalıdır | Rastgele 20 olay için yeniden üretim testi |
| `NFR-06` | Maliyet | Muhakeme katmanı olayların < %5'ine dokunur `[VARSAYIM]` | Ajan çağrı sayacı / toplam olay |
| `NFR-07` | Taşınabilirlik | Model en az iki dönüşüm yolundan üretilebilmelidir (MindSpore ve ONNX) | Her iki yoldan çıktı alınıp doğruluk farkı ölçülür |
| `NFR-08` | Soğuk başlangıç | Yeni hane 1. günden tahmin alır; kalibre alarm için ≤ 7 gün veri yeterlidir `[VARSAYIM]` | Yeni hane simülasyonu |

### 4.2 Risk kaydı

| ID | Risk | Etki | Olasılık | Hafifletme |
|---|---|---|---|---|
| `R-01` | **Doğrulama boşluğu.** Etiket olmadan performans ölçülemez; ölçülemeyen sistem yanlışlanamaz | Kritik | Yüksek | Sentetik arıza enjeksiyonu birincil yöntem olarak kurulur (ground truth tanım gereği elde edilir); uzman kör puanlaması ikinci kaynak; akran grubu tutarlılığı üçüncü |
| `R-02` | **Uç port riski.** Attention/GRU operatörlerinin dönüşüm desteği, nicemleme doğruluk kaybı | Yüksek | Yüksek | Araştırma riski değil *takvim* riski. Faz 2'nin 1. haftasında minimal bir blok dönüştürülür; ONNX yedek yolu paralel tutulur (NFR-07) |
| `R-03` | **Atıf–nedensellik karışması.** Kolineer özniteliklerde açıklanabilirlik atfı kararsızdır ve nedenmiş gibi okunur | Yüksek | Orta | Devre ayrıştırması birincil kanıt (aritmetik kimlik), atıf ikincil; farklı arka planlarda kararlılık raporlanır; dilde "atıf" ve "neden" ayrımı korunur |
| `R-04` | **Eğitim kontaminasyonu.** Anomali içeren veriyle eğitilen model anomaliyi tahmin etmeyi öğrenir | Yüksek | Orta | Temiz dönem eğitimi; işaretlenen segmentleri dışlayan iteratif yeniden eğitim; kronik dedektörün referansı hiç güncellenmez (FR-207) |
| `R-05` | **Saha ortağı bağımlılığı.** Operasyonel doğrulama bir ortak olmadan yapılamaz | Yüksek | Yüksek | Faz 1 iki parçaya bölünür; ilk parça hiçbir dış bağımlılık taşımaz. B planı: iki bağımsız uzmanın kör puanlaması |
| `R-06` | **Veri erişimi hukuku.** Birçok operatör ham müşteri verisini çevrimi dışına çıkaramaz | Kritik | Orta | Mimari baştan uç-öncelikli tasarlandı (NFR-02); bulut-öncelikli bir tasarım bu müşterilere hiç satılamazdı |
| `R-07` | **Örneklem darlığı.** 20 hane ile akran grubu istatistiği anlamsızlaşır | Orta | Kesin | Faz 1'de akran grubu kohortu tüm portföy alınır ve robust bir sapma ölçüsü kullanılır; genelleme iddiası yapılmaz |
| `R-08` | **Alarm yorgunluğu.** Sistem doğru olsa bile operatör listeye bakmazsa değer sıfırdır | Yüksek | Orta | Benimseme metriği KPI setine dahil edilir; liste uzunluğu sabit tutulur (haftalık 20); her satır kanıt taşır |
| `R-09` | **Muhakeme maliyeti.** Ajan maliyeti hane sayısıyla değil olay sayısıyla artar; naif tasarımda marj erir | Orta | Orta | Deterministik triyaj olayların büyük çoğunluğunu eler (NFR-06); muhakeme yalnızca kanıtların çeliştiği vakalara girer |
| `R-10` | **Altın dönem varsayımı.** Kronik dedektörün referans aldığı dönemin sağlıklı olduğu bilinmiyor | Orta | Yüksek | Sezonun en iyi performans gösteren dönemi referans alınır; gerçek kurulumda referans bakım sonrasına sabitlenir; varsayım açıkça beyan edilir |

### 4.3 Güvenlik ve veri koruma

- **Veri minimizasyonu.** Hane düzeyinde ham profil buluta hiç taşınmaz. Bu bir optimizasyon değil, KVKK/GDPR'ın veri minimizasyonu ilkesinin mimari karşılığıdır.
- **Kimliksizleştirme.** Bulut tarafında hane kimliği yalnızca operatörün kendi eşleme tablosunda çözülebilen bir vekil anahtar olarak tutulur.
- **Erişim ayrımı.** Operatör kendi portföyünü görür; sistem yöneticisi hane detayına erişemez, yalnızca toplulaştırılmış metrikleri görür.
- **Denetim izi.** Her karar (otomatik veya insan) değişmez kayıt olarak saklanır; güncelleme yerine yeni satır yazılır.
- **Sözleşmesel veri hakkı.** Pilot sözleşmelerinde türetilmiş veri ve etiketlerin mülkiyeti tanımlanmalıdır — bu, ürünün tek bileşik varlığının hukuki dayanağıdır.

### 4.4 Maliyet yapısı

| Kalem | Ölçekleme | Kontrol mekanizması |
|---|---|---|
| Depolama | Ham veri hacmiyle doğrusal | Uçta işleme; buluta yalnızca olay ve özet. Soğuk veri düşük çözünürlüğe indirilir |
| Çıkarım | Hane sayısıyla doğrusal ama katsayısı çok küçük | Küçük model bütçesi; uçta toplu çıkarım |
| Muhakeme | **Olay sayısıyla**, hane sayısıyla değil | Deterministik triyaj kapısı (NFR-06) — mimarideki tek marj koruma noktası |
| Entegrasyon | Operatör sayısıyla doğrusal, otomatikleşmez | Standart veri arayüzlerine sabitlenme; konnektörlerin yeniden kullanılabilir tutulması |

---

## 05 · Aşamalı geliştirme yol haritası

### Faz 1 · Çekirdek altyapı ve MVP

**Süre:** 10 hafta · **Dış bağımlılık:** ilk 6 hafta yok · **Amaç:** sistemin çalıştığını ölçülebilir biçimde göstermek.

| Kilometre | Hafta | Teslim | Çıkış kriteri |
|---|---|---|---|
| `M1.1` | 1–2 | Veri hattı, kalite kapıları, hane–devre envanteri | 20 hanenin hangi devreleri ve hangi dönemleri kullanılabilir olduğu belgelenmiş; gözlemlenebilir 5–7 anomali sınıfı listelenmiş |
| `M1.2` | 3–4 | Baseline modeller ve sentetik enjeksiyon çerçevesi | Enjeksiyon benchmark'ı çalışır durumda; baseline hata değerleri sabitlenmiş — hedef modelin yenmesi gereken sayı belli |
| `M1.3` | 5–6 | Kuantil tahmin + konformal kalibrasyon + kalıcılık filtresi | Ampirik kapsama ≈ nominal kapsama; yanlış alarm oranı hedeflenen seviyeye ayarlanabiliyor |
| `M1.4` | 7 | Devre ayrıştırma, imza kütüphanesi v1, kanıt paketi | Enjekte edilmiş arızalarda doğru devrenin işaret edilme oranı raporlanmış |
| `M1.5` | 8–9 | Karar akışı (yarı otomatik), haftalık liste üretimi | Haftalık 20 vakalık liste otomatik üretiliyor; her satır kanıt taşıyor |
| `M1.6` | 10 | Uzman değerlendirmesi, demo, sonuç raporu | İki bağımsız uzmanın kör puanlaması tamamlanmış; çevrimdışı yedeği olan canlı demo hazır |

> ### ⚠ Faz 1'in bölünme noktası
>
> **M1.1–M1.4 (hafta 1–7)** hiçbir dış tarafa bağlı değildir; tamamen mevcut veriyle yürütülür.
> **M1.5–M1.6 (hafta 8–10)** değerlendirme için insan gerektirir. Ortak bulunamazsa B planı devreye girer: uzman kör puanlaması.
> Bu bölünme, `R-05`'in mimari karşılığıdır.

#### Faz 1 başarı kriterleri

| Metrik | Baseline | Hedef | Durum |
|---|---|---|---|
| Kapsama sapması | — | ≤ %2 | `[ÖLÇÜLMEDİ]` |
| Tespit kalitesi (PR-AUC) | Basit eşik dedektörü | Anlamlı iyileşme | `[ÖLÇÜLMEDİ]` |
| Sunulan liste isabeti | — | 20 vakada ≥ 12 gerçek bulgu | `[ÖLÇÜLMEDİ]` |
| Tespit gecikmesi — akut | — | ≤ 6 saat | `[ÖLÇÜLMEDİ]` |
| Tespit gecikmesi — kronik | — | ≤ 30 gün | `[ÖLÇÜLMEDİ]` |
| Teşhis isabeti | Rastgele devre seçimi | top-1 ≥ %85 · top-3 ≥ %95 | `[ÖLÇÜLMEDİ]` |
| Uzman mutabakatı | — | ≥ %40 "giderim" oranı | `[ÖLÇÜLMEDİ]` |

> Tüm eşik değerleri hedeftir; hiçbiri ölçülmüş sonuç değildir. **Bu tabloyu doldurmak Faz 1'in tanımıdır.**

### Faz 2 · Genişleme ve entegrasyonlar

**Süre:** 3–6 ay · **Amaç:** sistemin gerçek bir operatör ortamında çalışması.

| Kilometre | Teslim | Çıkış kriteri |
|---|---|---|
| `M2.1` | Uç dağıtım: model dönüşümü ve Ascend üzerinde çıkarım | Her iki dönüşüm yolundan çıktı alınmış, doğruluk farkı ölçülmüş; gecikme bütçesi karşılanmış (NFR-01, NFR-07) |
| `M2.2` | Tam karar akışı: durum makinesi, guardrail, erken çıkışlar | Kanıta dayalılık oranı ölçülmüş; muhakeme katmanına ulaşan olay oranı hedefin altında (NFR-06) |
| `M2.3` | Operatör konsolu: interaktif liste, karar kaydı, kanıt görünümü | Gerçek operatörle en az 4 haftalık kullanım; benimseme metriği ölçülmüş (R-08) |
| `M2.4` | İkinci ve üçüncü arıza ailesi aynı hatta bağlanır | Yeni aile eklemenin boru hattında kod değişikliği değil, imza kütüphanesi girdisi gerektirdiği gösterilmiş |
| `M2.5` | Gerçek saha etiketi döngüsü | İlk teyit edilmiş etiketler olay deposunda; geri besleme hattı eşikleri güncelliyor |
| `M2.6` | Operatör veri entegrasyonu (standart arayüz) | İkinci bir operatör verisi, ilkinden bağımsız olarak ≤ 4 haftada bağlanabiliyor |

### Faz 3 · İyileştirme ve ölçeklenme

**Süre:** 6–12 ay · **Amaç:** tek pilottan çok operatörlü işletmeye geçiş.

| Kilometre | Teslim | Çıkış kriteri |
|---|---|---|
| `M3.1` | Çok uçlu filo yönetimi: uzaktan model dağıtımı, sürüm takibi | Uç yazılımı merkezî olarak güncellenebiliyor; sürüm sapması izlenebiliyor |
| `M3.2` | Etiket korpusundan sürekli öğrenme | Yeniden eğitilen modelin, sabit bir test kümesinde ölçülmüş iyileşme göstermesi |
| `M3.3` | Kalibrasyon sertifikasyonu ve ölçüm-doğrulama uyumu | Yanlış alarm oranının bağımsız olarak doğrulanabildiği bir raporlama biçimi |
| `M3.4` | Coğrafi genişleme: farklı iklim ve tarife rejimi | Yeni bölgede, transfer edilmiş modelin yerel baseline'ı yendiğinin gösterilmesi |
| `M3.5` | Rol bazlı çok kullanıcılı konsol ve API erişimi | Servis ağı ortaklarının kendi kuyruklarını API üzerinden çekebilmesi |

---

## 06 · Ekler

### Ek A · Kaynak künyesi

| Bulgu | Kaynak | Durum |
|---|---|---|
| %70–90 arıza yaygınlığı; %50–72 saha bulunma oranı; %5–10 soğutma yükü azaltımı | PNNL-30077 — *Automated Fault Detection & Diagnostics: Residential*, U.S. DOE / Pacific Northwest National Laboratory | `[DOĞRULANMIŞ]` |
| 20,7 TWh yıllık fazla tüketim; %9 artış | Winkler, Das, Earle ve ark. (2020), *Applied Energy* 278:115533 | `[DOĞRULANMIŞ]` |
| 104,2 milyon konut AMI sayacı (2022) | U.S. Energy Information Administration | `[DOĞRULANMIŞ]` |
| Avrupa akıllı sayaç penetrasyonu %63 (2024 sonu) | Berg Insight | `[DOĞRULANMIŞ]` |
| Devre seviyesinde aktif güç, 15 dk / 1 dk / 1 sn çözünürlük | Pecan Street Dataport ürün dokümantasyonu | `[DOĞRULANMIŞ]` |
| Tüm KPI eşikleri, gecikme bütçeleri, maliyet oranları | Proje ekibinin hedefleri | `[VARSAYIM]` |
| Pazar büyüklüğü, fiyatlandırma, birim ekonomisi | Türetilmiş tahmin — bu dokümanın kapsamı dışında | `[VARSAYIM]` |
| Rakip ürün yetenekleri | Kamuya açık konumlandırma; karşılaştırmalı test yapılmadı | `[VARSAYIM]` |

### Ek B · Açık kararlar

Aşağıdaki kararlar henüz verilmemiştir ve Faz 1'in ilk iki haftasında kapatılmalıdır.

| ID | Karar | Bağımlılık | Son tarih |
|---|---|---|---|
| `D-01` | **İlk arıza ailesi PV mi HVAC mı?** | 20 hanenin kaçında `solar` devresi olduğu — henüz sayılmadı | Hafta 1 |
| `D-02` | Modelleme çözünürlüğü 15 dk sabit mi, yoksa aile bazında değişken mi? | İmza özniteliklerinin 15 dk'da ayırt edici kalıp kalmadığı | Hafta 2 |
| `D-03` | Kronik dedektörün altın dönemi nasıl seçilecek? | Bakım kaydı yok; en iyi performans dönemi vekil olarak kullanılacak (R-10) | Hafta 2 |
| `D-04` | Akran grubu kohortu nasıl tanımlanacak? | 20 hanede alt kohort oluşturmak istatistiksel olarak mümkün değil (R-07) | Hafta 2 |
| `D-05` | Hava verisi hangi kaynaktan alınacak? | Austin 2018 için ışınım ve meteoroloji verisi kapsamı | Hafta 1 |

### Ek C · Terim karşılıkları

Dokümandaki teknik terimlerin sunumda kullanılacak sade karşılıkları.

| Doküman terimi | Teknik karşılığı | Sunumda kullanılacak ifade |
|---|---|---|
| Kalibre edilmiş band | Konformal tahmin aralığı (CQR + uyarlanabilir düzeltme) | "Yanlış alarm oranı önceden ayarlanabilen eşik" |
| Kalıcılık filtresi | Kümülatif toplam kontrol grafiği | "Üst üste tekrarlayan sapma" |
| Dondurulmuş referans | Sabitlenmiş baz model + eğilim testi | "Cihazın sağlıklı hâline göre karşılaştırma" |
| Devre ayrıştırma | Artık katkı vektörü | "Sapmanın hangi cihazdan geldiği" |
| Atıf | Öznitelik katkı analizi | "Hangi etkenin ne kadar payı olduğu" |
| Guardrail | Deterministik iddia doğrulayıcı | "Her sayının bir hesaba dayandığının kontrolü" |

---

*SilentWatt · Ürün ve Sistem Şartnamesi v0.9 — taslak · 8 Eylül 2026*

*Bu doküman canlı bir belgedir. `[VARSAYIM]` etiketli her satır, ölçüldüğünde `[DOĞRULANMIŞ]` hâline getirilmeli ve sürüm numarası artırılmalıdır.*
