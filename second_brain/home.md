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
- **Git:** çalışma dalı `feat/mvp` (push yok). `feat/ml-foundation`'daki iki 27 Eylül commit'i
  GitHub'da değil; [PR #1](https://github.com/BerkeDurdu/SilentWatt/pull/1) açık, inceleme
  yok. İlk ölü bant denemesi `wip/dead-band-first-pass` dalında arşivli. `notebooks/` commit
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
- **Konsol:** örnek veriyle çalışıyor (İzmir, ısı pompası, kWh dili); ML'ye bağlı değil (Q-04).
  Konsol A'nın (Berke), API B'nin (Muharrem) işi; bizim agent'larımız yazmaz (2026-10-06).
- **Ajan yapısı:** dokuz skill `.claude/skills` altında; `ponytail` kullanılmıyor. Kurallar
  [AGENTS.md](../AGENTS.md)'de (6 Ekim'de dört kural eklendi). CLAUDE.md oluşturulmaz.

## Aktif blokajlar

- **D-01, D-02:** birim ve aralık; öneri hazır, B+C kararı bekleniyor. **D-03:** `air1`
  kompresör, `furnace1` iç ünite fanı gibi davranıyor; kanıt toplanıyor.
- **Q-03:** üst sınır Haziran'da bile %8,3, Temmuz'da %12,0 aşılıyor; dedektörün yanlış alarm
  yükünü belirleyecek. Öneri: dedektörden önce asimetrik CQR ile p1-v3 (Yusuf'un kararı bekleniyor).
- **Model tarafı sorular (EDA 02):** A-04 (Haziran'ı eğitime katmak), Q-16 (hafta günü), Q-17
  (olağandışı train günleri); öneriler [decisions.md](decisions.md)'de.
- **Devir:** Berke ve Muharrem'e konsol/API ve kanıt sözleşmesi v0.1 için haber verilecek (Q-04);
  açıklama katmanının sahibi açık (Q-15).
- **Q-01:** 2361 ve 3039'da ölü bant üstü sabit okumalar donma şüphesinde.
- **Q-13:** kapsam genişletme için ekip kararı (A+B+C).

## Sıradaki işler (MVP, 9 Ekim)

1. Yusuf'un kararları: Q-03, A-04, Q-16, Q-17, Q-15; Berke ve Muharrem'e devir notu.
2. Onaylanırsa p1-v3 (asimetrik CQR): önce davranışı koruyan düzenleme ve testler.
3. Dedektör hattı: ayrı dedektör config'i, kaynaklı sentetik plan, `detect` komutu; park edilen
   test `tasks/paused/` altında.
4. Eşik karşılaştırması ve alarm bütçesi; gerçek kanıt dosyaları (Temmuz yeniden oynatma, sentetik).
5. PRD v2.0 (sayılar [p1_report_tables.py](../docs/product/ekler/p1_report_tables.py) ile);
   ekiple birleştirme, demo senaryosu ve prova.
6. Sonra (30 Ekim): derin öğrenme, buzdolabı, kör test, Q-01 donma incelemesi.

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
