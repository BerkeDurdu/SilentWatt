---
type: log
area: process
updated: 2026-10-06
---

# Günlük

En yeni kayıt üstte. Her kayıt 2–4 satır ve bağlantılardan oluşur. Commit'e dönüşmeyen
analizler de buraya yazılır.

## 2026-10-14

- Durum kontrolü: `feat/mvp`'de 133 ML testi, typecheck ve build geçiyor; dedektör dalı kendi
  kaynağıyla 124 test geçiyor. `decisions.md`: KPI hedefleri doğrulanmamış diye işaretlendi,
  KPI-03 düzeltildi, Q-25 (tarama eşikleri) eklendi.
- Örnek kanıt dosyaları düzeltildi: değerler artık paketin günlük istatistik, kural ve kanıt
  yazıcısıyla hesaplanıyor; yeni tutarlılık testi 8 test. 141 ML testi geçiyor.

## 2026-10-08

- MVP sunumu 16 Ekim'e taşındı. Haftalık özet ve teknik iş planı (HTML, `docs/project-status/`) hazırlandı;
  PRD v1.1 sayıları doğrulanmadan ölçüt olarak kullanılmayacak (karar bekliyor), özetteki %87–93 kaldırıldı.
- Agent düzeni kuruldu (öneriler 1–5): iki tanım, başlangıç kontrolü, devir dosyası, birleştirme kapısı.
  Kapı dedektör dalında: kapsam temiz, çakışmasız, birleşik 177 test geçti; PRD v1.1 yapı ayarları uyarı verdi.

## 2026-10-07

- Oturum sonu: dedektör hattı (Agent 2) dalında bitti; reviewer durduruldu ve yeniden çalışacak.
  Yusuf'un 7 kararı bekliyor (`tasks/todo.md`). `feat/mvp` yerelde, push edilmedi.
- p1-v3 (Q-03) birleştirildi: reviewer onayı ve küçük düzeltmeler (adlandırma, PRD v2.0 notu,
  ifade). 133 test geçiyor. Ana config artık `p1-v3`; notebook 02'nin kilidi run04'e bağlı kaldı
  ve yeniden kilitlenecek. Agent 2'nin dedektör hattı reviewer'da.
- 1. dalga: üç agent kendi worktree'lerinde. Agent aracı worktree'leri `main`'den açtı; agent'lar
  dallarını `9cf56e1`'e ileri sardı. Gece oturum limiti doldu, agent'lar durdu; commit'ler korundu,
  sabah kaldıkları yerden devam ettiler. Bundan sonra aynı anda en fazla iki agent.
- Açıklama kataloğu exp-0.1 (Q-15) reviewer düzeltmeleriyle birleştirildi (`2dd1ff6`); sözleşmeden
  bağlantı verildi. Reviewer örnek kanıt dosyalarında dört tutarsız gerekçe değeri buldu.
- p1-v3 resmî koşusu (Agent 1): Temmuz B0 üst sınır aşımı %8,20, kapsama %90,34, klima çalışırken
  kapsama %87,12; simetrik kontrol koşusu run04'ü bayt bayt verdi. Rapor adımı sürüyor.

## 2026-10-06

- Alarm bütçesi (Yusuf), dedektör sonuçları görülmeden: 21 hanede ayda en fazla 2 tüketim sapması
  vakası; eşik Haziran'da seçilir, Temmuz'da değişmez ([decisions.md](decisions.md)).
