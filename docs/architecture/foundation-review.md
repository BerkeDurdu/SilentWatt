# SilentWatt foundation teknik değerlendirmesi

Tarih: 16 Eylül 2026. Kapsam: mevcut repo, yerel ML foundation, konfigürasyon, PRD uyumu ve CI. Çalışan React/Express uygulamasının yeniden yazılması veya yeni bir dedektör geliştirilmesi bu incelemenin kapsamına alınmadı.

## Bulgular ve gerekli düzeltmeler

| Problem | Düzeltme |
|---|---|
| Baseline her çalıştırmada doğrudan test dönemini değerlendiriyordu. | Varsayılan geliştirme dönemi; test için açık `--evaluation-split test --allow-test`. Eğitim tabloları yalnız train verisiyle oluşur. |
| Yıllık kapsama üzerinden aday seçimi gelecekteki veri bulunurluğunu kullanıyordu. | Yıllık envanter ile model adaylığı ayrıldı. Adaylar yalnız eğitim döneminin geçerli kapsamı ve dışlama kanallarıyla seçilir. |
| Null olmayan satır sayısı, beklenen slot sayısına bölünüyordu; tekrarlar, negatif/sonsuz değerler, yanlış zamanlar payı şişirebilirdi. | Tekil, zaman ızgarasına uyan, dönem içindeki sonlu ve negatif olmayan hedefler sayılır; tekrarlar ayrı raporlanır. |
| Bir dakikalık dosyada yeni audit tekrar anahtarını kontrol etmiyordu. | Tüm dosyada tam UTC zaman anahtarı üzerinden kontrol eklendi; geniş ham tablo belleğe alınmaz. |
| Baseline elektrik tekrarlarını kabul ediyor, hava tekrarlarında ilk satırı sessizce seçiyordu. | Tekrar anahtarlarında modelleme durur. UTC/GMT hava metadata'sı ve saatlik ızgara doğrulanır. Elektrik kaynağındaki `-05`/`-06` dahil açık ofsetler korunur. |
| Eksik hedef/hava satırları çıktıdan düşüyor, eğitim desteği dışındaki sıcaklıklar global tahmin alıyordu. | Beklenen tüm değerlendirme slotları korunur. Ölçüm ve tahmin durumları, skorlanan payda ve dışlama sayıları raporlanır. Destek dışı tahminler sayısal bakım kanıtı üretmez. |
| Bölmeler ve önemli ayarlar doğrulanmıyor; konfigürasyondaki kuantiller sessizce yok sayılıyordu. | Kronoloji/örtüşme, zaman penceresi, dosya yolları ve pozitif parametre kontrolleri eklendi. Mevcut çıktı sözleşmesinin desteklemediği kuantiller açıkça reddedilir. |
| Model tablosu ve kaynak/kod kimliği çıktıda yoktu; koşular birbirinin üzerine yazılıyordu. | Konfigürasyon, kaynak ve paket kodu hashleri, çalışma ortamı ve öğrenilen kuantil tabloları kaydedilir. Yeni çıktı dizini zorunlu; dataset içine yazma reddedilir. |
| Bağımlılıklar kilitli değildi; CI Python cache yolu eksikti. Node 20 açıklaması mevcut geliştirme bağımlılıklarıyla uyumsuzdu. | Python 3.12 için temel ortam kilitlendi ve temiz ortamda kuruldu. CI kilit dosyasını kullanır; Node 22 ve `.nvmrc` eşlendi. |
| Dört küçük test yalnız yardımcı fonksiyonları kapsıyordu. | Sentetik uçtan uca senaryolar: held-out hedef değişimi, split erişimi, DST, tekrarlar, eksikler, destek dışı sıcaklık, kapsam paydası, kaynak değişmezliği ve byte düzeyinde tekrarlanabilir çıktı. |
| PRD FastAPI ve farklı klasörler önerirken repo Express kullanıyordu; kopyalanan audit betiği yanlış dizinden veri arıyordu. | PRD gerçek yapıya uyarlandı. B/C veri sınırı ve analitik sözleşme sahipliği açıklandı. Tarihsel betiğe açık giriş/çıkış yolları eklendi. |

## Doğrulama

