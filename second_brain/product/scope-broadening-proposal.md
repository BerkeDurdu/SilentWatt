---
type: decision
area: product
status: aktif
related: [Q-13, Q-14, D-01, D-02, D-03, D-05]
updated: 2026-09-27
---

# Kapsam önerisi: çok ekipmanlı enerji performansı sapması (PRD v1.2 taslağı)

> Kararın durumu [decisions.md](../decisions.md)'de (Q-13). Bu not ekip görüşmesi için
> hazırlanan öneridir. Ekip karar verince yetkili metin PRD v1.2 olarak `docs/` altına
> yazılır ve bu notun durumu `yayınlandı` olur.

**Hazırlayan:** Yusuf Ziya Demirel (C) · **Tarih:** 2026-09-27 · **Karar verecekler:**
Berke Durdu (A), Muharrem Dokgöz (B), Yusuf Ziya Demirel (C) · **Önerilen görüşme:** 1–2 Ekim

## Bağlam

- Teknik sunum içeriği (8 Eylül) HVAC'ı yalnız sunum örneği olarak kullanmış ve ilk arıza
  ailesinin veriye göre seçileceğini söylemişti. Sunum sonrası alınan geri bildirim
  (Yusuf'un aktarımı, 2026-09-27): yalnız klima arızasına odaklanılmamalı.
- PRD v1.1 ilk sürümü tek klima kanalına (`air1`) daraltıyor (PRD §0.1, §3.1). Mevcut
  kurallarla 8 aday hane kalıyordu ve PRD'nin en az 10 hane hedefi karşılanmıyordu (D-05). 2026-10-06'da
  ölü bant kararıyla (D-04) aday sayısı 21 oldu.
- Veri daha geniş bir kapsamı destekliyor: train döneminde 9 kanal en az 20 hanede var
  ([kanal envanteri ve metadata](../data/channel-inventory-and-metadata.md)).

## Seçenekler

| Seçenek | Varsaydığı şey | Artı | Eksi / risk |
|---|---|---|---|
| 1. Mevcut kapsam: yalnız `air1` | Tek kanal yeterli | İş hazır (P0, P1) | Geri bildirime cevap vermiyor; 8 hane; tek fiziksel davranış |
| **2. HVAC + buzdolabı, GES üçüncü** | Yöntem ekipmandan bağımsız | Aynı yöntemi farklı fiziksel davranışlarda gösterir; ikisi de "beklenenden fazla tüketim" arar; buzdolabı 1 dk veriyi anlamlı kullanır | İş yükü artar; her aile için cohort ve kalite kuralı gerekir |
| 3. HVAC + GES, buzdolabı üçüncü | Konsol ve sunum GES'i öne çıkarıyor | GES konsolda zaten var; üretim kaybı kolay anlatılır | Farklı yöntem: eksik üretim arar, komşu karşılaştırması gerekir |
| 4. Tüm kanallar ve tüm ev | Her kanal hedef olabilir | En geniş kapsam | Davranışa bağlı cihazlar arıza hedefi değil; değerlendirmesi zor |

## Kanıt

| Aile | Kanal | Train'de verisi olan hane | Beklenen davranışı belirleyen | Not |
|---|---|---:|---|---|
| HVAC | `air1` + `furnace1` | 24 + 24 | Dış sıcaklık, saat, gün tipi | Kompresör çalışırken fan medyan %100 çalışıyor; 9278 muhtemelen ısı pompası |
| Buzdolabı | `refrigerator1` | 23 | Kendi geçmişi, mevsim | Sürekli çalışır; 1 dk veriden döngü analizi |
| Çatı GES | `solar` | 19 (üreten) | Metadata'daki kapasite + diğer GES'ler | Kapasite 2,88–6,9 kW |
| Tüm ev, taban yük | `grid` + `solar` | 25 | Gece tüketiminin geçmişi | Devreler tüketimin medyan %72'sini ölçüyor |
| Bağlam | Bulaşık, çamaşır, kurutucu, EV | 9–25 | — | Arıza hedefi değil; aktivite göstergesi |

Birim ve aralık için kanıt: [kaynak anlamı notu](../data/source-semantics-evidence.md)
(D-01: kW aralık ortalaması; D-02: 15 dk etiketi aralığın başı).

## Öneri

1. **Ürün tanımı:** "Devre bazında enerji performansı sapması". Yöntem zinciri aynı kalır:
   beklenen davranış → kalibre bant → kalıcı sapma → kanıt → insan kararı.
2. **Aileler ve sıra:** (1) HVAC, (2) buzdolabı, (3) GES. Tüm ev ve davranışa bağlı
   cihazlar bağlam göstergesi olur. Zaman kısalırsa GES "gelecek çalışma" olarak kalır.
3. **Değişmeyenler:** Test dönemi (Ağustos–Aralık) tüm kanallar için kapalı (Q-14).
   Arıza doğrulaması ve tasarruf iddiası yok. Karar insanda.
4. **Birim:** D-01 ve D-02 için öneri hazır. B+C kararıyla kapanırsa kW/kWh gösterimi
   kullanılabilir; kapanana kadar "doğrulanmamış kaynak birimi" dili sürer.
5. **Cohort:** P0 kuralları (`air2`/`airwindowunit1` dışlaması dahil) yalnız `air1`
   ailesi içindir. Her aile için kural EDA'dan sonra önerilir; sonuca bakılarak seçilmez.

**PRD v1.2'de değişecek bölümler:** §0.1 ve §1 (ürün tanımı), §3.1 (MVP kapsamı), §5.3
(aile bazında cohort), §7.1 (aile bazında tahmin girdileri), §9.2 (öneri kütüphanesi),
§10 (sentetik senaryolar), §13.2 (birim gösterimi, D-01 kapanınca), §15.2 (aile bazında
KPI'lar), §19.2 (A-01, A-02).

**Rollere etkisi:**
- **A (Berke):** Ekranlarda aile seçimi; "arıza olasılığı" yerine sapma ve kanıt dili.
  GES ekranları korunabilir.
- **B (Muharrem):** Çok kanallı veri sözleşmesi (Q-04); D-01 ve D-02 kararı; PR #1 incelemesi.
- **C (Yusuf):** EDA (30 Eylül); aile bazında model ve dedektörler; tez araştırma sorusuyla uyum.

## Karar

Görüşmede doldurulacak: karar, karar verenler, tarih, yetkili belge bağlantısı.

## Sonuçlar

- P1 sonuçları `air1` için geçerli kalır. HVAC ailesine `furnace1` eklenince hesaplar
  yeni bir protokolle yeniden yapılır.
- Her aile için P0/P1 benzeri bir denetim, cohort ve önceden dondurulmuş protokol gerekir.
- ML ile konsol arasındaki sözleşme (Q-04) aileleri taşıyacak biçimde tasarlanır.