- Yusuf'un onayıyla push: `feat/ml-foundation`'daki 2 commit ve `feat/mvp`; taslak
  [PR #2](https://github.com/BerkeDurdu/SilentWatt/pull/2), taban PR #1. Push öncesi typecheck, build,
  80 ML testi, CLI ve pip check geçti; diff'te ham veri, artifact ve parola yok.
- Model tarafı kararlar (Yusuf), P1 run04 üzerinde keşif ölçümüyle: Q-03 asimetrik CQR ile `p1-v3`
  (Temmuz üst sınır aşımı %12,8 → %8,2); Haziran eğitime katılmaz (A-04, 253 günden 1'ini kurtarırdı);
  olağandışı train günleri çıkarılmaz (Q-17, sezon geçişi); hafta günü ertelendi (Q-16); açıklama
  katmanı önerisi Muharrem'e (Q-15). Yeni: Q-18 kısmi gün, Q-19 mevsim kayması ([decisions.md](decisions.md)).
- Oturum sonu: web ve açıklama agent'ları durduruldu, ikisinde de commit yoktu. Görev alanımız
  Data & AI (C); konsol ve API A ile B'nin işi. Açıklama katmanının kimde olacağı açık (Q-15);
  Berke ve Muharrem'e haber verilecek ([decisions.md](decisions.md)).
- EDA notebook `02` (21 hane, P1 run04'e kilitli): 20/20 kontrol, 11 grafik. Haziran'da bile üst
  sınır aşımı %8,3 (simetrik kalibrasyon + sıfırlar), Temmuz'da %12,0; Temmuz hane-günlerinin %40'ı
  değerlendirilemiyor. Q-03, A-04, Q-16, Q-17 Yusuf'un kararını bekliyor ([notebooks/README](../notebooks/README.md)).
- Dedektör çekirdeği testleriyle `09d5e98`'de; gerçek veride çalıştırılmadı. Paket hash'i değiştiği
  için P1 run04 üretildi; çıktıları run03 ile bayt bayt aynı ([koşu kaydı](ml/experiment-log.md)).
  Park edilen test ve karşılaştırma betiği `tasks/paused/` altında (commit edilmedi).
- D-04 ve D-05 kapandı: ±0,01 ölü bant, 21 hane, P1 protokolü `p1-v2`. AGENTS.md §5 tam
  uygulandı: önce davranışı koruyan okunabilirlik commit'leri, sonra testi önce yazılmış
  değişiklik. Ölü bant 0 ile 17 Eylül run03 birebir çıkıyor ([p1-v2 raporu](../docs/project-status/p1-v2-results-2026-10-06.md)).
- Yeni testli metrikler: üst sınır aşımı B0 %12,78 (hedef ≈ %5), klima çalışırken kapsama %80,77.
  `baseline` komutundaki test dönemi sızıntısı düzeltildi. Model davranışı cohort'tan bağımsız (Q-03).
- `AGENTS.md`'ye dört kural (alt agent talimatı, önce test, kullanılmayan kod, itiraz). İlk
  deneme `wip/dead-band-first-pass` dalında arşivli. Commit'ler `feat/mvp`'de; push yok.
- Kanıt sözleşmesi v0.1 ve örnek dosyalar; web ve açıklama agent'ları kendi worktree'lerinde başladı.
  Eski PRD'ler `docs/archive/` altında; v1.1'e uyarı, AGENTS.md'ye arşiv kuralı ([arşiv](../docs/archive/README.md)).

## 2026-10-05

- Durum değerlendirmesi ve agent orkestrasyon planı. Kararlar: MVP yalnız HVAC, açıklama önce
  şablonla, konsol/API'yi agent'lar yazar, `feat/mvp` dalı ([decisions.md](decisions.md)).
- Kaynak dosyalar SHA-256 ile P0 kaydına karşı doğrulandı; repo kökündeki 2,8 GB kopya silindi.
- Negatif ve donma kuralının cohort etkisi ölçüldü: ölü bantla 8 → 21 aday
  ([kanıt betiği](../docs/product/ekler/review_dead_band_cohort.py)).

## 2026-09-28

- Eski metrikler paket kodu kullanılmadan yeniden hesaplandı: sayılar doğru, metrik seçimi
  yanıltıcı (üst sınır aşımı %13–16, iki taraflı kapsama sıfırlarla şişiyor).
- Yön kararları: önce ürün; derin öğrenme tezin çekirdeği; ajanlar demo; HVAC → buzdolabı →
  GES. Staj 9 Ekim'de biter (çalışan MVP), teknik sunum 30 Ekim. PRD v2.0 kanıttan yazılacak.

## 2026-09-27

- Teknik sunum geri bildirimi ("yalnız klima arızasına odaklanmayın") üzerine kapsam
  önerisi hazırlandı: HVAC, buzdolabı, GES (Q-13, [kapsam önerisi](product/scope-broadening-proposal.md)).
- Birim ve aralık kanıtı (yalnız train): değerler kW aralık ortalamasıyla tutarlı, 15 dk
  etiketi aralığın başı. D-01 ve D-02 öneri hazır, D-03 kanıt toplanıyor
  ([kaynak anlamı notu](data/source-semantics-evidence.md)).
- Dataport metadata dosyası `../dataset/` altına taşındı (hash aynı); bayrakların %98,2'si
  veriyle uyumlu ([kanal notu](data/channel-inventory-and-metadata.md)). Dört inceleme
  betiği `docs/product/ekler/` altında. Veri kullanımı kararı: tez, ticari olmayan kullanım.

- Claude Code uygunluk değerlendirmesi: testler, typecheck ve bağlantılar temiz; 17 bulgu.
  Yüksek öncelikli dördü kapatıldı: `AGENTS.md`'ye "Session Start" ve §5 eski kod kuralı;
  661 test çıktısı repo dışına taşındı; skill taşıması, `AGENTS.md` ve `second_brain` push
  edildi; PR #1 açıklaması güncellendi, `bd59e7c` için CI geçti ([decisions.md](decisions.md)).
- Açık kalanlar: kWh kuralında `AGENTS.md` ile PRD §13.2 çelişkisi, notebook'un commit
  biçimi, `../dataset` dosyalarını salt okunur yapmak, PR #1 incelemesi, web test/lint, Q-07, Q-12;
  CI uyarısı: `actions/checkout@v4` ve `setup-node@v4` kullanımdan kalkan Node 20'yi hedefliyor.
- Q-04 ve dedektör işi için skills.sh'te aday skill arandı (8 aday; `api-and-interface-design`
  ve `api-design-reviewer` ölçütleri geçti). Karar: yeni skill eklenmedi. `find-skills`
  kurulmadı; global ve onaysız kurulum öneriyor.

## 2026-09-23

- `ponytail` dışındaki dokuz skill `.codex/skills`'ten `.claude/skills`'e taşındı
  (`git mv`, 320 dosya, içerik değişmedi). Güvenlik taraması: 8 PASS; `diagram-design`
  için bilinen yanlış pozitif FAIL korundu. Kısıtlar
  [.claude/skills/README.md](../.claude/skills/README.md) içine taşındı.
- `second_brain` kural denetimi yapıldı; yedi düzeltme uygulandı: özellik kuralı gerçeğe
  uyduruldu, değişmezler `AGENTS.md`'ye taşındı, notebook/modül iş bölümü ve bağlantı
  kontrol komutu `workflow.md`'ye eklendi, onay gerektiren dosya listesi tamamlandı,
  `decisions.md`'ye dört yeni satır girdi (Q-10 … Q-12 ve alınan kararlar).

## 2026-09-22

- Skill seti daraltıldı: `ponytail` ailesi bırakıldı, çünkü üretilen kodun sunumda
  anlatılabilir olması öncelikli. Projedeki 15 skill yeniden incelendi; yalnız 3'ü aktif.
  AGENTS.md §2 (skill kullanımı) ve §5 (okunabilir kod ilkeleri) güncellendi; kullanılmayan
  kopyalar şimdilik `.codex/skills`'te duruyor.
- Skill incelemesi: `alirezarezvani/claude-skills@19392f7` (846 `SKILL.md`, 458'i Gemini
  kopyası) SilentWatt ihtiyaçlarıyla eşlendi. Claude'a yalnız 3 skill açıldı; hepsi `.codex`
  kopyalarına bağlantı: `data-quality-auditor`, `dependency-auditor`, `skill-security-auditor`.
  Gerekçe ve dışarıda kalanlar: [.claude/skills/README.md](../.claude/skills/README.md).
- `mattpocock/skills@959a8e9` incelendi: 25 skill, güvenlik taraması 25/25 PASS. Plugin tek
  tek kapatılamıyor (`skillOverrides` plugin skill'lerine uygulanmıyor). Önerilen 6 skill için
  kurulum yöntemi onay bekliyor (Q-05).
- `second_brain/` kuruldu (14 dosya). Vault kökü = repo kökü; bağlantılar göreli Markdown.
  CLAUDE.md, `.gitignore` ve commit/dal kararları ertelendi (Q-05, Q-06, Q-09).
- Kurulum sırasında zaten açılmış olan `artifacts/baseline/661/metrics.json` test
  metrikleri istemeden ekrana yazdırıldı; hiçbir yerde kullanılmadı. Test bütünlüğünün
  durumu değişmedi (661 testi 16 Eylül'den beri açık).
- Negatif `air1` değerleri analiz edildi (yalnız train): negatiflerin %95'i −0,005 ile 0
  arasında ve hanelerin "sıfır" okuması farklı → [not](data/negative-values-sensor-floor.md);
  D-04 ve Q-01 için kanıt.
- Veri anlama notebook'u tamamlandı: 82/82 kontrol uyumlu, 19 grafik; commit edilmedi
  ([notebooks/README.md](../notebooks/README.md), [tasks/todo.md](../tasks/todo.md)).

## 2026-09-17

- P1 (`b54b2db`): günlük kalite kapıları, hane bazında CQR, 8 haneli B0/B1 development
  karşılaştırması; B0 korunur ([P1 raporu](../docs/project-status/p1-ml-results-2026-09-17.md)).
- P0 düzeltmesi (`ec58b9a`): "172 HTML kontrolü geçti" iddiası yanlıştı (gerçek: 163 PASS /
  2 FAIL); ders [tasks/lessons.md](../tasks/lessons.md)'de.
- P0 (`0ccdfb5`): 15 Codex skill'i eklendi; cohort kararları belgelendi (D-01…D-05,
  C-01…C-04); PR #1 açıldı ([P0 karar kaydı](../docs/project-status/p0-data-decisions-2026-09-17.md),
  [P0 doğrulama](../docs/project-status/p0-verification-2026-09-17.md)).

## 2026-09-16

- ML foundation (`b52e6d5`): ML paketi, kaynak denetimi, baseline, CI. İlk koşu 661'in test
  metriklerini açtı; ardından test erişimi açık izne bağlandı
  ([foundation-review](../docs/architecture/foundation-review.md)).
- Web: müşteri bilgilendirme SMS'i ve kontrol talebi akışı (`bf1e63a`, Berke).

## 2026-09-15

- PRD v1.1: MVP bulut sağlayıcısı Google Cloud oldu; yerel veri taraması
  (`docs/product/ekler/dataset-audit-2026-09-15.json`).

## 2026-09-14

- Web konsolu (`b7b94f2`, Berke): rol bazlı ekranlar, giriş, TR/EN.
