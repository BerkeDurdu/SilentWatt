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

# Veri anlamı kanıtları ve kapsam önerisi — 27 Eylül 2026

Kapsam: kullanıcının onayladığı ilk üç adım. (1) Metadata dosyasını kaynakların
yanına taşımak; (2) 27 Eylül bulgularını `second_brain`'e işlemek ve üç tek
seferlik sorguyu okunabilir betikler olarak repoya almak; (3) ekip için bir
sayfalık kapsam önerisi (PRD v1.2 taslağı). Kod paketi, config, eşik, PRD,
tarihli raporlar ve kök dosyalar değişmez; commit/push yok. Test dönemi
(Ağustos–Aralık) hiçbir kanal için okunmaz.

- [x] Metadata'yı `../dataset/` altına taşı; SHA-256'yı önce ve sonra karşılaştır; `data/README.md`'ye yaz.
- [x] Üç sorguyu `docs/product/ekler/` altına AGENTS.md §5'e uygun betikler olarak yaz
      (sohbette elle yapılan metadata kontrolü için dördüncü betik eklendi).
- [x] Betikleri yeni `artifacts/data-review-2026-09-27/` dizinine çalıştır; ilk sonuçlarla karşılaştır.
- [x] `second_brain`: iki veri notu, `decisions.md`, koşu kaydı, sözlük, veri ve ürün haritası.
- [x] Kapsam önerisi karar notu: `second_brain/product/scope-broadening-proposal.md`.
- [x] Kapanış: `home.md`, `log.md`, bağlantı kontrolü, `git status`, ML testleri.

Doğrulama: Metadata dosyasının SHA-256'sı (`2f476b84…`) taşımadan önce ve sonra
aynı; eski konum boş, dosya artık `git status`'ta görünmüyor. Dört betik
derlendi (çıkış kodu 0) ve yeni artifact dizinine çalıştı. Dört JSON da geçerli.
Kaynak hash'leri P0 kayıtlarıyla aynı (`00f38f62…`, `eed0695c…`). Repo betikleri
ilk geçici sonuçları tekrarladı: GES oranı medyan 0,750; hizalama A'da 1.768.207
aralığın %100'ü tolerans içinde; izlenen pay medyan 0,720; bayrak uyumu
1.842/1.875. Bilinçli iki payda düzeltmesi notta yazılı. 35 ML testi geçti
(çıkış kodu doğrudan yakalandı: 0). 17 `second_brain` dosyasında kırık bağlantı
yok, `home.md` 80 satır, `git diff --check` temiz. Paket kodu, config, eşik, PRD,
tarihli raporlar ve kök dosyalar değişmedi; test dönemi hiçbir kanal için
okunmadı. Commit/push yapılmadı.

# Ölü bant (D-04) ve 21 hane — 6 Ekim 2026

Dal: `feat/mvp`. Kullanıcı kararı (6 Ekim): `air1` için ±0,01 simetrik ölü bant; 21 haneyle
devam. Kullanıcı talimatı: takvim gerekçesiyle hiçbir kural atlanmaz; AGENTS.md §5 her değişen
fonksiyona tam uygulanır. Test dönemi kapalı kalır.

- [x] Kanıt: `review_dead_band_cohort.py` (yalnız train) — `b6e49b6`.
- [x] Değişecek her fonksiyon önce davranışı koruyarak okunur hâle getirildi — `dd15f91`.
- [x] Önce testler, sonra ölü bant: config `target_dead_band`, protokol `p1-v2`, etiketler,
      günlük `dead_band_slots`, P0 betiğinin sıfır olmayan bandı reddetmesi — `89a4c67`.
- [x] Bulunan eski sızıntı: `baseline` development koşusu test satırlarını okuyordu;
      okunabilirlik commit'i ve testi önce yazılmış düzeltme — `52019c2`, `d7ae6ed`.
- [x] Geçici hesaplanan metrikler pakete testleriyle: üst/alt sınır aşımı, çalışırken kapsama;
      önce davranışı koruyan düzenleme — `3ee229f`, `f660801`.
