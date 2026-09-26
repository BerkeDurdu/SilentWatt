---
type: map
area: product
status: aktif
related: [D-05, A-06, A-07, A-08, A-11, Q-08]
updated: 2026-09-22
---

# Ürün haritası

Ürün vaadi, kapsam, kabul hedefleri, plan ve repo dışındaki ürün materyalleri.
Durumlar [decisions.md](../decisions.md)'de tutulur.

## Yetkili kaynak

[Teknik PRD v1.1](../../docs/product/SilentWatt-Teknik-PRD-v1.1.md) (15 Eylül 2026) ürün
ve teknik kapsamın ana sözleşmesidir.

| Konu | PRD bölümü |
|---|---|
| Problem, vaat ve sınır ("ölçülen" ve "ölçülmeyen") | §1 |
| Kullanıcılar (operatör, teknisyen, teknik yönetici) ve senaryolar | §2 |
| MVP kapsamı, MVP dışı konular, iş bölümü | §3 |
| Ekranlar ve gösterim kuralları | §13 |
| Fonksiyonel kabul matrisi (FR) | §14 |
| KPI'lar, ablasyonlar, test seviyeleri | §15 |
| Fonksiyonel olmayan gereksinimler (NFR) | §16 |
| 10 haftalık plan (T1–T4) | §18 |
| Riskler, varsayımlar, sürüm kapıları | §19 |
| Tek vakanın uçtan uca yürüyüşü | §20 |

## Ürün vaadi (özet)

Klima devresi ölçümlerini, gerekçesi ve veri sınırları görülebilen bakım incelemesi
önerilerine dönüştürmek. **Ölçülen:** koşullara göre referans tüketimden sapma.
**Ölçülmeyen:** soğutma kapasitesi, verim kaybı, arıza nedeni, kesin tasarruf (PRD §1.2).

## İddia sınırları (G4)

- Birim doğrulanmadan kW/kWh veya tasarruf iddiası yok (D-01).
- `air1` eşlemesi doğrulanmadan "air1 kanal sapması" denir (D-03).
- Arıza etiketi ve saha doğrulaması yok; "arıza doğrulandı" denmez (A-06, R-01).
- Konsoldaki tüm veriler örnek veridir.

## Plan içindeki konum

- **T1 (veri ve sözleşme):** Kaynaklar okunuyor ve eksikler görünür (P0, notebook).
  ML çıktısına bağlı, sözleşmeli bir mock UI yok (Q-04).
- **T2 (tahmin ve tespit):** B0/B1 ve CQR var; dedektörler ve sentetik üretici yok.
- **T3–T4:** başlamadı.

Kapı ve KPI durumu: [decisions.md](../decisions.md).

## Konsol (demo)

Rol bazlı ekranlar, demo hesapları, uçtan uca akış, müşteri SMS'i ve kontrol talebi:
[kök README](../../README.md). Logo seçenekleri: [logo-secenekleri.html](../../docs/logo-secenekleri.html).

## Repo dışındaki materyaller

Bu klasörler vault'un dışında kalır; Obsidian bağlantıları çalışmaz. Yalnız yolları
kaydedilir, içerik kopyalanmaz.

- `../Dokümanlar/`: PRD v0.9, v1.0 ve **eski bir v1.1 kopyası** (repodakinden 34 satır
  farklı; FastAPI yığınını önerir). Geçerli olan repodaki PRD'dir (Q-08). Ayrıca teknik
  sunum içeriği v1.0.
- `../Sunumlar/`: pazarlama ve teknik sunumlar (pptx), proje fikir sunumu (pdf).
- `../Website/`: ayrı bir Next.js projesi (`sites-project`).
- `../dataset/`: üç kaynak CSV (salt okunur; [data/README.md](../../data/README.md)).

## Açık ürün konuları

D-05 ve PRD'nin 10 uygun hane hedefi · A-06 (referans sağlığı) · A-07 (uzman erişimi) ·
A-08, A-11 (bulut kredileri) · Q-08. Ayrıntı: [decisions.md](../decisions.md).
