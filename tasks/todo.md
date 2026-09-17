# P0 — ML foundation kontrollü teslim (17 Eylül 2026)

Dal: `feat/ml-foundation`. Kapsam: bekleyen skill/dokümantasyon entegrasyonu,
kanıta dayalı veri/cohort değerlendirmesi, doğrulama ve GitHub PR teslimi.
Uygulama mimarisi, veri dönüşümleri, cohort eşikleri ve bölmeler korunacak.

- [x] Dalı, bekleyen değişiklikleri ve istenen altı skill'i incele.
- [x] Skill kaynak/lisans/güvenlik ve dokümantasyon sorunlarını düzelt.
- [x] Kaynak audit'ini yeniden üret; eğitim verisinden 8 adayın nedenlerini,
      seçim darboğazlarını ve eşik duyarlılığını incele.
- [x] Veri anlamı ve cohort için Muharrem/B+C karar kayıtlarını hazırla;
      teknik bulguyu ekip onayından ayır.
- [x] ML testleri, web typecheck/build, güvenlik ve belge kontrollerini çalıştır.
- [x] `ponytail-review` ile commit öncesi kapsam/karmaşıklık kontrolü yap.


## Doğrulama / inceleme

18 ML testi, pip check, web typecheck/build geçti. Npm/OSV advisory sorguları
bulgu döndürmedi. 15 skill kaynak commit'leriyle birebir; 14 PASS ve manuel
incelenmiş 1 base64 yanlış pozitifi var. 172 HTML kontrolü ve Python sözdizimi
kontrolleri geçti. Tam audit önceki sonuçla eşit; train analizi 8 adayı doğruladı.
Kaynak CSV'ler/ham artifact'lar Git dışında. Veri anlamı ve nihai ekip onayı açık.

Kanıt: `docs/project-status/p0-verification-2026-09-17.md` ve
`docs/project-status/p0-data-decisions-2026-09-17.md`.

## GitHub teslim kaydı

Bu dosyayı içeren ayrı P0 commit'i `feat/ml-foundation` dalında teslim edilir.
Push, PR URL'si ve uzak CI sonucu değişken GitHub durumudur; son görev yanıtı ve
PR commit/check kayıtları teslim kanıtıdır. `main` tabanlı PR, önceden mevcut
`b52e6d5` foundation commit'ini de içerir. Merge bu görevin kapsamında değildir.
