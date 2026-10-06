---
type: map
area: process
updated: 2026-10-06
---

# Kararlar ve açık sorular

Tek kayıt. Resmi ID'ler ekibe aittir (P0 karar kaydı: `D-`, `C-`; PRD: `A-`, `R-`,
`DQ-`, `KPI-`, `G`). Burada yalnız durumları takip edilir ve birbirine bağlanır. Resmi
ID'si olmayan konular geçici `Q-` alır; ekip resmi ID verince satır ona taşınır.

Durumlar: `açık` → `kanıt toplanıyor` → `öneri hazır` → `ekip kararında` → `kapandı`;
ayrıca `ertelendi`.

Kaynak kısaltmaları: **P0** = [P0 karar kaydı](../docs/project-status/p0-data-decisions-2026-09-17.md),
**P1** = [P1 raporu](../docs/project-status/p1-ml-results-2026-09-17.md),
**PRD** = [Teknik PRD v1.1](../docs/product/SilentWatt-Teknik-PRD-v1.1.md).

## Veri kararları (P0 karar kaydı, B+C)

| ID | Konu | Durum | Sahip | Eşleşen | Onaya kadar uygulanan | Kanıt / not |
|---|---|---|---|---|---|---|
| D-01 | Güç birimi (W, kW, enerji?) | öneri hazır | B+C | A-01, R-04 | `source_unit_unverified`; kW/kWh yok | P0 §5 · [kaynak anlamı notu](data/source-semantics-evidence.md): kW aralık ortalaması (GES kapasitesiyle oran, cihaz büyüklükleri); resmî sözlük okunmadı |
| D-02 | 15 dk değerin anlamı ve zaman etiketi | öneri hazır | B+C | A-01, R-04 | Aynı UTC saatine hava eşlemesi | P0 §5 · [kaynak anlamı notu](data/source-semantics-evidence.md): [t, t+15) içindeki 1 dk ortalaması, etiket aralık başı (25 hane, 6 kanal, train) |
| D-03 | `air1` hangi devreyi ölçüyor? | kanıt toplanıyor | B+C | A-02 | "air1 kanal sapması" dili | P0 §5 · [kaynak anlamı notu](data/source-semantics-evidence.md): `air1` kompresör, `furnace1` iç ünite fanı gibi davranıyor; 9278 muhtemelen ısı pompası · EDA 02 (2026-10-06): 9278 5 °C altında slotların %76,8'inde çalışıyor |
| D-04 | Negatif değerler: gürültü mü, geçersiz mi? | kapandı | B+C | A-05, DQ-06, C-02 | ±0,01 simetrik ölü bant: \|air1\| ≤ 0,01 kapalı sayılır ve 0 okunur; air1 < −0,01 geçersiz; ham veri korunur (config `target_dead_band`, P1 protokolü `p1-v2`, `89a4c67`) | Karar: Yusuf, 2026-10-06; Muharrem'e bildirilecek · [negatif değerler notu](data/negative-values-sensor-floor.md) · [p1-v2 raporu](../docs/project-status/p1-v2-results-2026-10-06.md) · kural yalnız hedef kanal için; `solar`/`grid` negatifleri fiziksel ([kanal notu](data/channel-inventory-and-metadata.md)) |
| D-05 | Cohort onayı | kapandı | B+C | A-10, C-01 | 21 hane: yalnız train, %95 kapsam, ek soğutma kanalı yok, ölü bant kuralı. Sayı kuralın sonucudur, hedef değildir | Karar: Yusuf, 2026-10-06; Muharrem'e bildirilecek · P0 v2 audit (`artifacts/p0-2026-10-06/final/`) · [p1-v2 raporu](../docs/project-status/p1-v2-results-2026-10-06.md) · dışarıda: 4031 (air1 verisi yok), 5746, 7951, 9922 (ek soğutma kanalı) · önceki 8 aday P0 §2 |

## Değişiklik önerileri (P0 §6, hiçbiri uygulanmadı)

