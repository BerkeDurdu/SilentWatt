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
- **Aşama:** P0, P1, `p1-v2` ve 21 hanelik EDA (notebook `02`) tamam. Dedektör çekirdeği ve
  kanıt yazıcı testleriyle var (`09d5e98`), gerçek veride çalıştırılmadı; kanıt sözleşmesi v0.1
  taslak (`6152229`). API, konsol bağlantısı ve açıklama yok. **G0 kapısı açık** (D-01, D-02).
- **Git:** çalışma dalı `feat/mvp`; 6 Ekim'de push edildi, [PR #2](https://github.com/BerkeDurdu/SilentWatt/pull/2)
  taslak (taban `feat/ml-foundation`). `feat/ml-foundation` da GitHub'da güncel;
  [PR #1](https://github.com/BerkeDurdu/SilentWatt/pull/1) açık, inceleme yok. Push yalnız açık onayla. İlk ölü bant denemesi `wip/dead-band-first-pass` dalında arşivli. `notebooks/` commit
  edilmedi (Q-09); `tasks/paused/` (park edilen test, karşılaştırma betiği) da commit edilmedi.
  Durdurulan agent'ların worktree'leri `.claude/worktrees/` altında duruyor (commit yok);
  silinmeleri kullanıcı kararı.
- **Veri:** ±0,01 ölü bant (D-04) ve **21 hane** (D-05), 2026-10-06. Kaynak hash'leri P0 kaydıyla
  aynı; tek veri kaynağı `../dataset/`. Birim ve aralık için öneri hazır
  ([kaynak anlamı notu](data/source-semantics-evidence.md)).
- **Model:** Temmuz taramasında **B0 korunur**. **Üst sınır aşımı B0 %12,78** (hedef ≈ %5),
  klima çalışırken kapsama %80,77; değerlendirilen pay %59,7
  ([p1-v2 raporu](../docs/project-status/p1-v2-results-2026-10-06.md)). EDA: Haziran'da bile
  üst sınır aşımı %8,3 (simetrik kalibrasyon + sıfırlar); en sıcak Temmuz günlerinde model kör.
  Karar: asimetrik CQR (`p1-v3`, Q-03); Haziran eğitime katılmaz (A-04).
- **Konsol:** örnek veriyle çalışıyor (İzmir, ısı pompası, kWh dili); ML'ye bağlı değil (Q-04).
  Konsol A'nın (Berke), API B'nin (Muharrem) işi; bizim agent'larımız yazmaz (2026-10-06).
- **Ajan yapısı:** dokuz skill `.claude/skills` altında; `ponytail` kullanılmıyor. Kurallar
  [AGENTS.md](../AGENTS.md)'de (6 Ekim'de dört kural eklendi). CLAUDE.md oluşturulmaz.

## Aktif blokajlar

- **D-01, D-02:** birim ve aralık; öneri hazır, B+C kararı bekleniyor. **D-03:** `air1`
  kompresör, `furnace1` iç ünite fanı gibi davranıyor; kanıt toplanıyor.
- **Q-03 (karar verildi):** üst sınır asimetrik CQR ile ayrı kalibre edilecek (`p1-v3`); dedektörün
  gerçek veri koşusu bunu bekliyor. A-04, Q-16 ve Q-17 de 6 Ekim'de karara bağlandı; kısmi gün
  Q-18'de, mevsim kayması Q-19'da (30 Ekim).
- **Devir:** Berke ve Muharrem'e konsol/API ve kanıt sözleşmesi v0.1 için haber verilecek (Q-04);
  açıklama katmanı önerimiz Muharrem'in onayında (Q-15).
- **Q-01:** 2361 ve 3039'da ölü bant üstü sabit okumalar donma şüphesinde.
- **Q-13:** kapsam genişletme için ekip kararı (A+B+C).

## Sıradaki işler (MVP, 9 Ekim)

1. Berke ve Muharrem'e devir notu: konsol/API, kanıt sözleşmesi v0.1, Q-15 önerisi; D-04, D-05
   ve Q-17 bildirimi.
2. `p1-v3` (asimetrik CQR, Q-03): önce davranışı koruyan düzenleme ve testler, sonra P1 koşusu.
3. Dedektör hattı: ayrı dedektör config'i, kaynaklı sentetik plan, `detect` komutu; park edilen
   test `tasks/paused/` altında.
4. Eşik karşılaştırması ve alarm bütçesi; gerçek kanıt dosyaları (Temmuz yeniden oynatma, sentetik).
5. PRD v2.0 (sayılar [p1_report_tables.py](../docs/product/ekler/p1_report_tables.py) ile);
   ekiple birleştirme, demo senaryosu ve prova.
6. Sonra (30 Ekim): derin öğrenme, buzdolabı, kör test, Q-01 donma incelemesi, hafta günü (Q-16),
   kısmi gün (Q-18), mevsime duyarlı eğitim (Q-19).

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
