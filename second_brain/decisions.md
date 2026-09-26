---
type: map
area: process
updated: 2026-09-26
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
| D-01 | Güç birimi (W, kW, enerji?) | açık | B+C | A-01, R-04 | `source_unit_unverified`; kW/kWh yok | P0 §5 |
| D-02 | 15 dk değerin anlamı ve zaman etiketi | açık | B+C | A-01, R-04 | Aynı UTC saatine hava eşlemesi | P0 §5 |
| D-03 | `air1` hangi devreyi ölçüyor? | açık | B+C | A-02 | "air1 kanal sapması" dili | P0 §5 |
| D-04 | Negatif değerler: gürültü mü, geçersiz mi? | kanıt toplanıyor | B+C | A-05, DQ-06, C-02 | Negatif = geçersiz; ham veri korunur | P0 §5 · [negatif değerler notu](data/negative-values-sensor-floor.md) |
| D-05 | 8 teknik adayın cohort onayı | ekip kararında | B+C | A-10, C-01 | Aynı 8 aday ve kurallar | P0 §2, §5 · notebook D |

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
| A-04 | Eğitimde yeterli soğutma ve sıcaklık desteği | kanıt toplanıyor | C | R-06, DQ-08 | Temmuz'da her hanede ≥ 212 slot destek dışı (6139: 260); skorlanan pay %56,38 (P1) |
| A-06 | Referans dönemin fiziksel sağlığı | açık | C | R-02 | Mevcut veriyle kapanamaz; pilot gerekir |
| A-07 | Hedef kullanıcı ve bağımsız uzman erişimi | açık | A | — | PRD §15.3 |
| A-08 | Google Cloud kredisi, bölge, bütçe, veri yükleme hakkı | açık | B | R-11 | Repoda kanıt yok (PRD §6.3) |
| A-09 | Repo yapısı ve varsayılan dal | açık | B | — | Yapı 2026-09-16'da belgelendi (PRD §17); dal koruması doğrulanmadı |
| A-11 | Huawei kredisi ve yarışma koşulları | açık | B | R-13 | PRD §6.4 |

## Açık sorular (second_brain, resmi ID yok)

| ID | Soru | Durum | Sahip | Eşleşen | Kanıt / not |
|---|---|---|---|---|---|
| Q-01 | Donma kuralı standby / sabit düşük okumayı da eliyor mu? | kanıt toplanıyor | B+C | DQ-07, A-05 | 6139: 151 → 9 train günü; ilk işaret 0,004 (notebook F); 6139'da hiç tam sıfır yok ([not](data/negative-values-sensor-floor.md)) · P1 açık karar 2 |
| Q-02 | Nihai kör değerlendirme için görülmemiş veri | açık | B+C | KPI-01…09 | 661 testi 16 Eylül'de açıldı ([foundation-review](../docs/architecture/foundation-review.md), risk 1) · P1 açık karar 4 |
| Q-03 | Kalibre kapsama %87'nin altında (B0 %86,687, B1 %84,370) | açık | C | KPI-02 | P1 açık karar 3 |
| Q-04 | ML kanıt JSON'u ile API arasındaki sözleşme | açık | B (anlam: C) | R-10 | `shared/types.ts` yalnız demo sözleşmesi ([ml-pipeline](../docs/architecture/ml-pipeline.md)) |

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
| G0 Veri hazır | açık | Birim ve interval (D-01, D-02), nihai cohort (D-05). Var olanlar: kaynak hash'leri (P0), split'ler (config), hane bazında sıcaklık desteği (P1). |
| G1 Analitik hazır | açık | B0/B1 ve CQR yalnız development taramasında; dedektörler yok; KPI'lar test döneminde ölçülmedi. |
| G2 Ürün akışı | başlamadı | Konsol örnek veriyle çalışıyor; ML bağlantısı yok (Q-04). |
| G3 İşletim | başlamadı | Dağıtım, E2E, yedek/geri dönüş yok. |
| G4 İddia kontrolü | sürekli kural | kW/kWh, "arıza doğrulandı" ve tasarruf iddiası yok. |

## KPI durumu (development taraması; test ölçümü değil)

| KPI | Hedef (PRD §15.2) | Development sonucu (P1) |
|---|---|---|
| KPI-01 | B1 pinball < B0 | Sağlanmadı: eşit hane pinball B1 0,216709 > B0 0,168172 → B0 korunur |
| KPI-02 | Kalibre kapsama %87–93 | Sağlanmadı: B0 %86,687, B1 %84,370 (Q-03) |
| KPI-03 | Genişlik ≤ 1,10 × B0 | Kapsama koşulu sağlanmadığı için değerlendirilemez |
| KPI-04…09 | Olay yakalama, gecikme, alarm yükü, veri hatası, izlenebilirlik, karar akışı | Ölçülmedi (dedektör, benchmark, API yok) |

## Alınmış kararlar (şu an uygulanan kurallar)

| Tarih | Karar | Kaynak |
|---|---|---|
| 2026-09-16 | Mevcut Express + React korunur; ikinci FastAPI servisi yok; `apps/`, `services/` yalnız gerçek ihtiyaçta | [ml-pipeline](../docs/architecture/ml-pipeline.md), PRD §6.1 |
| 2026-09-16 | Aday seçimi yalnız train döneminin geçerli kapsamıyla; yıllık liste yalnız envanter | [foundation-review](../docs/architecture/foundation-review.md), PRD §5.3 |
| 2026-09-16 | Varsayılan değerlendirme development; test yalnız açık izinle; `compare` komutunda test seçeneği yok | [ML README](../packages/ml/README.md), P1 |
| 2026-09-17 | Negatifler onaya kadar geçersiz/eksik sayılır; ham veri korunur (geçici) | P0 §5 (D-04) |
| 2026-09-17 | Eşikler hedef sayıya (10 hane) veya test sonucuna göre seçilmez | P0 §4, §6 |
| 2026-09-17 | P1 protokolü önceden donduruldu (`p1-v1`): günlük kalite v1, CQR, B0/B1 ayarları | [P1 protokolü](../docs/architecture/p1-ml-protocol.md) |
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

## Kanıtı olan riskler (tam liste: PRD §19.1)

| ID | Risk | Güncel kanıt |
|---|---|---|
| R-01 | Arıza etiketi yok; gerçek isabet bilinmez | Kalıcı; sentetik değerlendirme henüz yok |
| R-04 | Saat/birim hatası | D-01, D-02 açık |
| R-06 | Tek yıl/şehir; mevsim genellemesi | A-04: Temmuz'daki destek dışı slotlar |
| R-10 | Ekip kapasitesi, entegrasyon gecikmesi | Q-04: sözleşme yok, konsol ML'ye bağlı değil |
