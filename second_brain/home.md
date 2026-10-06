---
type: map
area: process
updated: 2026-10-06
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

- **Takvim:** staj 9 Ekim'de biter; sunumda **çalışan MVP** (yalnız HVAC) istenir. Teknik
  çalışmalar 30 Ekim'de sunulur. PRD v2.0 kanıttan yazılacak; v1.1'in metriklerine güvenilmiyor.
- **Aşama:** P0, P1 ve `p1-v2` tamam (koşullu çevrimdışı deney). MVP parçaları (dedektör,
  kanıt JSON'u, API, konsol bağlantısı, açıklama) henüz yok. **G0 kapısı açık** (D-01, D-02).
- **Git:** çalışma dalı `feat/mvp` (push yok). `feat/ml-foundation`'daki iki 27 Eylül commit'i
  GitHub'da değil; [PR #1](https://github.com/BerkeDurdu/SilentWatt/pull/1) açık, inceleme
  yok. İlk ölü bant denemesi `wip/dead-band-first-pass` dalında arşivli. `notebooks/` commit
  edilmedi (Q-09).
- **Veri:** ±0,01 ölü bant (D-04) ve **21 hane** (D-05), 2026-10-06. Kaynak hash'leri P0 kaydıyla
  aynı; tek veri kaynağı `../dataset/`. Birim ve aralık için öneri hazır
  ([kaynak anlamı notu](data/source-semantics-evidence.md)).
- **Model:** Temmuz taramasında **B0 korunur**. **Üst sınır aşımı B0 %12,78** (hedef ≈ %5),
  klima çalışırken kapsama %80,77; değerlendirilen pay %59,7
  ([p1-v2 raporu](../docs/project-status/p1-v2-results-2026-10-06.md)).
- **Konsol:** örnek veriyle çalışıyor (İzmir, ısı pompası, kWh dili); ML'ye bağlı değil (Q-04).
- **Ajan yapısı:** dokuz skill `.claude/skills` altında; `ponytail` kullanılmıyor. Kurallar
  [AGENTS.md](../AGENTS.md)'de (6 Ekim'de dört kural eklendi). CLAUDE.md oluşturulmaz.

## Aktif blokajlar

- **D-01, D-02:** birim ve aralık; öneri hazır, B+C kararı bekleniyor. **D-03:** `air1`
  kompresör, `furnace1` iç ünite fanı gibi davranıyor; kanıt toplanıyor.
- **Q-03:** üst sınır Temmuz'da çok sık aşılıyor (Haziran → Temmuz kayması); dedektörün yanlış
  alarm yükünü belirleyecek. Öneri: üst sınırı ayrı kalibre etmek.
- **Q-01:** 2361 ve 3039'da ölü bant üstü sabit okumalar donma şüphesinde.
- **Q-13:** kapsam genişletme için ekip kararı (A+B+C).

## Sıradaki işler (MVP, 9 Ekim)

1. Kanıt JSON sözleşmesi ve agent talimatları; konsol, API ve açıklama agent'ları.
2. Dedektör ve sentetik vakalar (yalnız Temmuz); temiz Temmuz'da yanlış alarm sayısı.
3. PRD v2.0 (sayılar [p1_report_tables.py](../docs/product/ekler/p1_report_tables.py) ile).
4. Birleştirme, denetçi agent, demo senaryosu ve prova.
5. Sonra (30 Ekim): derin öğrenme, buzdolabı, kör test, EDA notebook `02`.

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