- [x] Belgeler: P1 protokolüne p1-v2 bölümü, paket README'si, tarihli rapor ve tablo betiği
      (`p1_report_tables.py`) — `2033da4`. Notebook README'si (notebook P0 koduna bağlı).
- [x] `second_brain`: kararlar, koşu kaydı, sözlük, veri ve ML haritası, notlar, günlük, durum.

## Doğrulama / inceleme

55 ML testi ve notebook testleri geçiyor (çıkış kodu 0). Yeni testler koddan önce yazıldı ve
değişiklikten önce başarısız oldu (ölü bant: 12, metrikler: 7, sızıntı: 1). Okunabilirlik
commit'lerinin her birinden önce ve sonra gerçek veriyle audit JSON'u, P0 diagnostikleri,
hane 661 baseline'ı ve P1 çıktıları aynı; P1 17 Eylül run03 ile bayt bayt aynı. Ölü bant 0
ile son kod run03'ü birebir veriyor. Ölü bant 0,01 ile paket audit'i kanıt betiğinin bağımsız
uygulamasıyla 25 hanede slot slot aynı: 21 aday. Yeni metrikler geçici hesabı birebir
tekrarladı (B0 üst aşım %12,78, çalışırken kapsama %80,77). `git diff --check` temiz;
bağlantı kontrolü temiz. Push yapılmadı. İlk deneme `wip/dead-band-first-pass` dalında
(`dbf65bb`) arşivli; silinmesi kullanıcı kararı.

# MVP (9 Ekim 2026) — uçtan uca HVAC dikey dilimi

Dal: `feat/mvp`. Kararlar (5–6 Ekim): yalnız HVAC (`air1`), 21 hane, Temmuz yeniden oynatma ve
sentetik vakalar (test ayları yok); açıklama önce şablon; push yok. 6 Ekim: konsol ve API bizim
agent'larımızca yazılmaz (görev alanımız Data & AI; ekranlar Berke, API Muharrem). PRD v1.1'in
dedektör eşikleri ve sentetik ızgarası doğru kabul edilmez: yöntem iskeleti alınır, değerler
veriden türetilir (Haziran'da eşik, Temmuz'da değerlendirme, PRD v1.1 değerleri yan yana raporlanır).

- [x] Faz 0: kanıt sözleşmesi v0.1 (`docs/architecture/evidence-contract.md`, `shared/evidence.ts`),
      tamamen sentetik örnek dosyalar ve üreticisi, açıklama arayüzü (`server/explain/index.ts`).
- [ ] Devir: Berke (konsol) ve Muharrem (API) kanıt dosyalarını okuyacak; kanıt sözleşmesi v0.1,
      `shared/evidence.ts` ve `server/explain/index.ts` taslağı Muharrem'in incelemesine (Q-04).
      Web agent'ı 6 Ekim'de durduruldu, commit yoktu.
- [ ] Açıklama katmanının sahibi (Q-15, B+C): içerik bizde, sunucu kodu kimde? Açıklama agent'ı
      6 Ekim'de oturum kapanırken durduruldu, commit yoktu.
- [x] ML çekirdeği (`09d5e98`): günlük istatistikler, akut ve kronik kurallar, veri sorunu kuralı,
      sentetik enjeksiyon, kanıt yazıcı ve doğrulayıcı (25 test).
- [ ] ML hattı: `detection/pipeline.py`, ayrı dedektör config'i (ana config hash'i değişmesin),
      kaynaklı sentetik plan (`configs/ml/synthetic-mvp.json`), `detect` komutu. Önce yazılan test
      `tasks/paused/test_detection_pipeline.py`'de; ayarları ana config'te varsayıyor, ayrı
      config'e göre güncellenecek.