| ID | Öneri | Durum | Bağlı | Not |
|---|---|---|---|---|
| C-01 | Önce metadata ve ek uygun hane verisi iste | ekip kararında | D-05 | En az 2 ek uygun hane gerekir |
| C-02 | D-04 sonrası sensör toleransını ayrı değerlendir | ekip kararında | D-04, A-05 | Yeni kanıt: [negatif değerler notu](data/negative-values-sensor-floor.md) |
| C-03 | %95 eşiğini düşürmek — şu an desteklenmiyor | ekip kararında | D-05 | %94 → 9, %93 → 11 aday; hedef sayıya göre ayar yok |
| C-04 | Ek kanal dışlamasını kaldırmak — şu an desteklenmiyor | ekip kararında | D-03 | Yalnız 7951 eklenir (8 → 9) |

## PRD varsayımları (yukarıda eşlenmeyenler)

| ID | Konu | Durum | Sahip | Eşleşen | Not |
|---|---|---|---|---|---|
| A-03 | Hava dosyasının kaynağı ve sürümü | açık | B | — | Metadata'da yalnız UTC/GMT ve saatlik ızgara kontrol ediliyor |
| A-04 | Eğitimde yeterli soğutma ve sıcaklık desteği | kanıt toplanıyor | C | R-06, DQ-08 | p1-v1 (8 hane): Temmuz'da her hanede ≥ 212 slot destek dışı (6139: 260); skorlanan pay %56,38 (P1). EDA 02 (21 hane, 2026-10-06): train maksimumu 37,2–37,5 °C, Temmuz 41,2 °C; Temmuz'un 12 gününde hiçbir hane değerlendirilemiyor; 262/651 hane-gün dışarıda (253'ünde neden destek dışı sıcaklık); kesintisiz dönem 4–17 Temmuz. Seçenek: Haziran'ı eğitime katmak; dönem rollerini değiştirir, ekip kararı. Öneri (MVP): protokol aynı kalır, değerlendirilemeyen günler ekranda açıkça gösterilir. 6 Ekim ölçümü: Haziran'ın en yüksek sıcaklığı 37,8 °C; Haziran eğitime girse 253 günden yalnız 1'i geri gelir. **Karar (Yusuf, 2026-10-06): Haziran eğitime katılmaz;** kalibrasyon ve dedektör referansı olarak kalır, MVP'de bu günler "değerlendirilemedi" gösterilir. Takip: Q-18 (kısmi gün), Q-19 (mevsim kayması) |
| A-06 | Referans dönemin fiziksel sağlığı | açık | C | R-02 | Mevcut veriyle kapanamaz; pilot gerekir |
| A-07 | Hedef kullanıcı ve bağımsız uzman erişimi | açık | A | — | PRD §15.3 |
| A-08 | Google Cloud kredisi, bölge, bütçe, veri yükleme hakkı | açık | B | R-11 | Repoda kanıt yok (PRD §6.3). Verinin kullanım koşulu 2026-09-27'de değerlendirildi (alınmış kararlar); kredi, bölge ve bütçe açık |
| A-09 | Repo yapısı ve varsayılan dal | açık | B | — | Yapı 2026-09-16'da belgelendi (PRD §17); dal koruması doğrulanmadı |
| A-11 | Huawei kredisi ve yarışma koşulları | açık | B | R-13 | PRD §6.4 |

## Açık sorular (second_brain, resmi ID yok)

| ID | Soru | Durum | Sahip | Eşleşen | Kanıt / not |
|---|---|---|---|---|---|
| Q-01 | Donma kuralı standby / sabit düşük okumayı da eliyor mu? | kanıt toplanıyor | B+C | DQ-07, A-05 | Ölü bantla kapalı okumalar donma başlatmıyor: 6139 9 → 150, 7800 46 → 149 uygun train günü (2026-10-06). 2361 (78 gün) ve 3039 (50 gün) 0,01'in üstündeki sabit okumalar yüzünden hâlâ donma şüphesinde; 1 dk veriyle incelenecek · [not](data/negative-values-sensor-floor.md) · EDA 02: ölü bandın üstünde, çalışma eşiğinin altında kalan train okuması payı 2361 %58,8, 3039 %38,3, 9278 %48,3 (diğer haneler ≤ %2,7) |
| Q-02 | Nihai kör değerlendirme için görülmemiş veri | açık | B+C | KPI-01…09 | 661 testi 16 Eylül'de açıldı ([foundation-review](../docs/architecture/foundation-review.md), risk 1) · P1 açık karar 4 |
| Q-03 | Kalibre kapsama %87'nin altında; üst sınır çok sık aşılıyor | kapandı | C | KPI-02 | p1-v2 (21 hane): kalibre kapsama B0 %86,25, B1 %83,68; üst sınır aşımı B0 %12,78, B1 %16,31 (hedef ≈ %5); klima çalışırken kapsama B0 %80,77. Haziran'da qhat≈0 olan hanelerde de Temmuz'da aşım var: mevsim kayması. Öneri: üst sınırı ayrı kalibre etmek (PRD v2.0) · [p1-v2 raporu](../docs/project-status/p1-v2-results-2026-10-06.md) · EDA 02 (2026-10-06): Haziran'da (kalibrasyonun kendi verisi) B0 alt sınır aşımı %1,7, üst %8,3 (hane medyanı): simetrik CQR ıska payını sıfırlar yüzünden üst tarafa yığıyor. Öneri: dedektörün gerçek veri koşusundan önce asimetrik CQR (alt ve üst ayrı ayrı %5; Romano vd. 2019) ile p1-v3. Mevsim kaymasını çözmez. 6 Ekim keşif ölçümü (Temmuz, B0, slot toplamı): üst sınır aşımı %12,78 → %8,20, %15'in üstündeki hane 8 → 0, kalibre kapsama %86,25 → %90,34, klima çalışırken kapsama %80,77 → %87,13, bant genişliği +%5. **Karar (Yusuf, 2026-10-06): asimetrik CQR, `p1-v3` olarak dedektörün gerçek veri koşusundan önce;** resmî sayılar p1-v3 koşusundan gelir. Kalan mevsim kayması: Q-19 |
| Q-04 | ML kanıt JSON'u ile API arasındaki sözleşme | öneri hazır | B (anlam: C) | R-10 | `shared/types.ts` yalnız demo sözleşmesi ([ml-pipeline](../docs/architecture/ml-pipeline.md)) · 2026-10-06: kanıt sözleşmesi v0.1 taslağı C'den (`6152229`: [belge](../docs/architecture/evidence-contract.md), `shared/evidence.ts`, sentetik örnekler, `server/explain/index.ts` arayüzü); Muharrem'in incelemesi bekleniyor. Konsol A'da, API B'de |
| Q-13 | Kapsamı `air1` dışındaki ekipman ailelerine genişletmek (HVAC, buzdolabı, GES; tüm ev bağlam) | öneri hazır | A+B+C (öneri: C) | PRD §0.1, §3.1, D-05 | Teknik sunum geri bildirimi (Yusuf'un aktarımı, 2026-09-27) · [kapsam önerisi](product/scope-broadening-proposal.md) · önerilen görüşme 1–2 Ekim |
| Q-14 | Test dönemi (Ağu–Ara) tüm kanallar için kapalı mı kalsın? | öneri hazır | Yusuf (C) | Q-02, AGENTS.md değişmezleri | Öneri: evet. Değer analizleri Oca–Tem, eşikler yalnız train, kanal varlığı gibi envanter tüm yıldan. Yeni ailelerin test dönemine yalnız envanter düzeyinde bakıldı |
| Q-15 | Açıklama katmanı (vaka metni): içerik ve metin kalkanı C'de; sunucu kodunu (`server/explain`) kim yazar? | ekip kararında | B+C | FR-13, M08 | Açıklama agent'ı 2026-10-06'da oturum kapanırken durduruldu (commit yok). Analitik kısım kanıtta zaten var (`recommendation_code`, `reasons`, kütüphane `rec-0.1`). **C'nin kararı (Yusuf, 2026-10-06):** metin kataloğu (kod → TR/EN cümle, sınırlamalar, yasak ifade listesi) ve PR'da ifade kontrolü C'de; `explainCase` sunucu kodu B'de; LLM'de istem ve metin kalkanı C, entegrasyon B. Muharrem'in onayı bekleniyor |
| Q-16 | B0/B1'e hafta günü özelliği eklensin mi? | ertelendi | C | — | EDA 02: Mayıs'ta hafta sonu ile hafta içi çalışma payı farkı yaklaşık ±6 puana kadar (8565'te hafta sonu daha az, 3039'da daha çok). B0'ın sıcaklık × saat tablosunu bölmek destek dışı slotları artırır. 6 Ekim ölçümü: Haziran'da hafta sonu ile hafta içi arasındaki günlük z farkı medyan 0,37 (mutlak), hiçbir hanede 1'in üstünde değil; Temmuz'da hane başına yaklaşık 5 hafta sonu günü var, sonuç güvenilir değil. **Karar (Yusuf, 2026-10-06): MVP'ye eklenmez;** 30 Ekim'e B1 deneyi. Dedektör koşusunda alarmların hafta sonu payı raporlanır |
| Q-17 | Train'deki olağandışı günler (ev boş, çok yüksek tüketim) eğitimden çıkarılsın mı? | kapandı | B+C | — | EDA 02: 21 hanede 33 olağandışı yüksek, 45 sıcakta sıfıra yakın gün (betimleyici tarama). 6 Ekim ölçümü: sıfıra yakın 45 günün hepsi Şubat–Nisan'da, yüksek 33 günün 30'u Mayıs'ta; tarama anomaliyi değil klimanın sezona açılmasını yakalıyor (9019'un günleri yöntem kaynaklı). **Karar (Yusuf, 2026-10-06): çıkarılmaz;** veri kuralı değişmez. Muharrem'e bildirilecek. Kök neden: Q-19 |
| Q-18 | Sıcaklık desteği dışında birkaç saati olan günler, desteklenen saatleriyle "kısmi gün" olarak puanlansın mı? | açık | C | A-04, DQ-08 | 6 Ekim ölçümü: 226 Temmuz hane-günü yalnız sıcaklık desteği yüzünden düşüyor; 143'ünde yalnız 2–4 saat destek dışında. Bu günlerin desteklenen saatlerinde üst sınır aşımı %6,2 (puanlanan günlerde %12,8). Dedektörün günlük istatistiği (toplam) kısmi günde Haziran'ın tam günleriyle karşılaştırılamaz; ölçek yeniden tasarlanmalı. En sıcak saatler yine kör kalır. Hedef: 30 Ekim |
| Q-19 | Mevsim kayması: model sıcaklığı ve saati biliyor, mevsimi bilmiyor. Mevsime duyarlı eğitim denensin mi? | açık | C | Q-03, A-04, Q-17, R-06 | 6 Ekim ölçümü: B0'ın ham q95'i Haziran'da %13,7, Temmuz'da %19,6 aşılıyor (hedef %5). Olağandışı train günleri sezon geçişinde. Adaylar: yalnız sezon içi günlerle eğitim, son haftalarla (kayan pencere) eğitim, ısı geçmişi özelliği. Kör test açılmadan Temmuz'da karşılaştırılır. Hedef: 30 Ekim |

### Süreç ve araçlar

| ID | Konu | Durum | Sahip | Not |
|---|---|---|---|---|
| Q-05 | `CLAUDE.md` var mı, içinde ne olacak? | açık | Yusuf | Repoda CLAUDE.md yok; kullanıcı hazırlayacak. Taslak öneri sohbette sunuldu; değişmezler 2026-09-23'te AGENTS.md'ye taşındı. 2026-09-26: oturum başlangıcı AGENTS.md "Session Start" bölümüne yazıldı |
| Q-06 | `.obsidian/` için `.gitignore` kaydı | ertelendi | Yusuf | O zamana kadar `.obsidian/` commit edilmez |
| Q-07 | Notebook testleri CI'da çalışmıyor | açık | C | [ci.yml](../.github/workflows/ci.yml) yalnız `packages/ml/tests` çalıştırıyor |
| Q-08 | Repo dışında eski PRD v1.1 kopyası (`../Dokümanlar/`, 34 satır farklı) | açık | Yusuf | Geçerli olan repodaki PRD |
| Q-09 | Notebook ve second_brain için commit/dal kararı | açık | Yusuf | 2026-09-26: skill taşıması, AGENTS.md ve second_brain `feat/ml-foundation`'a commit ve push edildi; CI geçti. Notebook açık: çıktılarında birkaç ham satır örneği var; AGENTS.md'ye göre ham veri commit edilmez |
| Q-10 | `mattpocock-skills` kurulum yöntemi (6 skill'i kopyalama mı, plugin mi) | açık | Yusuf | Plugin tek tek kapatılamıyor; inceleme 2026-09-22'de `959a8e9` üzerinde yapıldı ([.claude/skills](../.claude/skills/README.md)). 2026-09-26: depo o commit'ten 10 commit ilerledi; kurulumdan önce inceleme tazelenmeli |
| Q-11 | Demo yönetici hesabı canlı derlemede de açık; parola herkese açık README'de | açık | B | `server/store.ts` demo kullanıcılarını `--prod` modunda da oluşturuyor. İnternete açılmadan önce kapatılmalı (PRD NFR-05, NFR-06) |
| Q-12 | Test standardı: `unittest` kalsın, `pyproject.toml`'daki kullanılmayan `pytest` kaldırılsın mı? | öneri hazır | C | 37 test `unittest` ile; `dev` ekstrası pytest ve ruff listeliyor, ikisi de kullanılmıyor. Okunabilirlik için `subTest` ve elle yazılmış beklenen değerler önerildi |

## Sürüm kapıları (PRD §19.3)

| Kapı | Durum | Eksik / not |
|---|---|---|
| G0 Veri hazır | açık | Negatifler (D-04) ve cohort (D-05) 2026-10-06'da kapandı: 21 hane. Birim ve interval (D-01, D-02) öneri hazır, ekip kararı bekleniyor. Var olanlar: kaynak hash'leri (P0, 2026-10-05'te yeniden doğrulandı), split'ler (config), hane bazında sıcaklık desteği (P1). |
| G1 Analitik hazır | açık | B0/B1 ve CQR yalnız development taramasında; dedektörler yok; KPI'lar test döneminde ölçülmedi. |
| G2 Ürün akışı | başlamadı | Konsol örnek veriyle çalışıyor; ML bağlantısı yok (Q-04). |
| G3 İşletim | başlamadı | Dağıtım, E2E, yedek/geri dönüş yok. |
| G4 İddia kontrolü | sürekli kural | kW/kWh, "arıza doğrulandı" ve tasarruf iddiası yok. |

## KPI durumu (development taraması; test ölçümü değil)

| KPI | Hedef (PRD §15.2) | Development sonucu (P1) |
|---|---|---|
| KPI-01 | B1 pinball < B0 | Sağlanmadı: eşit hane pinball B1 0,2353 > B0 0,1771 (p1-v2, 21 hane) → B0 korunur. p1-v1 (8 hane): B1 0,216709 > B0 0,168172 |
| KPI-02 | Kalibre kapsama %87–93 | Sağlanmadı: B0 %86,25, B1 %83,68 (p1-v2). Üst sınır aşımı B0 %12,78, B1 %16,31 (testli metrik, `f660801`) (Q-03) · [p1-v2 raporu](../docs/project-status/p1-v2-results-2026-10-06.md) |
| KPI-03 | Genişlik ≤ 1,10 × B0 | Kapsama koşulu sağlanmadığı için değerlendirilemez |
| KPI-04…09 | Olay yakalama, gecikme, alarm yükü, veri hatası, izlenebilirlik, karar akışı | Ölçülmedi (dedektör, benchmark, API yok) |

## Alınmış kararlar (şu an uygulanan kurallar)

| Tarih | Karar | Kaynak |
|---|---|---|
| 2026-09-16 | Mevcut Express + React korunur; ikinci FastAPI servisi yok; `apps/`, `services/` yalnız gerçek ihtiyaçta | [ml-pipeline](../docs/architecture/ml-pipeline.md), PRD §6.1 |
| 2026-09-16 | Aday seçimi yalnız train döneminin geçerli kapsamıyla; yıllık liste yalnız envanter | [foundation-review](../docs/architecture/foundation-review.md), PRD §5.3 |
| 2026-09-16 | Varsayılan değerlendirme development; test yalnız açık izinle; `compare` komutunda test seçeneği yok | [ML README](../packages/ml/README.md), P1 |
| 2026-09-17 | Negatifler onaya kadar geçersiz/eksik sayılır; ham veri korunur (geçici). **2026-10-06'da ölü bant kuralıyla değişti (D-04)** | P0 §5 (D-04) |
| 2026-09-17 | Eşikler hedef sayıya (10 hane) veya test sonucuna göre seçilmez | P0 §4, §6 |
| 2026-09-17 | P1 protokolü önceden donduruldu (`p1-v1`): günlük kalite v1, CQR, B0/B1 ayarları. 2026-10-06'dan beri `p1-v2`: ölü bant ve tek taraflı rapor metrikleri eklendi; ölü bant 0 ile `p1-v1` sonuçları birebir çıkıyor | [P1 protokolü](../docs/architecture/p1-ml-protocol.md) · [koşu kaydı](ml/experiment-log.md) |
| 2026-09-17 | Development taramasında B0 korunur; B1'in bu ayarı üstün ilan edilmez (kuantil boosting ailesi reddedilmedi) | P1 |
| 2026-09-22 | Bilgi tabanı `second_brain/`; vault kökü = repo kökü; göreli Markdown bağlantılar | [README](README.md) |
| 2026-09-22 | `ponytail` kullanılmaz; kodda okunabilirlik ve sunumda anlatılabilirlik öncelikli | [AGENTS.md](../AGENTS.md) §5 |
| 2026-09-23 | Dokuz skill `.claude/skills/` altına taşındı; aktif set bu dizindir, kısıtlar README'sinde. `ponytail` ailesi `.codex/skills`'te kullanılmadan duruyor | [.claude/skills](../.claude/skills/README.md) · [AGENTS.md](../AGENTS.md) §2 |
| 2026-09-23 | Veri analizi, EDA ve model incelemesi notebook'larda; kurallar ve resmî sonuç üreten kod `packages/ml`'de. Notebook çağırır, tanımlamaz | [workflow.md](workflow.md) |
| 2026-09-23 | Proje kuralları (değişmezler) `AGENTS.md`'de tek yerde; `home.md` yalnız işaret eder | [AGENTS.md](../AGENTS.md) "Project Invariants" |
| 2026-09-26 | Oturum başlangıcı `AGENTS.md`'de: önce `home.md`, veri/ML işlerinde `decisions.md`. CLAUDE.md kararı Q-05'te | [AGENTS.md](../AGENTS.md) "Session Start" |
| 2026-09-26 | Okunabilirlik kuralı eski koda yalnız dokunulan fonksiyonda uygulanır: önce davranışı koruyan ayrı commit, sonra işlevsel değişiklik; dokunulmayan kod refactor edilmez | [AGENTS.md](../AGENTS.md) §5 |
| 2026-09-26 | Testi görmüş 661 baseline çıktısı çalışma dizininden çıkarıldı (`../artifacts-test-seen/baseline-661/`, hash'ler aynı); ajanlar yanlışlıkla okuyamaz | [koşu kaydı](ml/experiment-log.md) · [artifacts/README](../artifacts/README.md) |
| 2026-09-26 | Q-04 ve dedektör işi için aday skill'ler incelendi; projeye yeni skill eklenmedi | [log.md](log.md) |
| 2026-09-27 | Veri kullanımı: Pecan Street'in ücretsiz verisi üniversite destekli araştırmacılara ticari olmayan kullanım için açık. Proje ticari gelir hedeflemiyor ve Yusuf'un lisans bitirme tezi için de geliştiriliyor; kullanım bu koşula uygun (Yusuf). Tezde ve sunumlarda Pecan Street'e atıf yapılır; ham veri herkese açık paylaşılmaz | [Pecan Street 2018 duyurusu](https://www.pecanstreet.org/2018/03/press-release-pecan-street-releases-powerful-residential-electricity-dataset-with-potential-to-revolutionize-electricity-management/) · [AGENTS.md](../AGENTS.md) |
| 2026-09-27 | Dataport metadata dosyası (`metadata_pecanstreetdata.csv`, 2.072 hane) diğer kaynaklarla birlikte `../dataset/` altında tutulur; repoya girmez (SHA-256 taşımadan önce ve sonra aynı) | [data/README.md](../data/README.md) · [kanal notu](data/channel-inventory-and-metadata.md) |
| 2026-09-28 | Yön: önce ürün ve yarışma, tez bunun üstüne kurulur. Derin öğrenme tezin çekirdeği: ML modelleriyle aynı protokolde karşılaştırılır, sonuç ne olursa raporlanır, ürün en iyi modeli kullanır. Ajan katmanı ve saha geri bildirim döngüsü demo olarak kurulur: LLM kanıttan açıklar, karar insanda. Kapsam sırası HVAC → buzdolabı → GES, tüm ev bağlam (Yusuf) | sohbet, 2026-09-28 · Q-13 |
| 2026-09-28 | Takvim: staj 9 Ekim'de biter, sunumda çalışan bir MVP istenir; teknik çalışmalar 30 Ekim'de sunulur. PRD v1.1'in metriklerine güvenilmez; yeni PRD v2.0 kanıttan yazılır (Yusuf) | sohbet, 2026-09-28 |
| 2026-10-05 | 9 Ekim MVP'si yalnız HVAC (`air1`). Vaka açıklamaları önce şablonla; LLM aynı arayüze sonra bağlanır. Konsol ve API'yi agent'lar yazar, Berke ve Muharrem PR üzerinden inceler (**2026-10-06'da değişti: konsol ve API bizim agent'larımızca yazılmaz, aşağıda**). İş `feat/mvp` dalında; push yok (Yusuf) | sohbet, 2026-10-05 |
| 2026-10-05 | Repo kökündeki kaynak CSV kopyaları silindi: orijinallerle bayt bayt aynıydı, SHA-256 P0 kaydıyla aynı. Tek veri kaynağı `../dataset/` (Yusuf) | [log.md](log.md) |
| 2026-10-06 | `AGENTS.md`'ye dört kural: alt agent talimatı (başarı ölçütü, dosya alanı, doğrulama); dedektör, veri kuralı ve metrik kodunda önce test; kullanılmaz hâle gelen kodu listeleyip sormak; değişmez, kanıt ya da kararla çelişen isteği uygulamadan önce söylemek. Dolaşan "Karpathy" prompt'u olduğu gibi eklenmedi; `CLAUDE.md` oluşturulmaz | [AGENTS.md](../AGENTS.md) · `5f40c37` |
| 2026-10-06 | Takvim gerekçesiyle kural atlanmaz: AGENTS.md §5 (önce davranışı koruyan okunabilirlik commit'i, sonra işlevsel değişiklik) her değişen fonksiyona tam uygulanır (Yusuf) | sohbet, 2026-10-06 · `dd15f91`, `52019c2`, `3ee229f` |
| 2026-10-06 | Hedef ölü bandı ±0,01 ve 21 hanelik cohort uygulanıyor (D-04, D-05; P1 protokolü `p1-v2`) | `89a4c67` · [p1-v2 raporu](../docs/project-status/p1-v2-results-2026-10-06.md) |
| 2026-10-06 | P1 raporu bandın iki yanını ayrı ölçer: üst/alt sınır aşımı ve klima çalışırken kapsama (çalışma eşiği 0,3: 27 Eylül HVAC incelemesindeki "air1 aktif" seviyesi). Tarama kuralı değişmedi | `f660801` · [p1-v2 raporu](../docs/project-status/p1-v2-results-2026-10-06.md) |
| 2026-10-06 | `baseline` komutunun development koşusu test dönemi satırlarını okumaz (eski sızıntı düzeltildi) | `d7ae6ed` |
| 2026-10-06 | Sprint boyunca `git add`, `commit`, `switch`, `merge` için yerel izin kuralları (`.claude/settings.local.json`); commit'ler `feat/mvp`'ye adım adım; push izni yok (Yusuf) | `/permissions` |
| 2026-10-06 | Eski PRD sürümleri (v0.9, v1.0) `docs/archive/` altında; arşiv referans alınmaz (AGENTS.md değişmezi). PRD v1.1, v2.0 yayımlandığı commit'te arşive taşınır; o zamana kadar metrik hedefleri, dedektör eşikleri ve sentetik ızgarası doğrulanmamış varsayımdır. Repo dışındaki `../Dokümanlar/` kopyalarına dokunulmadı (Yusuf) | [arşiv](../docs/archive/README.md) · Q-08 |
| 2026-10-06 | Görev alanımız Data & AI (C): konsol ve API bizim agent'larımızca yazılmaz. Ekranlar A'nın (Berke), API ve API sözleşmesi B'nin (Muharrem) işidir; C'nin teslimi kanıt dosyaları, Python modülü/CLI ve kanıt alanlarının anlamıdır (Yusuf) | sohbet, 2026-10-06 · PRD §3.2 · [ml-pipeline](../docs/architecture/ml-pipeline.md) · Q-04, Q-15 |
| 2026-10-06 | Üst sınır ayrı kalibre edilir (Q-03): asimetrik CQR, alt ve üst taraf Haziran'da ayrı ayrı %5'e (α/2; Romano vd. 2019). Dedektörün gerçek veri koşusundan önce P1 protokolü `p1-v3` olarak; önce testler, davranışı koruyan düzenleme ayrı commit (Yusuf) | sohbet, 2026-10-06 · Q-03 |
| 2026-10-06 | Haziran eğitime katılmaz (A-04): kalibrasyon ve dedektör referansı olarak kalır. MVP'de eğitimde görülmemiş sıcaklıktaki Temmuz günleri "değerlendirilemedi" gösterilir; sentetik senaryolar 4–17 Temmuz'da (Yusuf) | sohbet, 2026-10-06 · A-04, Q-18, Q-19 |
| 2026-10-06 | Train'deki olağandışı günler eğitimden çıkarılmaz (Q-17): klimanın sezona açılmasını yansıtıyorlar; veri kuralı değişmez (Yusuf) | sohbet, 2026-10-06 · Q-17, Q-19 |

## Kanıtı olan riskler (tam liste: PRD §19.1)

| ID | Risk | Güncel kanıt |
|---|---|---|
| R-01 | Arıza etiketi yok; gerçek isabet bilinmez | Kalıcı; sentetik değerlendirme henüz yok |
| R-04 | Saat/birim hatası | D-01, D-02 öneri hazır (2026-09-27); ekip kararı bekleniyor |
| R-06 | Tek yıl/şehir; mevsim genellemesi | A-04: Temmuz'daki destek dışı slotlar; Q-19: model mevsimi bilmiyor (ham q95 aşımı Haziran %13,7, Temmuz %19,6) |
| R-10 | Ekip kapasitesi, entegrasyon gecikmesi | Q-04: kanıt sözleşmesi v0.1 taslak, Muharrem'in incelemesi bekleniyor; konsol ML'ye bağlı değil. Konsol ve API A ile B'de, 9 Ekim'e üç gün var (2026-10-06) |
