# P0 entegrasyon ve doğrulama raporu

Tarih: 17 Eylül 2026. Çalışma dalı: `feat/ml-foundation`.
Veri kararları ve tekrar üretim:
[P0 veri/cohort kaydı](p0-data-decisions-2026-09-17.md).

## Değişiklik kapsamı

- Bekleyen 15 proje skill'i, `AGENTS.md`, README ve yönetici özeti incelendi.
- Üç sabit upstream commit'in arşivleriyle skill içerikleri byte düzeyinde
  karşılaştırıldı. Toplam 326 upstream dosyada fark/eksik/fazla yok.
- Eksik üç MIT lisans/copyright metni `docs/third-party/` altına eklendi;
  `THIRD_PARTY_NOTICES.md` tam kaynak yollarıyla güncellendi.
- `.codex/skills/README.md` ve `AGENTS.md` proje uygulama sınırlarını tanımlar.
  Genel örneklerin zaman serisinde rastgele CV, geleceğe bakan özellik, otomatik
  imputation/outlier temizliği veya yeni MLOps servisleri için gerekçe olmaması
  açıklandı. Context Mode için kapsam dışı kurulum tarifi kaldırıldı.
- Senior ML/Data Scientist skill'lerindeki altı `_execute()` scaffold'u
  işlem yapmadan başarı döndürüyor. Upstream kodu korunarak bu betiklerin proje
  doğrulamasında/CI'da kullanılması açıkça engellendi. Gerçek audit/baseline
  `packages/ml` içindedir; bu betikler uygulanmış pipeline sayılmaz.
- Yalnız eğitim verisini analiz eden küçük bir tekrar üretim betiği ve mevcut
  sentetik test fixture'ını kullanan bir regresyon testi eklendi.
- Veri kararları, 25 hanenin seçim muhasebesi, eşik duyarlılığı ve 8 adayın
  koşullu ekip karar kaydı hazırlandı. Alan sahibi onayı uydurulmadı.

Uygulama/ML runtime kodu, bağımlılıklar, config, eşikler, split'ler ve ham
kaynaklar değiştirilmedi. Yeni servis/model/kalibrasyon/dedektör eklenmedi.

## Skill güvenlik denetimi

`skill-security-auditor` önce kendi kodu okunarak, sonra 15 yerel skill dizinine
`--json` ile ayrı ayrı uygulandı. Ham sonuç: **14 PASS, 1 FAIL**, 1 kritik
örüntü eşleşmesi, 0 yüksek bulgu. Otomatik sonucu “hepsi PASS” diye değiştirmedik.

Tek eşleşme: `diagram-design/scripts/drawio_extract.py:96`,
`base64.b64decode(payload, validate=False)` — `OBFUSCATION`.
Manuel izleme: payload kullanıcı draw.io dosyasından gelir; çözülür, boyut
sınırlı zlib açılımından geçer ve XML veri olarak ayrıştırılır. `eval`/`exec`
veya shell yürütmesine aktarılmaz. 32 MiB giriş/64 MiB açılım sınırları,
DTD/entity reddi vardır. Bu özel eşleşme **yanlış pozitif olarak değerlendirildi**;
scanner suppression eklenmedi, kaynak değiştirilmedi.

Ek kontroller:

- 31 Python betiği sözdizimi açısından doğrulandı; güvenlikle ilgili dış süreç,
  dosya yazımı, ağ, suppression ve parser yolları incelendi.
- İncelenen subprocess çağrıları `shell=True` kullanmaz: git diff/log okuma
  veya auditor'un isteğe bağlı repo clone yoludur. Clone bu taramada çağrılmadı;
  silme kodu yalnız kendi geçici clone dizinini temizleme yolundadır.
- Skill dizininde hook/MCP/plugin manifesti, symlink veya yürütülebilir binary yok.
  Mevcut çıktı yazma seçenekleri kullanıcı tarafından açıkça seçilen dosyalara
  yöneliktir; bu entegrasyon betikleri otomatik çalıştırmaz.
