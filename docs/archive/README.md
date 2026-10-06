# Arşiv — referans alınmaz

Bu klasördeki belgeler geçerliliğini yitirmiş sürümlerdir. Tarihçe ve tez için saklanır.
**Gereksinim, eşik, metrik, KPI veya karar için referans alınmaz**; bir görev bu belgelerden
değer alıyorsa durur ve güncel belgeye bakar. Kural [AGENTS.md](../../AGENTS.md) "Project
Invariants" bölümündedir.

| Belge | Neden arşivde |
| --- | --- |
| `SilentWatt-PRD-v0.9.md` | İlk ürün şartnamesi (8 Eylül 2026); mimari ve kapsam sonra değişti. Kaynak: repo dışındaki `../Dokümanlar/`. |
| `SilentWatt-Teknik-PRD-v1.0.md` | v1.1 ile yerini aldı (15 Eylül 2026). Kaynak: repo dışındaki `../Dokümanlar/`. |

`docs/product/SilentWatt-Teknik-PRD-v1.1.md`, PRD v2.0 yayımlandığı commit'te buraya taşınacak.
O zamana kadar v1.1'in metrik hedefleri, dedektör eşikleri ve sentetik deney ızgarası
doğrulanmamış varsayımdır (2026-10-06 kararı, [decisions.md](../../second_brain/decisions.md)).
Kopyalar içerik olarak kaynakla aynıdır; yalnız başlarına bu uyarı eklendi. Bu yüzden v1.0'daki
`ekler/...` gibi göreli bağlantılar özgün klasöre (`../Dokümanlar/ekler/`) göredir ve burada açılmaz;
`audit_prd_data.py`'nin güncel sürümü `docs/product/ekler/` altındadır.
