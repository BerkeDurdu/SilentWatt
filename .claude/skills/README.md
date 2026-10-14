# Claude Code proje skill'leri

Projenin skill'leri 2026-09-23'te bu klasöre taşındı. Claude Code buradaki dokuz skill'i
otomatik yükler; bu her oturuma yaklaşık 1.200 token ekler. `ponytail` ailesi taşınmadı ve
kullanılmıyor (bkz. "Taşınmayanlar").

Kaynak, sabit commit ve lisanslar: [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).
Dosyalar upstream ile birebir aynıdır; **skill dosyaları düzenlenmez**. Projeye özel
kısıtlar aşağıdaki tabloda durur ve upstream örneklerinin önüne geçer.

| Skill | Ne zaman | Proje kısıtı |
|---|---|---|
| `data-quality-auditor` | Yeni veya şüpheli bir veri kaynağını hedefli incelerken | "Remediation Playbook" uygulanmaz: doldurma, kırpma, `keep='last'` tekilleştirme yok. DQS puanı raporlanmaz. Betikler dosyayı belleğe alır; 2,6 GB'lık 1 dk dosyasında çalıştırılmaz. Yürürlükteki kurallar `packages/ml` içindedir. |
| `dependency-auditor` | Bağımlılık veya lock dosyası değiştiğinde, lisans kontrolünde | Betikler çevrimdışı örüntü eşleştirir; canlı `npm audit` / OSV sorgusuyla birlikte kullanılır. Yeni bağımlılık ayrıca onay ister. |
| `skill-security-auditor` | Yeni bir skill veya plugin eklemeden önce | PASS güvenlik sertifikası değildir; betikler elle de incelenir. `diagram-design` için çıkan FAIL bilinen yanlış pozitiftir (aşağıya bakın). |
| `senior-data-scientist` | Deney tasarımı ve değerlendirme tartışırken | Örneklerindeki karıştırılmış çapraz doğrulama, split öncesi lag özelliği, `pytest`/`black`/MLflow bu projede geçerli değildir. Zaman serisi kuralları [P1 protokolünde](../../docs/architecture/p1-ml-protocol.md). `scripts/` altındaki üç dosya iskelettir; iş yapmadan "completed" döndürür, doğrulama olarak kullanılmaz. |
| `senior-ml-engineer` | Model paketleme ve izleme sınırlarını tartışırken | LLM, RAG, feature store ve Kubernetes kapsam dışıdır. Yeni servis veya bağımlılık önerisi onay ister. `scripts/` iskeleti aynı şekilde kullanılmaz. |
| `senior-architect` | Mimari sınırları gözden geçirirken | Mikroservis, veritabanı ve ölçekleme önerileri uygulanmaz: Express korunur kararı 2026-09-16'da verildi ([ml-pipeline](../../docs/architecture/ml-pipeline.md)). |
| `code-reviewer` | Dil bazlı doğruluk ve bakım incelemesinde | Yerleşik `/code-review` ile birlikte değil, biri seçilerek kullanılır. SOLID önerileri [AGENTS.md](../../AGENTS.md) §5'teki okunabilirlik kuralının önüne geçmez. |
| `tdd-guide` | Test tasarımı ve kapsam boşluklarını konuşurken | Üreteç betikleri pytest/Jest çıkarır; projede stdlib `unittest` kullanılır. Fixture'lara gerçek ölçüm veya hane kimliği girmez; testler sentetik veri üretir. |
| `diagram-design` | Sunum ve mimari diyagramları üretirken | Ağır bir skill'dir (578 satır). Şablonlar açıldığında Google Fonts yükleyebilir; çevrimdışı veya özel diyagramda yerel font kullanılır. |

## Genel kısıtlar

Bu kurallar upstream örneklerinin önüne geçer (2026-09-17 P0 incelemesinden taşındı).

- Skill içerikleri sabit sürümde korunur; örnekler referans malzemedir, projenin kabul
  ölçütü değildir.