- [ ] Eşik karşılaştırması (PRD v1.1 başlangıç değerleri, Haziran tabanlı, tarama): enjeksiyonsuz
      Temmuz'daki vaka sayısı ile sentetik yakalama oranı birlikte; alarm bütçesi kararı (Yusuf).
- [ ] PRD v2.0 (sayılar `p1_report_tables.py` ve dedektör değerlendirmesinden).
- [ ] Birleştirme, denetçi agent'ı (test dönemi, yasak ifade, eşik, testler), demo senaryosu, prova.
- [ ] 30 Ekim'e: derin öğrenme, buzdolabı, kör test, 2361/3039 donma incelemesi (Q-01). EDA notebook
      `02` öne alındı (aşağıdaki bölüm); Q-03'ün zamanı EDA sonrası kararda.

# EDA notebook 02 — 21 hane (6–7 Ekim 2026)

Kullanıcı kararı (6 Ekim): dedektörün gerçek veride çalıştırılması ve eşik seçimi, 21 hanenin
analizinden sonra. Notebook `notebooks/02_cohort_eda_21.ipynb`; P0 final audit ve P1 run04'e
kilitli (run04 = run03 içeriği, güncel paket hash'i). Ham hedefler yalnız train; Haziran/Temmuz için
yalnız P1 özetleri (günlük kalite, rapor metrikleri); test kapalı.

- [x] A. Kimlik kilidi: kaynak, config, paket ve artifact hash'leri.
- [x] B. Veri kalitesi: hane × ay uygun gün, ölü bant, bant altı negatif, donma, destek dışı.
- [x] C. Tüketim davranışı (train): günlük toplam, çalışma payı, çalışırken seviye, saatlik profil,
      hafta içi/sonu, soğukta çalışma (ısı pompası).
- [x] D. Sıcaklık tepkisi: hane bazında eğri, soğutma başlangıç sıcaklığı.
- [x] E. Train'de olağandışı günler ve aylık kayma.
- [x] F. Sıcaklık desteği ve Temmuz sıcak dalgası.
- [x] G. Model tanısı (p1-v2 metrikleri): hane bazında aşım, Haziran → Temmuz kayması.
- [x] H. Dedektör için çıkarımlar ve açık sorular; doğrulama özeti.
- [x] Kayıtlar: `notebooks/README.md` (02 bölümü), `second_brain` (koşu kaydı: run04 ve EDA;
      günlük; kararlar: Q-03, A-04, Q-01, D-03 güncellendi, Q-15–Q-17 eklendi). Notebook dosyaları
      ve üretici betik (`notebooks/build_02_cohort_eda_21.py`) Q-09 kararına kadar commit edilmez.
- [ ] Model tarafı kararlar (Yusuf/ekip), dedektörün gerçek veri koşusundan önce: üst sınırın ayrı
      kalibrasyonu (Q-03), eğitimin Haziran'ı kapsaması (A-04), hafta günü özelliği (Q-16),
      olağandışı train günleri (Q-17).

## Doğrulama / inceleme

Notebook nbclient ile baştan sona hatasız çalıştı (33 hücre). 20/20 kontrol UYUMLU
(`artifacts/notebook-eda-21/verification.json`): kaynak, config, paket ve artifact hash'leri;
aday listesi audit = P1 raporu; ölü bant 0,01; ayrıştırılan ham satırlar yalnız train
(2018-01-01 06:00Z – 2018-06-01 04:45Z); ölü bant slotları (102.906) ve bant altı negatifler (183)
ham okumada ve P1 günlük kalitede aynı; işlem sonrası kaynaklar ve artifact'lar değişmedi. 11 grafiğin
hepsi gözle incelendi. Yeni model eğitilmedi, eşik seçilmedi, test hedefleri okunmadı. Sınırlama:
E bölümündeki olağandışı gün taraması betimleyicidir; ölçek hanenin bütün sıcaklık kutularından ortak
hesaplandığı için ılık günlerde genelde hiç çalışmayan hanelerde (ör. 9019, 9 gün) her kullanım
"olağandışı yüksek" görünebilir.
