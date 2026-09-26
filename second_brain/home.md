---
type: map
area: process
updated: 2026-09-26
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

- **Aşama:** P0 (veri denetimi, cohort kararları) ve P1 (kalibrasyon, günlük kalite,
  B0/B1 karşılaştırması) tamam; koşullu çevrimdışı deney. Veri anlama notebook'u tamam.
  **G0 (veri hazır) kapısı açık.**
- **Git:** dal `feat/ml-foundation`; [PR #1](https://github.com/BerkeDurdu/SilentWatt/pull/1)
  açık (P0 + P1). 2026-09-26: skill taşıması, `AGENTS.md` ve `second_brain/` commit
  edildi, push yapılmadı. `notebooks/` commit edilmedi (Q-09).
- **Veri:** 25 → 8 teknik aday (661, 1642, 2335, 3456, 6139, 7536, 7800, 8565); ekip
  onayı bekliyor (D-05) ([P0 §2](../docs/project-status/p0-data-decisions-2026-09-17.md)).
- **Model:** Temmuz development taramasında **B0 korunur**; iki modelin kalibre
  kapsaması da %87 hedefinin altında; skorlanan pay 13.423 / 23.808 slot
  ([P1 raporu](../docs/project-status/p1-ml-results-2026-09-17.md)).
- **Konsol:** örnek veriyle çalışıyor, bellek içi depo, ML çıktısına bağlı değil (Q-04).
- **Ajan yapısı:** dokuz skill `.claude/skills` altında, yeni skill eklenmedi (2026-09-26);
  `ponytail` kullanılmıyor. Oturum başlangıcı ve kod kuralları [AGENTS.md](../AGENTS.md)'de;
  eski kodda yalnız dokunulan fonksiyon §5'e getirilir. CLAUDE.md (Q-05) ve
  `mattpocock-skills` seçimi (Q-10) açık.

## Aktif blokajlar

- **D-01, D-02, D-03:** birim, 15 dk değerin anlamı ve `air1` eşlemesi → sağlayıcı belgesi.
- **D-04:** negatiflerin anlamı → yeni kanıt:
  [negatif değerler notu](data/negative-values-sensor-floor.md).
- **Q-01:** donma kuralı 6139'u 151 train gününden 9'a düşürüyor; standby olabilir.
- **D-05:** 8 aday için ekip onayı; PRD'nin 10 uygun hane hedefi karşılanmıyor.

## Sıradaki aday işler (henüz karar verilmedi)

1. D-04 ve Q-01 için ekibe kısa bir karar önerisi (ölü bant + standby kanıtı).
2. `02_negative_values_and_freeze.ipynb`: negatif ve donma analizlerini notebook'a taşımak.
3. Q-04: ML kanıt JSON sözleşmesini B ile başlatmak (PRD §11.2).
4. PRD'deki sonraki ML adımı: akut/kronik dedektör ve sentetik benchmark (PRD §8, §10).
5. Notebook'un commit biçimi (Q-09); yeni commit'lerin push'u ve PR #1 açıklaması.
6. Değerlendirmeden kalan orta/düşük öncelikli görevler ([günlük](log.md), 2026-09-26).

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
