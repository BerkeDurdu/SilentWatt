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
incelenmiş 1 base64 yanlış pozitifi var. 163 diyagram/şablon kontrolü (165 genel dosyada 2 katalog FAIL belgeli) ve Python sözdizimi
kontrolleri geçti. Tam audit önceki sonuçla eşit; train analizi 8 adayı doğruladı.
Kaynak CSV'ler/ham artifact'lar Git dışında. Veri anlamı ve nihai ekip onayı açık.

Kanıt: `docs/project-status/p0-verification-2026-09-17.md` ve
`docs/project-status/p0-data-decisions-2026-09-17.md`.

## GitHub teslim kaydı

Bu dosyayı içeren ayrı P0 commit'i `feat/ml-foundation` dalında teslim edilir.
Push, PR URL'si ve uzak CI sonucu değişken GitHub durumudur; son görev yanıtı ve
PR commit/check kayıtları teslim kanıtıdır. `main` tabanlı PR, önceden mevcut
`b52e6d5` foundation commit'ini de içerir. Merge bu görevin kapsamında değildir.

# P0 yeniden doğrulama → P1 ML temelini tamamlama

- [x] P0: commit/PR, testler, kaynak audit'i, cohort ve skill kanıtlarını yeniden doğrula; varsa hataları önce düzelt.
- [x] P1 tasarımını sabitle: train-only B0/B1, ayrı calibration, development-only karşılaştırma, günlük kalite politikası.
- [x] Günlük kalite kapıları ve sonlu örneklem CQR kalibrasyonunu uygula.
- [x] Çok haneli B0/B1 değerlendirmesi ve hane/ay metriklerini üret.
- [x] Sızıntı, DST, kalibrasyon yeterliliği, donma/eksik/negatif veriler, adil payda ve tekrar üretilebilirliği test et.
- [x] Gerçek aday cohort'ta çalıştır; yalnız development sonuçlarını karşılaştır; kararları/limitleri belgeleyip teslim et.

P1 boyunca birim/fiziksel eşleme ve nihai cohort onayı açık kalır. Bu koşullu
çevrimdışı deney, G0 veya ürün yayını onayı değildir. Test bölmesi karşılaştırmaya kapalıdır.


P1 doğrulama: 35/35 test geçti; eski gerçek baseline tahminleri/metrikleri korunuyor.
8 adayda calibration tamam; gerçek run03/run04 dosyaları byte eşit. Development
kararı B0'ı korumak: B1 macro pinball 0,216709 > 0,168172; kalibre kapsama
B1 %84,370 / B0 %86,687. Skorlanan 13.423/23.808 slot ve donma kapısının
6139'da 9 train gününe düşürmesi açık risk olarak belgelendi. P1 raporu:
`docs/project-status/p1-ml-results-2026-09-17.md`. Güncel PR/CI durumu GitHub
check kaydından doğrulanır; merge veya G0 onayı bu teslimin parçası değildir.