- Scanner HTML içindeki script'leri kapsamaz. Ek olarak diagram skill'in
  `self_check.py` aracıyla **165 HTML asset** tarandı: 163 PASS, 2 FAIL (catalog dosyaları). HTML ağ referansları,
  script ve olay işleyicileri de incelendi: şablonlar Google Fonts CSS yükleyebilir;
  çevrimdışı/özel diyagramlarda yerel font kullanımı proje yönergesine eklendi.
- Skill'ler üst düzey talimatların yerine geçmez. Örnek rol/persistence ifadeleri
  kullanıcının kapsam ve güvenlik sınırlarını genişletmez. Suppression ifadeleri
  auditor'un tehdit örnekleri/regex tanımları ve geçici dizin temizliğiyle sınırlı
  olarak incelendi; otomatik PASS tek başına güvenlik sertifikası sayılmadı.

**Entegrasyon değerlendirmesi:** Yukarıdaki tek yanlış pozitif ve belgeli sınırlar
ile commit'i engelleyen çalıştırılabilir saldırı bulgusu saptanmadı. Statik tarama
gelecekteki güncellemeleri, tüm mantık hatalarını veya kaynak sahibinin güvenilirliğini
kanıtlamaz. Her güncellemede aynı kontroller yeniden yapılmalı.

## Çalıştırılan kontroller

| Kontrol | Sonuç |
| --- | --- |
| `python -m unittest discover -s packages/ml/tests -v` | **18/18 geçti**; mevcut 17 + yeni cohort diagnostik regresyonu |
| Yeni test kapsamı | Eksik satır/null/sonsuz/negatif ayrımı, 96 slot paydası, bitişik boşluk, toleransın salt analiz olması, gelecek ek kanalın seçime girmemesi, kaynak değişmezliği, eski audit hash'inin reddi |
| `python -m pip check` | Bozuk gereksinim yok |
| `python -m silentwatt_ml --help` | Audit/baseline CLI çalışıyor |
| `npm run typecheck` | Geçti |
| `npm run build` | Geçti; 45 modül derlendi |
| `npm audit --json` | 0 bildirilen açık; 199 bağımlılık envanteri |
| OSV `/v1/querybatch`, Python lock'taki 7 paket/sürüm | 7 yanıtın tamamında bildirilmiş advisory yok |
| Tam kaynak audit'i | 25 hane; 873.286 15m, 13.100.539 1m, 8.760 hava satırı; eski audit ile zaman alanı hariç eşit |
| Cohort diagnostikleri | 8 aday; tüm hanelerin slot/kapsam sonuçları paket audit'iyle eşit |
| Skill kaynak/lisans kontrolü | Sabit commit içerikleri birebir; 3 tam lisans metni dahil |
| Skill scanner / HTML kontrolü | 14 PASS + 1 incelenmiş yanlış pozitif FAIL; 165 HTML tarandı: 163 PASS, 2 catalog FAIL; 163 diyagram/şablon ayrıca exit=0 |
| Yerel belge/sözdizimi/secret kontrolü | 32 Python dosyası parse edildi; yerel belge linkleri sağlam; özel anahtar/token örüntü eşleşmesi yok |

Yerel runtime: Python 3.12.14, Node 26.4.0. CI Node 22 ve Python 3.12 kullanır;
uzak CI sonucu PR üzerinde ayrıca takip edilir. Güvenlik advisory sonuçları
17 Eylül 2026 sorgusunun anlık durumudur; skill scanner bu canlı sorguları yapmaz.
Ham denetim raporları yerel `artifacts/p0-2026-09-17/` altında Git dışında.
Temel pipeline'ın sentetik tekrar üretilebilirlik/held-out/DST kontrolleri geçti;
yeni gerçek baseline veya test metriği hesaplanmadı.

## Commit öncesi `ponytail-review`

- Mevcut audit/parser/target kalite fonksiyonları yeniden kullanıldı; ikinci
  pipeline, yeni bağımlılık veya servis eklenmedi.
