---
type: note
area: data
status: aktif
related: [D-04, A-05, C-02, DQ-06, Q-01]
updated: 2026-09-22
---

# Negatif air1 değerleri ve sensörün sıfır seviyesi

## Soru

Train dönemindeki 46.681 negatif `air1` slotu gürültü mü, geçersiz kayıt mı? Negatifleri
geçersiz sayan mevcut kural cohort'u nasıl etkiliyor?

## Yöntem

- 2026-09-22 tarihli, tek seferlik bir sorgu; notebook'ta yer almıyor.
- Kapsam: 15 dakikalık dosya, `air1`, 25 hane, yalnız train penceresi
  `[2018-01-01T06:00Z, 2018-06-01T05:00Z)`.
- Komşu analizi: hane içinde zamana göre sıralı önceki/sonraki mevcut satır kullanıldı.
- **Test erişimi:** Sorgu dosyayı bütün olarak okudu ve test satırlarını hiçbir hesaba
  girmeden ayırdı. Bu, P1 standardıdır. Notebook'un daha sıkı "test hedefini hiç
  ayrıştırma" standardı uygulanmadı. Analiz notebook'a taşınırsa
  [_support.py](../../notebooks/_support.py) okuyucuları kullanılmalı.

## Kanıt

**Ölçüm hassasiyeti ve büyüklük**
- Ölçülen en küçük fark 0,001 kaynak birimi. Negatiflerin medyanı −0,001, yani sıfırın
  bir adım altı.
- Negatiflerin %54,06'sı tam −0,001; %77,23'ü ≥ −0,002; **%95,35'i ≥ −0,005**;
  %99,59'u ≥ −0,01. En düşük değer −0,038 (hane 3538).

**Sıfır çevresinin dağılımı** (slot sayısı)

| −0,003 | −0,002 | −0,001 | 0 | +0,001 | +0,002 | +0,003 |
|---:|---:|---:|---:|---:|---:|---:|
| 5.331 | 10.815 | 25.235 | 142.766 | 37.374 | 17.358 | 8.485 |

**Bağlam**
- Negatiflerin %92,54'ünde önceki ve sonraki slot ±0,01 içinde: klima kapalı görünüyor.
- Yalnız %5,01'i çalışan bir slotun (> 0,5) yanında; bunlar açılma/kapanma geçişleri olabilir.
- Negatif oranı en yüksek kışın: Ocak %16,4, Şubat %15,1, Mart %12,9, Nisan %12,9, Mayıs %7,3.

**Hanelerin "sıfır" okuması farklı**

| Hane | Negatif | Tam sıfır | (0, 0,005] | Cohort durumu |
|---|---:|---:|---:|---|
| 5746 | 11.171 | 1.116 | 5 | dışlandı (kapsam + `airwindowunit1`) |
| 4767 | 9.776 | 2.324 | 162 | dışlandı (kapsam) |
| 7536 | 0 | 12.055 | 52 | aday |
| 6139 | 0 | 0 | 12.858 | aday |
| 1642 | 0 | 137 | 11.761 | aday |

## Yorum (doğrulanmadı)

- En olası açıklama sensörün sıfır noktasındaki kayma ve 0,001 çözünürlükte yuvarlama.
  Aynı "klima kapalı" durumu bir hanede −0,001, başka birinde 0, bir diğerinde +0,004
  olarak kaydediliyor.
- Mevcut kural bu hatayı tek yönlü cezalandırıyor:
  - Sensörü sıfırın altına kaymış hanelerin kapalı dönemleri geçersiz sayılıyor
    (5746 ve 4767 kapsamdan eleniyor).
  - Sensörü sıfırın üstüne kaymış haneler (6139, 1642) sorunsuz geçiyor.

  Yani cohort seçimini sensörün sıfır ayarı etkiliyor.
- 6139'daki donma şüphesi büyük ihtimalle aynı pozitif kaymanın sonucu: ilk işaretlenen
  slotun değeri 0,004 ([notebook](../../notebooks/01_data_understanding.ipynb), bölüm F)
  → Q-01.
- Birim bilinmiyor. kW ise −0,005 yaklaşık 5 W; 15 dakikalık kWh ise ortalama yaklaşık 20 W.
  Karşılaştırma için train değerlerinin 95. yüzdeliği 1,90, 99. yüzdeliği 3,06
  (notebook, bölüm C).

## Açık kalan

- Sağlayıcı belgesi yok: sıfır ofseti, çözünürlük, işaret yönü, geçersiz kayıt kodları
  (P0'daki D-04 soruları).
- −0,005'in altındaki %4,65'lik kuyruk ve geçiş anlarındaki negatifler aynı kurala girmemeli.
- Küçük negatifler gürültüyse aynı büyüklükteki küçük pozitifler de gürültüdür. Yalnız
  negatifleri kurtarmak asimetriyi başka bir biçimde sürdürür.

## Öneri taslağı (kural değil)

Simetrik ölü bant (deadband):
- Mutlak değeri ε'dan küçük veya eşit okumalar "kapalı" kabul edilir: 0'a eşitlenir ya da
  ayrı bir durumla işaretlenir.
- ε'un altındaki negatifler (`air1 < −ε`) geçersiz kalır.
- ε, hane bazında gürültü tabanından türetilir; dağılım 0,005 civarını gösteriyor.
- Donma kuralı ölü bant içindeki değerlere uygulanmaz; sıfırlar zaten muaf.

PRD'deki DQ-06 kuralı ("kanal bazında eşik ve gerekçeyle şüpheli işaretle; hamı koru",
[PRD §5.2](../../docs/product/SilentWatt-Teknik-PRD-v1.1.md)) bu yaklaşımla uyumlu.

Uygulamak için gerekenler: D-04 kararı, sürümlü bir dönüşüm ve cohort, günlük kalite ve P1
hesaplarının yeniden yapılması. Etkinin büyüklüğü için P0 duyarlılığına bakılabilir
(yalnız sayım olarak): ε = 0,001 → 12 aday, ε = 0,005 → 20 aday
([P0 §4](../../docs/project-status/p0-data-decisions-2026-09-17.md)).

## Sonraki adım

- Ekip için D-04 karar önerisi (Muharrem / B+C); [karar şablonu](../templates/decision.md).
- Analizi notebook'a gözlem olarak eklemek (katı erişim kuralıyla).

## Kaynaklar

- [P0 karar kaydı](../../docs/project-status/p0-data-decisions-2026-09-17.md): §2–§6 (D-04, C-02, duyarlılık)
- [PRD](../../docs/product/SilentWatt-Teknik-PRD-v1.1.md): §5.1–5.2 (DQ-06, DQ-07)
- [Veri anlama notebook'u](../../notebooks/01_data_understanding.ipynb): bölüm C, E, F
- [P1 raporu](../../docs/project-status/p1-ml-results-2026-09-17.md): donma kapısının etkisi
