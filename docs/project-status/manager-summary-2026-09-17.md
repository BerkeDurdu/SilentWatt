# SilentWatt Yönetici Özet Raporu

**Tarih:** 17 Eylül 2026
**Genel durum:** AMBER — teknik foundation çalışıyor; ürünün anomali tespit ve bakım önerisi akışı henüz tamamlanmadı.
**Çalışma dalı:** `feat/ml-foundation`
**Son temel commit:** `b52e6d5 feat(ml): veri denetimi, baseline ve test altyapısını kur`

## Yönetici kararı

Çalıştırılabilir audit/baseline ve tekrar üretilebilirlik temeli kurulmuştur; veri hazır kapısı henüz tamamlanmamıştır. Önce açık veri/cohort kararları netleştirilmeli; sonraki uygulama yatırımı kalibrasyon ve olay tespiti olmalıdır; yeni model ailesi, GPU veya LLM eklemek şu aşamada öncelik değildir.

## Tamamlanan işler

- Python ML paketi, konfigürasyon, kilitli bağımlılıklar ve CI akışı oluşturuldu.
- 15 dakikalık elektrik, 1 dakikalık elektrik ve saatlik hava verisi için kaynak denetimi hazırlandı.
- Veri sızıntısını önleyen train/calibration/development/test ayrımı uygulandı.
- Baseline yalnız train döneminden öğreniyor ve varsayılan olarak development döneminde ölçülüyor.
- Test dönemi açık opt-in olmadan kullanılamıyor.
- Yinelenen zaman anahtarları, DST, eksik/negatif/sonsuz hedefler, eksik hava ve eğitim desteği dışındaki sıcaklıklar kontrol ediliyor.
- Model çıktıları konfigürasyon, kaynak hash’i, kod hash’i, runtime ve öğrenilmiş kuantil tablolarıyla izlenebilir hale getirildi.
- P0 incelemesinde 18 sentetik birim/entegrasyon testi geçti (17 mevcut + 1 cohort diagnostik regresyonu).
- TypeScript typecheck ve üretim build başarılı.
- 15 Codex proje skill’i seçilerek `.codex/skills` altına eklendi; kaynak commit ve lisanslar kaydedildi.

## Veri ve model kanıtı

- Tarama kapsamı: 873.286 adet 15 dakikalık satır, 13.100.539 adet 1 dakikalık satır, 8.760 saatlik hava verisi.
- Kaynak dosyalarda yinelenen elektrik zaman anahtarı bulunmadı; kaynak hash’leri önceki envanterle eşleşti.
- Eğitim dönemi geçerli kapsamı ve ek soğutma kanalı dışlamasıyla **8 aday hane** kaldı:
  `661, 1642, 2335, 3456, 6139, 7536, 7800, 8565`.
- PRD’deki en az 10 uygun hane kabul hedefi henüz karşılanmadı.
- 661 hanesi için development değerlendirmesi: 2.976 beklenen slot, 2.764 skorlanan slot, 5 eksik/geçersiz hedef, 212 eğitim sıcaklık desteği dışı slot.
- Baseline sonucu: MAE `0,6571`, ampirik bant kapsaması `%91,75`, ortalama bant genişliği `1,9114`.
- Güç birimi doğrulanmadığı için bu sayılar kW/kWh veya saha arıza başarısı olarak yorumlanamaz.

## Henüz tamamlanmayan ürün parçaları

- Konformal kalibrasyon.
- Ani sapma ve yavaş bozulma dedektörleri.
- Günlük veri kalite kapıları.
- 1 dakikalık çalışma/imza özellikleri.
- Sıralanan arıza hipotezleri ve kanıt paketi.
- Express API’ye gerçek ML artifact aktarımı.
- UI’da gerçek veriyle vaka/inceleme akışı.
- Sentetik olaylarla olay düzeyinde yanlış alarm, yakalama ve gecikme ölçümü.
- Görülmemiş veriyle nihai kör değerlendirme.

## Ana riskler ve kararlar

1. **Veri yeterliliği:** 8 aday hane, hedeflenen 10 hanenin altında. Ekip, kapsam kuralını gevşetmeden önce negatif ölçümlerin sensör gürültüsü mü yoksa geçersiz kayıt mı olduğunu doğrulamalıdır.
2. **Veri anlamı:** Güç birimi, interval semantiği ve `air1` kanalının fiziksel HVAC eşlemesi sağlayıcı metadata’sıyla doğrulanmadı. Ürün dili “air1 tüketim sapması” seviyesinde kalmalıdır.
3. **Test bütünlüğü:** İlk foundation çalışmasında test dönemi incelendi. Bu nedenle mevcut test metrikleri nihai kör test olarak sunulamaz.
4. **Ürün iddiası:** Mevcut sistem beklenen tüketimi karşılaştırır; doğrulanmış fiziksel arıza veya tasarruf tespiti yapmaz.
5. **Entegrasyon:** Demo `shared/types.ts` içindeki olasılık/kWh alanları ML kanıt sözleşmesi değildir. B ve C birlikte sürümlü evidence şemasını tanımlamalıdır.
6. **Git durumu:** Foundation commit’i mevcut; P0 skill/dokümantasyon ve cohort incelemesi ayrı teslim olarak hazırlanmıştır. Commit/PR ve CI için GitHub kaydı esas alınmalıdır.

## Ekip bazında sonraki teslimler

| Sahip | Sonraki teslim |
| --- | --- |
| Yusuf / Rol C | Kalibrasyon veri akışı, kalite kapıları ve iki dedektörün development verisinde ilk sürümü |
| Muharrem / Rol B | ML artifact/evidence sözleşmesi, saklama ve Express API entegrasyon sınırı |
| Berke / Rol A | Gerçek kanıt paketini gösterecek vaka liste/detail akışı ve belirsizlik dili |
| B+C | Birlikte veri birimi, kanal eşlemesi ve en az 10 hane hedefi için karar kaydı |

## Yönetici için sonraki geçiş ölçütü

Kalibrasyonlu tahmin bantları, olay düzeyinde iki dedektör, versiyonlu kanıt JSON’u ve en az bir gerçek UI/API uçtan uca akışı çalışmadan proje “MVP tamamlandı” olarak işaretlenmemelidir.

## P0 inceleme eki

[Veri karar kaydı ve 8 aday analizi](p0-data-decisions-2026-09-17.md) 25 hanenin dışlama nedenlerini, yalnız eğitim verisinden eşik duyarlılığını ve Muharrem/B+C onay sorularını içerir. %95 eşiği ve negatif politika değiştirilmedi; 8 adayın ekipçe nihai onayı açık. [Güvenlik ve doğrulama raporu](p0-verification-2026-09-17.md) skill kaynak/lisans kontrolünü ve test kanıtlarını içerir.