- Python 3.12 izole ortamda kilitli bağımlılık kurulumu ve paket kurulumu başarılı; `pip check` temiz.
- 17 birim/entegrasyon testi geçti; özel Austin dosyaları CI testlerine dahil değildir.
- TypeScript tip kontrolü ve üretim derlemesi geçti. Yerel Node sürümü 26.4.0; CI Node 22 koşusu GitHub'da henüz çalıştırılmadı.
- Gerçek dosya denetimi: 873.286 adet 15 dakika satırı, 13.100.539 adet 1 dakika satırı ve 8.760 saatlik hava satırı tarandı. İki elektrik dosyasında tekrar zaman anahtarı bulunmadı. Üç kaynak hash'i tarihsel envanterle eşleşti; ham veriler değişmedi.
- Eğitim dönemi geçerli hedef kapsamı ≥%95 ve ek soğutma kanalı dışlamasıyla **8 aday** kaldı: 661, 1642, 2335, 3456, 6139, 7536, 7800, 8565. Önceki yıllık null olmayan ölçüm listesiyle aynı ölçüt değildir. Bu sonuç fiziksel cihaz/sağlık doğrulaması sayılmaz.
- Gerçek 661 hanesi, Temmuz geliştirme dönemi: 2.976 beklenen slot, 2.764 skorlanan slot; 5 eksik/geçersiz hedef, 212 eğitim sıcaklık desteği dışında slot, 0 eksik hava slotu. Dışlama sayıları örtüşebilir.
- Bu koşuda MAE 0,6571; ampirik bant kapsaması %91,75; ortalama bant genişliği 1,9114. Birim doğrulanmadığından bunlar kW/kWh olarak sunulmaz. Sonuç kalibre edilmemiş, tek haneli bir tahmin karşılaştırmasıdır; arıza tespit başarısı değildir.
- Tekrar üretim komutları [ML README](../../packages/ml/README.md) içinde. Yerel gerçek veri çıktıları `artifacts/review-2026-09-16/` altında, Git dışında tutulur.

## Açık riskler ve sonraki teslim sınırı

1. **Test bütünlüğü:** İlk foundation koşusu 661 hanesinin test sonuçlarını zaten açtı. Bu erişim geri alınamaz; sonuçlar keşifsel olarak tutulur. Nihai kör değerlendirme için görülmemiş veri planlanmalı.
2. **Veri anlamı:** Güç birimi, interval başlangıç/bitiş tanımı ve fiziksel cihaz eşlemesi sağlayıcı metadata'sıyla doğrulanmış değil. Hava birleştirmesi aynı UTC saatini kullanır; bu kabul fiziksel metadata onayı yerine geçmez.
3. **Veri yeterliliği ve mevsimsel destek:** 8 aday, PRD'deki en az 10 uygun hanelik olay kabul değerlendirmesi önkoşulunun altında. Negatif ölçümler mevcut konservatif kuralda geçersizdir; sensör gürültüsü toleransı metadata/eğitim verisiyle gerekçelendirilmeden gevşetilmez. Eğitimde yeterli soğutma davranışı varsayımı henüz kabul edilmedi. Temmuzdaki destek dışı slotlar bu riski görünür kılıyor. Eşik/bölme değişiklikleri test sonuçlarına bakılarak seçilmemeli.
4. **Ürün olgunluğu:** Konformal kalibrasyon, ani/yavaş dedektör, günlük kalite kapıları, 1 dakika çalışma imzaları, kanıt paketi ve gerçek API bağlantısı henüz yok. Bu inceleme bunları tamamlanmış göstermiyor.
5. **Saha doğrulaması:** Arıza etiketi ve bağımsız saha teyidi yok; sentetik olay deneyleri gerçek bakım başarısı sayılmaz. Olay düzeyinde yanlış alarm/yakalama/gecikme, ileride ayrı ölçülecek.
6. **Ekip entegrasyonu:** Demo `shared/types.ts` olasılık/kWh alanları ML çıktısının sözleşmesi değil. B sürümlü API ve kalıcılığı, C analitik kanıt/durum şemasını, A aynı sözleşmeyle kullanıcı akışını geliştirmeli. Demo hesapları ve bellek deposu gerçek pilot için yeterli değil.
7. **CI kapsamı:** Yerel kontroller başarılı; GitHub üzerinde bu yerel değişiklikler henüz yayımlanmadı. API auth/contract/E2E, lint ve çok haneli benchmark ayrı teslimlerdir. İsteğe bağlı ML extras bu temel kilidin parçası değildir.

Mevcut klasörleri taşımak, ikinci API servisi açmak veya GPU/LLM bağımlılığı eklemek için bu aşamada teknik gerekçe bulunmadı.
