---
type: map
area: process
updated: 2026-09-27
---

# SilentWatt — başlangıç

> Her oturumda önce bu sayfa okunur. Veri/ML kararına dokunan işlerde
> [decisions.md](decisions.md) de okunur. Kurallar: [README.md](README.md).

## Proje

SilentWatt, klima devresi ölçümünde (`air1`) dış sıcaklık ve saate göre beklenenden
**kalıcı tüketim sapmalarını** bulup bakım ekibine gerekçeli inceleme önerisi sunacak
bir karar destek sistemidir ([PRD §1](../docs/product/SilentWatt-Teknik-PRD-v1.1.md)).
Veri: Pecan Street Austin 2018, 25 hane (15 dk ve 1 dk elektrik, saatlik hava).
Ekip: A Berke Durdu (UX/frontend), B Muharrem Dokgöz (backend/veri/bulut),
C Yusuf Ziya Demirel (AI/ML). İki parça var: rol bazlı web konsolu (React + Express,
**örnek veri**) ve çevrimdışı Python ML paketi (`packages/ml`). İkisi henüz bağlı değil.

## Güncel durum

- **Aşama:** P0 ve P1 tamam (koşullu çevrimdışı deney); veri anlama notebook'u tamam.
  **G0 (veri hazır) kapısı açık.** 2026-09-27: kapsamı `air1` dışına genişletme önerisi
  hazır (Q-13, [kapsam önerisi](product/scope-broadening-proposal.md)). 30 Eylül'e kadar
  ön işleme, EDA ve ML karşılaştırması teslim edilecek; ardından derin öğrenme planlanıyor.
- **Git:** dal `feat/ml-foundation`; [PR #1](https://github.com/BerkeDurdu/SilentWatt/pull/1)
  açık (P0 + P1), `78cb14c` için CI geçti, inceleme yok. 2026-09-27 değişiklikleri
  commit edilmedi; `notebooks/` da edilmedi (Q-09).
- **Veri:** 25 → 8 teknik aday (661, 1642, 2335, 3456, 6139, 7536, 7800, 8565); ekip
  onayı bekliyor (D-05). Birim (kW aralık ortalaması) ve 15 dk aralığı (etiket aralığın
  başı) için öneri hazır (D-01, D-02; [kaynak anlamı notu](data/source-semantics-evidence.md)).
  Dataport metadata dosyası `../dataset/` altında.
- **Model:** Temmuz development taramasında **B0 korunur**; iki modelin kalibre
  kapsaması da %87 hedefinin altında; skorlanan pay 13.423 / 23.808 slot
  ([P1 raporu](../docs/project-status/p1-ml-results-2026-09-17.md)).
- **Konsol:** örnek veriyle çalışıyor, bellek içi depo, ML çıktısına bağlı değil (Q-04).
- **Ajan yapısı:** dokuz skill `.claude/skills` altında; `ponytail` kullanılmıyor. Oturum
  başlangıcı ve kod kuralları [AGENTS.md](../AGENTS.md)'de. CLAUDE.md (Q-05), Q-10 açık.

## Aktif blokajlar

- **D-01, D-02:** öneri hazır; B+C kararı bekleniyor. **D-03:** `air1` kompresör,
  `furnace1` iç ünite fanı gibi davranıyor; kanıt toplanıyor.
- **D-04:** negatiflerin anlamı ([not](data/negative-values-sensor-floor.md)); kural kanal
  bazında olmalı, çünkü `solar`/`grid` negatifleri fiziksel.
- **Q-01:** donma kuralı 6139'u 151 train gününden 9'a düşürüyor; standby olabilir.
- **D-05:** 8 aday için ekip onayı; PRD'nin 10 uygun hane hedefi karşılanmıyor.
- **Q-13:** kapsam genişletme için ekip kararı (A+B+C).

## Sıradaki aday işler (henüz karar verilmedi)

1. EDA notebook'u `02` (30 Eylül): kanal kalite matrisi, 27 Eylül kontrolleri, aile bazında
   uygunluk tablosu. Test dönemi tüm kanallarda kapalı (Q-14, onay bekliyor).
2. Ekip görüşmesi (1–2 Ekim): Q-13 kapsam, D-01/D-02 kararı, PR #1 incelemesi.
3. D-04, Q-01 ve A-04 için ekibe tek bir karar önerisi (ölü bant, standby, mevsim desteği).
4. Q-04: ML kanıt JSON sözleşmesini B ile başlatmak (PRD §11.2); aileleri taşıyacak biçimde.
5. Aile bazında model ve dedektörler; derin öğrenme B2 adayı olarak (PRD §7.1, §8, §10).
6. Notebook'un commit biçimi (Q-09) ve kalan görevler ([günlük](log.md), 2026-09-26).

## Değişmezler

Kapalı test dönemi, dönem rolleri, doğrulanmamış birim, salt okunur kaynaklar ve config
eşikleri gibi bozulmaz kurallar [AGENTS.md](../AGENTS.md) "Project Invariants" bölümündedir.
Durumları [decisions.md](decisions.md)'de izlenir.

## Okuma haritası

| Konu | Sayfa |
|---|---|
| Veri, kalite, cohort | [data/data-map.md](data/data-map.md) |
| Modeller, protokol, sonuçlar | [ml/ml-map.md](ml/ml-map.md) · [koşu kaydı](ml/experiment-log.md) |
| Sistem sınırları, sözleşmeler, CI | [architecture/architecture-map.md](architecture/architecture-map.md) |
| Ürün vaadi, KPI, kapılar, plan | [product/product-map.md](product/product-map.md) |
| Açık kararlar ve sorular | [decisions.md](decisions.md) |
| Nasıl çalışıyoruz | [workflow.md](workflow.md) |
| Terimler | [glossary.md](glossary.md) |
| Ne zaman ne oldu | [log.md](log.md) |
| Süreç dersleri | [tasks/lessons.md](../tasks/lessons.md) |
