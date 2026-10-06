---
type: log
area: process
updated: 2026-10-06
---

# Günlük

En yeni kayıt üstte. Her kayıt 2–4 satır ve bağlantılardan oluşur. Commit'e dönüşmeyen
analizler de buraya yazılır.

## 2026-10-06

- D-04 ve D-05 kapandı: ±0,01 ölü bant, 21 hane, P1 protokolü `p1-v2`. AGENTS.md §5 tam
  uygulandı: önce davranışı koruyan okunabilirlik commit'leri, sonra testi önce yazılmış
  değişiklik. Ölü bant 0 ile 17 Eylül run03 birebir çıkıyor ([p1-v2 raporu](../docs/project-status/p1-v2-results-2026-10-06.md)).
- Yeni testli metrikler: üst sınır aşımı B0 %12,78 (hedef ≈ %5), klima çalışırken kapsama %80,77.
  `baseline` komutundaki test dönemi sızıntısı düzeltildi. Model davranışı cohort'tan bağımsız (Q-03).
- `AGENTS.md`'ye dört kural (alt agent talimatı, önce test, kullanılmayan kod, itiraz). İlk
  deneme `wip/dead-band-first-pass` dalında arşivli. Commit'ler `feat/mvp`'de; push yok.

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