- Tek snapshot analiz betiği tercih edildi; genel raporlama framework'ü kurulmadı.
  Yeni test mevcut sentetik fixture üzerinde tek senaryo olarak tutuldu.
- Upstream skill ağacı 326 dosya, yaklaşık 3,9 MB. HTML örnekleri dahil kaynak
  içeriği eksiksiz korundu; yalnız üst README'deki kapsam dışı kurulum reçetesi
  çıkarıldı. Rastgele asset silmek skill içi referansları bozacağı için yapılmadı.
- Ürün kodu veya eşiklerde gereksiz refactor yok. Kalan belgeler kullanıcının
  istediği kanıt, karar kaydı ve lisans yükümlülüğü için gerekli.

Sonuç: Ek karmaşıklık azaltımı gerektiren bulgu yok.
Yerel değişikliklerde `git diff --cached --check` temizdir. Byte eşitliği korunan
upstream dosyaların mevcut whitespace uyarıları biçimsel ithalat borcu olarak
bırakıldı; upstream içerik kopyasında toplu format/refactor yapılmadı.

## Açık kalan sınırlar

Birim, interval, fiziksel kanal eşlemesi, negatif ölçüm politikası ve nihai cohort
onayı alan sahibini bekliyor. 10 hane hedefi sağlanmadı. Günlük kalite/çalışma
imzası/kalibrasyon ve görülmemiş kör değerlendirme bu teslimde uygulanmış değildir.
Bu kararların açık kalması belgelerin/skill entegrasyonunun PR olarak teslimini
engellemez; veri kapısının veya MVP'nin tamamlandığı anlamına gelmez.


## P0 yeniden inceleme düzeltmesi

Önceki “172 HTML kontrolü geçti” ifadesi yanlıştı: 172 dosya değil, çıktı
satırıydı; ilk komutun exit kodu sonraki komutla maskelenmişti. Gerçek sonuç
165 dosyada 163 PASS / 2 FAIL, toplu çıkış kodu 1'dir. Bu düzeltme önceki
kanıt iddiasını geçersiz kılar; ham rapor değiştirilmedi.

- `icons.html`: iki dış kaynak atıf bağlantısı ve erişilebilir bağımsız SVG
  olmaması. Bu dosya bir ikon kataloğudur; dış bağlantılar navigasyon içindir.
- `index.html`: yerel iframe, katalog seçim script'i, bağımsız erişilebilir SVG
  ve motion-root yokluğu. Script'in iframe kaynağı statik tab etiketlerinden
  `example-<type><variant>.html` üretir; ağdan veri/kod indirme veya dış girdiyi
  çalıştırma yolu bulunmadı. Bu dosya galeridir, yayımlanacak diyagram değildir.

İki bulgu genel taramada FAIL olarak korunur; kataloglara diyagram teslim
sözleşmesi uygulanması olarak manuel gerekçelendirilmiştir. Gerçek 158 örnek
ve 5 şablon, `subprocess.run(..., check=True)` ile ayrıca doğrulandı: **163/163,
exit=0**. Vendor içeriği veya kontrol kuralları değiştirilmedi.

Yeniden doğrulama: 18/18 test, pip check, typecheck/build; skill scanner yine
14 PASS / aynı bir base64 FAIL; pinned kaynak içerikleri eşit. PR #1 açık,
head `0ccdfb5b0c016d241682943ec011902ede9f0e13` üzerinde ML/web/GitGuardian
başarılıydı. Yeni P1 sonuçları bu tarihsel P0 kontrolünün yerine geçmez.

Tam kaynak audit’i yeniden çalıştırıldı: zaman alanı dışında P0 ile aynı; üç kaynak hash’i eşit. Eğitim cohort diagnostikleri de birebir aynı. Teknik P0 yeniden doğrulaması bu raporlama düzeltmesiyle tamamlandı. D-01–D-05 alan sahibi kararları açık kalır; ilk P0 kapsamı bunları kanıtla kaydetmeyi gerektiriyordu, dışarıdan onay uydurmayı değil. P1 yalnız koşullu çevrimdışı araştırma olarak ilerler.
