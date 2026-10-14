---
type: guide
area: process
updated: 2026-09-23
---

# Geliştirme akışı

Bu sayfa kuralları tekrar etmez; nerede olduklarını ve nasıl birleştiklerini gösterir.

## Temel kaynaklar

- [AGENTS.md](../AGENTS.md): ajan iş akışı. Önce plan, sonra doğrulama; kapsamı
  genişletme; ürün, veri, cohort, eşik veya ML varsayımlarını sessizce değiştirme;
  kanıt olmadan "bitti" deme.
- [PRD §17](../docs/product/SilentWatt-Teknik-PRD-v1.1.md): ekip çalışma modeli.
  Kısa ömürlü `feat/…`, `fix/…` dalları, PR, en az bir ekip incelemesi; PR'da FR/KPI
  ID'si ve test kanıtı; ML değişikliğinde veri/split sürümü ve karşılaştırma raporu.
- [CI](../.github/workflows/ci.yml): web (typecheck + build, Node 22) ve ML (kilitli
  kurulum, `pip check`, unittest, CLI). Notebook testleri CI'da yok (Q-07).
- Komutlar: [kök README](../README.md) (web), [packages/ml/README.md](../packages/ml/README.md)
  (ML), notebooks/README.md (`notebooks/README.md`, depoda değil) (notebook).

## Git düzeni (gözlenen)

- ML commit'leri Conventional Commits biçiminde: `feat(ml): …`, `docs(p0): …`,
  `chore(p0): …`. Web commit'leri serbest Türkçe başlıklı.
- `main` web konsolunu içerir; ML çalışması `feat/ml-foundation` dalında, PR #1 üzerinden.
- Commit, push ve PR yalnız açık talimatla.

## Veri/ML çalışma döngüsü (P0–P1'de izlenen)

1. **Soru ve protokol:** Deneyden önce protokol yazılır ve dondurulur (ör.
   [P1 protokolü](../docs/architecture/p1-ml-protocol.md)). Eşik sonuca bakılarak seçilmez.
2. **Koşu:** Yalnız izinli dönemler; her koşu yeni bir `artifacts/…` dizinine;
   provenance otomatik kaydedilir.
3. **Kayıt:** Koşu [ml/experiment-log.md](ml/experiment-log.md)'ye bir satır olarak eklenir.
4. **Doğrulama:** Testler, tekrar üretilebilirlik (byte eşitliği), sızıntı kontrolü.
5. **Yayın:** Sonuç `docs/project-status/` altında tarihli rapor olur;
   [decisions.md](decisions.md) güncellenir.
6. **Ders:** Süreçle ilgili kalıcı ders [tasks/lessons.md](../tasks/lessons.md)'ye,
   alanla ilgili bulgu ilgili alan notuna yazılır.

## Notebook mu, modül mü?

Veri analizi, EDA ve model incelemesi `notebooks/` altında yürür; kurallar ve resmî sonuç
üreten kod `packages/ml` içinde kalır.

- **Notebook:** keşif, karar analizleri (D-04, Q-01 gibi), sonuçların görselleştirilmesi ve
  kavram anlatımı. Notebook paketten fonksiyon çağırır, kural tanımlamaz.
- **Modül:** veri sözleşmesi, kalite kapıları, model eğitimi, kalibrasyon, metrikler ve CLI.
  Test edilir, provenance'lı artifact üretir, Jupyter olmadan da çalışır.
- **Taşıma kuralı:** Bir kod parçası (a) kural veya eşik içeriyorsa, (b) iki notebook'ta
  kullanılıyorsa ya da (c) başkasının tükettiği bir çıktı üretiyorsa pakete taşınır ve
  `unittest` ile test edilir. Görselleştirme pakete girmez; paket matplotlib'e bağlı değildir.
- **Sayılar:** Resmî sayı CLI koşusundan gelir; notebook'ta hesaplanan sayı "keşif" olarak
  etiketlenir. Notebook sonundaki doğrulama hücresi resmî artifact'larla karşılaştırır.
- **Erişim:** Notebook'lar veriyi `notebooks/_support.py` üzerinden okur; test dönemi
  hedefleri okunmaz. Kurulum ve tekrar çalıştırma: notebooks/README.md (`notebooks/README.md`, depoda değil).

## Görev takibi

- Büyük bir işin planı ve doğrulaması: [tasks/todo.md](../tasks/todo.md) (AGENTS.md kuralı).
- Güncel durum özeti: [home.md](home.md). Kronoloji: [log.md](log.md).

## Claude oturum rutini

**Başlangıç**
- [home.md](home.md) okunur. Veri/ML kararına dokunan işlerde [decisions.md](decisions.md)
  ve ilgili alan haritası da okunur.

**Çalışırken**
- Yeni bulgu → ilgili alan klasöründe not ([şablon](templates/note.md)).
- Karar veya sorunun durumu değişti → [decisions.md](decisions.md) satırı.
- Yeni koşu → [ml/experiment-log.md](ml/experiment-log.md) satırı.
- Yeni terim → [glossary.md](glossary.md).

**Kapanış** (büyük iş bitince veya "oturumu kapat" denince)
1. [home.md](home.md) "Güncel durum" bölümü güncellenir (üzerine yazılır).
2. [log.md](log.md)'nin en üstüne 2–4 satırlık kayıt eklenir.
3. Değişen notların `updated` alanı güncellenir ve bağlantılar kontrol edilir:

```sh
python3 - <<'PY'
import glob, os, re
for f in glob.glob('second_brain/**/*.md', recursive=True):
    text = open(f, encoding='utf-8').read()
    for target in re.findall(r'\]\(([^)\s#]+)', text):
        if not target.startswith('http') and not os.path.exists(os.path.join(os.path.dirname(f), target)):
            print('kırık:', f, '->', target)
PY
```

**Sınırlar**
- Onay olmadan değişmeyenler: kök dosyalar (`AGENTS.md`, `CLAUDE.md`, `.gitignore`,
  `README.md`), PRD ve `docs/` altındaki tarihli raporlar, `configs/ml` eşikleri, skill
  dizinleri ve README'leri, CI dosyaları.
- Commit ve dal kararı kullanıcıdadır.

## Proje skill'leri

- 2026-09-23'te dokuz skill [`.claude/skills/`](../.claude/skills/README.md) altına taşındı:
  `data-quality-auditor`, `dependency-auditor`, `skill-security-auditor`,
  `senior-data-scientist`, `senior-ml-engineer`, `senior-architect`, `code-reviewer`,
  `tdd-guide`, `diagram-design`. Her birinin ne zaman kullanılacağı ve projeye özel
  kısıtları o README'de; kısıtlar upstream örneklerinin önüne geçer.
- `ponytail` ailesi `.codex/skills` altında kaldı ve kullanılmaz. Kod yazım ilkeleri
  skill'de değil [AGENTS.md](../AGENTS.md) §5'tedir: önce okunabilirlik, açık adımlar,
  "neden" yorumları, değişiklikten sonra adım adım açıklama.
- `mattpocock-skills` için kurulum yöntemi henüz seçilmedi (Q-10).
- Kaynak ve lisanslar: [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