- `senior-data-scientist/scripts/` ve `senior-ml-engineer/scripts/` altındaki altı betik
  iskelettir: analiz veya dağıtım yapmadan başarı döndürür. Doğrulama olarak çalıştırılmaz,
  `completed` çıktısı kanıt sayılmaz, CI'ya bağlanmaz.
- Zaman serisinde kronolojik split ve yalnız geçmişe bakan özellikler kullanılır; hane
  bazında gruplanır. Karıştırılmış çapraz doğrulama, ortalanmış pencere, gelecek hedefi ve
  tüm veriyle dönüştürücü eğitimi uygulanmaz.
- Genel eksik veri sezgileri MCAR/MAR/MNAR belirlemez. Ortalama ile doldurma, uç değer
  kırpma ve keyfi tekilleştirme yetkili temizleme kuralı değildir; `packages/ml` yeniden
  kullanılır ve bilinmeyenler sahibinin kararına bırakılır.
- DQS doğrulanmış bir hazırlık puanı değildir; birim, cihaz eşlemesi ve sensör geçerliliği
  açıktır. DQS "belirlenmedi" olarak raporlanır.
- Örnek dağıtım yığınları, model depoları ve izleme eşikleri; mevcut çevrimdışı hatta veya
  Express uygulamasına yeni bağımlılık ya da servis eklemeyi gerekçelendirmez.
- Güvenlik tarayıcısı statiktir: canlı advisory sorgusu yapmaz ve gömülü HTML script'lerini
  tam çözümlemez. Bulgular ve baskılamalar elle incelenir.

## Bilinen tarama bulgusu

`skill-security-auditor`, `diagram-design/scripts/drawio_extract.py:96` için CRITICAL
`OBFUSCATION` verir. Bu satır draw.io'nun belgelenmiş sıkıştırılmış veri biçimini çözer;
2026-09-17'de elle incelenip yanlış pozitif olarak değerlendirildi ve sonuç PASS'a
çevrilmedi ([P0 doğrulama](../../docs/project-status/p0-verification-2026-09-17.md)).
Diğer sekiz skill 2026-09-23 taramasında PASS verdi.

## Taşınmayanlar

`ponytail`, `ponytail-review`, `-audit`, `-debt`, `-gain`, `-help` `.codex/skills` altında
kaldı ve kullanılmıyor. Gerekçe: bu skill'ler en kısa kodu hedefliyor, oysa projede öncelik
kodun proje sahibi tarafından takip edilip sunumda anlatılabilmesi. Kod yazım ilkeleri
[AGENTS.md](../../AGENTS.md) §5'tedir.

## Değerlendirilip alınmayan dış skill'ler (2026-09-22)

`alirezarezvani/claude-skills` deposundaki 846 `SKILL.md` incelendi (458'i Gemini kopyası).
Proje dışı alanlar (pazarlama, C-level, regülasyon, finans, satış, proje yönetimi) elendi.
Ayrıca şunlar alınmadı: `statistical-analyst` (bağımsız örneklem varsayan A/B testleri),
`karpathy-coder` (pre-commit hook ekler), `llm-wiki` ve `self-improving-agent`
(`second_brain` ile çakışır), `autoresearch-agent` (metriğe göre kendini ayarlayan döngü),
`pr-review-expert` ve `adversarial-reviewer` (yerleşik `/code-review`), `tc-tracker` ve
`handoff` (`second_brain` günlüğü). Sonraya bırakılanlar: `api-design-reviewer`,
`ship-gate`, `env-secrets-manager`, `gcp-cloud-architect`, `a11y-audit`,
`performance-profiler`. `mattpocock-skills` için kurulum yöntemi hâlâ açık (Q-10).

## Güncelleme

Upstream değiştiğinde: yeni commit'i indir, `skill-security-auditor` ile tara, ilgili dizini
ayrı bir commit'te değiştir ve `THIRD_PARTY_NOTICES.md` içindeki sabit commit'i güncelle.
