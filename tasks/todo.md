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

# Veri anlama notebook'u — 22 Eylül 2026

Kapsam: yalnız `notebooks/01_data_understanding.ipynb`, gerekli küçük okuma
yardımcıları ve tekrar çalıştırma belgeleri. HTML, yeni model/deney, eşik veya
pipeline değişikliği, commit/push/PR yok. Test hedefleri yüklenmez.
Kullanıcının son yönlendirmesi: kodda yalnız `senior-data-scientist`;
veri incelemesinde `data-quality-auditor`, son kontrolde `ponytail-review`.

- [x] Dönem güvenli okuma ve notebook ortamını mevcut ML sürümlerini koruyarak hazırla.
- [x] A–H bölümlerini gözlem/kural/açık karar ayrımı ve grafiklerle oluştur.
- [x] Train cohort'unu ve kalite etkisini mevcut fonksiyonlarla yeniden doğrula.
- [x] Notebook'u çalıştır; kaynak/artifact hash'leri, sızıntı kontrolleri ve grafik çıktıları doğrulansın.
- [x] `ponytail-review` ve kapsam kontrolü; bulguları kaydet ve kullanıcıyla yalnız A bölümünden başla.

Doğrulama: 27 hücre / 17 çalıştırılmış kod hücresi / 19 gömülü PNG; sıfır
hücre hatası. 82/82 kanıt kontrolü geçti. Kaynak, config ve paket kimlikleri
doğrulandı; ham kaynaklar ve önceki artifact'lar değişmedi. 35 mevcut ML testi,
2 yeni sentetik erişim sınırı testi ve pip check geçti. Notebook biçimi,
sözdizimi, kaynak hash'i, çıktı sayısı ve HTML üretmeme sınırı doğrulandı.

Bağımsız train hesabı: 14.492 beklenen slot/hane; 25 → 9 → 8 teknik aday
(yinelenen anahtar kapısından sonra da 8); 46.681 negatif slot. Duyarlılık,
hane bazında günlük kalite, eğitim desteği ve development destek bayrakları
P0/P1 ile eşleşti. 6139: 151 → 9 uygun gün; 7800: 151 → 46 uygun gün.
Birim/interval/air1 eşlemesi, negatiflerin ve donma şüphesinin anlamı ile ekip
cohort onayı açık kalır. Yeni model eğitimi ve gerçek test hedef erişimi yok.

Görsel incelemede NaN uçların otomatik zaman ölçeğinde gizlenmesi düzeltildi;
13 zaman serisi panelinin tam ızgara sınırları çalıştırılabilir assertion ile
kontrol edilir. Dönem etiketleri ayrı satırlara alınarak çakışma giderildi.
Son notebook tüm hücreleriyle yeniden çalıştırıldı ve PNG'ler görsel incelendi.
`ponytail-review`: Lean already. Ship. Küçük yardımcı yalnız I/O sınırını
uygular; cohort/kalite mantığı ortak pakette kaldı. Notebook kaynaklarında yeni
fit, tam audit veya HTML export çağrısı yok. Commit/push/PR yapılmadı.

Çıktı: `notebooks/01_data_understanding.ipynb`; grafik listesi/kurulum:
`notebooks/README.md`; yerel kanıt: `artifacts/notebook-data-understanding/verification.json`.

# Değerlendirme: yüksek öncelikli görevler — 26 Eylül 2026

Kapsam: 26 Eylül proje değerlendirmesindeki dört yüksek öncelikli görev.
Kullanıcı kararları: oturum başlangıcı `AGENTS.md`'ye yazılır (CLAUDE.md, Q-05
açık kalır); hane 661'in testi görmüş çıktısı repo dışına taşınır; §5 eski koda
"dokunulan fonksiyon" kuralıyla uygulanır; commit'ler `feat/ml-foundation`'a,
iki belge düzeltmesiyle birlikte yapılır. Push, notebook, `.obsidian/`, kod,
config ve eşik değişikliği yok.

- [x] 661 çıktısını `../artifacts-test-seen/baseline-661/` altına taşı; dosya hash'lerini önce ve sonra karşılaştır.
- [x] Yeni yeri `artifacts/README.md` ve `second_brain/ml/experiment-log.md`'ye yaz.
- [x] `AGENTS.md`: "Session Start" bölümü ve §5'e eski kod kuralı.
- [x] `README.md:40` ve `THIRD_PARTY_NOTICES.md:1,3`: skill yolunu `.claude/skills` yap.
- [x] `second_brain`: decisions, log ve home güncellemesi; bağlantı kontrolü.
- [x] Doğrulama: ML ve notebook testleri, bağlantı kontrolü, commit'e girecek içeriğin kontrolü.
- [x] Üç commit: skill taşıması; `second_brain`; `AGENTS.md` + todo + `artifacts/README.md`.

Doğrulama: 661'in iki dosyası taşındı; SHA-256 hash'leri taşımadan önce ve
sonra aynı, eski konum boş. 35 ML testi ve 2 notebook testi geçti (çıkış
kodları doğrudan yakalandı, ikisi de 0). 21 Markdown dosyasında kırık bağlantı
yok; `home.md` 76 satır. Taşıma commit'inde 320 dosya içerik değişmeden (R100)
taşındı. Dosyalar commit'lere tek tek eklendi; `notebooks/`, `.obsidian/` ve
`artifacts/` (README hariç) girmedi. Kod, config, eşik ve notebook değişmediği
için web typecheck çalıştırılmadı. Push yapılmadı.
