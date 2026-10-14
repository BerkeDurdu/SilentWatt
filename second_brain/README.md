---
type: guide
area: process
updated: 2026-09-23
---

# second_brain — SilentWatt bilgi tabanı

Bu klasör projenin **yaşayan bilgi katmanıdır**: şu an nerede olduğumuzu, neyin açık
olduğunu, ne öğrendiğimizi ve kararların neden öyle verildiğini takip eder. Obsidian
ile okunup yazılır ve Claude oturumlarının giriş noktasıdır. Başlangıç: [home.md](home.md).

## Sorumluluk ayrımı

`docs/` neyin **kabul edildiğini ve yayımlandığını** söyler. `second_brain/` **güncel
durumu, açık konuları ve öğrenilenleri** tutar. Buradaki notlar belgeleri kopyalamaz;
bağlantı verir ve en fazla 1–2 cümle özetler.

| Katman | Nerede | Ne içerir |
|---|---|---|
| Sözleşme | [PRD](../docs/product/SilentWatt-Teknik-PRD-v1.1.md), [config](../configs/ml/austin-2018.json) | Kapsam, eşikler, KPI'lar, sürüm kapıları |
| Yayımlanmış kanıt | `docs/project-status/`, `docs/architecture/` | Tarihli, sonradan değiştirilmeyen raporlar ve protokoller |
| Çalıştırma | [README](../README.md), [ML](../packages/ml/README.md), [veri](../data/README.md), notebook (`notebooks/README.md`, depoda değil) | Kurulum, komutlar, sınırlar |
| Ajan iş akışı | [AGENTS.md](../AGENTS.md), [tasks/todo.md](../tasks/todo.md), [tasks/lessons.md](../tasks/lessons.md) | Görev planı, doğrulama, süreç dersleri |
| **Yaşayan bilgi** | **`second_brain/`** | Güncel durum, karar/soru takibi, araştırma notları, koşu kaydı, sözlük, günlük |
| Kişisel tercih | Claude hafızası (repo dışında) | Yalnız çalışma tercihleri; proje bilgisi değil |

Bir not olgunlaşıp ekip kararına dönüşünce yetkili metin `docs/` altına yazılır; not
`status: yayınlandı` olur ve o belgeye bağlanır. İki kaynak çelişirse `docs/` geçerlidir,
`second_brain/` düzeltilir.

## Yapı

```text
second_brain/
├── README.md        bu sayfa: kurallar ve kurulum
├── home.md          giriş: proje özeti, güncel durum, blokajlar, okuma haritası
├── decisions.md     karar ve açık soru kaydı (tek tablo, ID eşlemesi)
├── workflow.md      geliştirme akışı + Claude oturum rutini
├── glossary.md      terimler
├── log.md           kronolojik günlük (en yeni üstte)
├── data/            veri alanı: data-map.md + notlar
├── ml/              ML alanı: ml-map.md, experiment-log.md + notlar
├── architecture/    mimari: architecture-map.md
├── product/         ürün: product-map.md
└── templates/       note.md, decision.md
```

Yeni klasör açmadan önce mevcut alanlardan birine sığıp sığmadığına bak. Karar notu
([şablon](templates/decision.md)) yalnız bir konu [decisions.md](decisions.md)'deki tek
satıra sığmadığında açılır.

## Yazım kuralları

- **Dosya adı:** İngilizce, kebab-case, ASCII (`negative-values-sensor-floor.md`); içerik
  Türkçe. `docs/` ile aynı kural.
- **Bağlantı:** Göreli Markdown bağlantısı, ör.
  `[P0 kararları](../docs/project-status/p0-data-decisions-2026-09-17.md)`. Obsidian,
  GitHub, VSCode ve Claude'da aynı çalışır. `[[wikilink]]` kullanma; GitHub'da çalışmaz.
- **Bölüm atfı:** Başlık bağlantısı (`#bölüm`) kullanma; Obsidian ve GitHub farklı
  üretir. Bölümü metinde yaz: "P0 §5", "PRD §19.3".
- **Özellikler:** Her dosyada `type` ve `updated` zorunludur; alan dosyalarında `area` da
  bulunur. `status` ve `related` yalnız notlarda ve alan haritalarında kullanılır; üst
  düzey dosyalar (home, decisions, workflow, glossary, log, bu README) bunları taşımaz.
  Şablon: [templates/note.md](templates/note.md).
- **Kanıt ayrımı:** Doğrulanmış gözlem, varsayım ve açık karar ayrı yazılır
  ([AGENTS.md](../AGENTS.md) ilkesi).
- **Sayılar:** Kaynak ve tarihle yazılır ("P1 raporu, 2026-09-17"). Kaynağı olmayan
  sayı yazılmaz.
- **Veri sınırı:** Ham satır, satır düzeyinde ölçüm, kişisel bilgi ve test dönemine ait
  metrik yazılmaz. Hane kodları mevcut belgelerdeki anonim kaynak kimlikleridir.
- **Kısa tut:** `home.md` en fazla 80 satır; bir not tek konu; uzayan not bölünür.

## Özellik değerleri

| Alan | Değerler |
|---|---|
| `type` | `note`, `decision`, `map`, `log`, `guide` |
| `area` | `data`, `ml`, `architecture`, `product`, `process` |
| `status` (not) | `aktif`, `yayınlandı`, `eskidi` |
| Karar durumu ([decisions.md](decisions.md)) | `açık` → `kanıt toplanıyor` → `öneri hazır` → `ekip kararında` → `kapandı`; ayrıca `ertelendi` |

## Obsidian kurulumu

1. Obsidian → *Open folder as vault* → repo kökü (`Repository/`). `second_brain/` bu
   vault'un ana klasörüdür; `docs/`, README'ler ve `tasks/` da vault'un parçasıdır.
2. *Settings → Files and links*:
   - `Use [[Wikilinks]]` kapalı. (`[[` yazınca otomatik tamamlama yine çalışır;
     Obsidian bağlantıyı Markdown biçiminde ekler.)
   - **New link format:** *Relative path to file*.
   - **Excluded files:** `node_modules/`, `dist/`, `artifacts/`.
3. *Settings → Core plugins → Templates* açık; *Template folder location* =
   `second_brain/templates`.
4. Topluluk eklentisi gerekmez.

Obsidian vault kökünde `.obsidian/` klasörü oluşturur. Bu kişisel ayardır; commit etme.
`.gitignore` kaydı henüz eklenmedi (bkz. [decisions.md](decisions.md), Q-06).
