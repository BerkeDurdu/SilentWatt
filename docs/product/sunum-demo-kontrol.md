# Sunum öncesi demo kontrolü

Sunumdan yaklaşık 15 dakika önce, demoyu yapacak bilgisayarda:

1. **Ollama açık mı?** `ollama list` komutu `qwen2.5:7b` modelini göstermeli. Ollama güncelleme isterse
   güncellemeyi şimdi yapın; sunum sırasında kendini güncellerse kapanır.
2. **Temiz durum.** Önceki denemelerden kalan atama ve kapatmaları silmek için `.data/` klasörünü silin.
3. **Başlatın.** `npm run dev` komutunu çalıştırın. Terminalde sırasıyla `Assistant: qwen2.5:7b at …`
   ve yaklaşık bir dakika sonra `Assistant: 8 case summaries ready` satırları görünmeli. Bu satırlardan
   sonra vaka özetleri anında açılır.
4. **Giriş.** http://localhost:5173 adresini açın ve `operator@silentwatt.demo` ile girin; parola giriş
   sayfasındaki demo hesapları listesinde.

## Demo akışı (yaklaşık 4 dakika)

Ekranlar gerçek dedektör koşusunu gösterir: üst barda **Dedektör koşusu** yazar
([koşu raporu](../project-status/detector-run-2026-10-14.md)). Koşu yoksa örnek dosyalar açılır.

1. **Genel Bakış (yönetim hesabı).** Doğrulama senaryolarının 75'inden 62'si yakalandı. Değiştirilmemiş
   Temmuz verisinde 11 cihaz sapması çıktı; bunların etiketi yok, alarm bütçesine sayılırlar.
   Klima, buzdolabı ve güneş paneli ayrı aileler olarak izleniyor.
2. **Vaka Kuyruğu → klima vakası, Hane 7800 (+%51, 4–16 Temmuz).** Günlük grafikte referans çizgisini,
   işaretli günleri ve değerlendirilemeyen sıcak günleri gösterin. "Referans neye göre" satırı
   komşu düzeltmesini anlatır: herkesi birlikte yükselten sıcak gün vaka sayılmaz.
3. **Yapay zekâ asistanı paneli.** Özetteki "Kanıt denetiminden geçti" etiketini gösterin. Ardından iki
   soru sorun:
   - "Müşteri yeni klima aldığını söylerse ne yapmalıyım?" Asistan, vakanın bildirilen değişiklikle
     kapatılabileceğini ve dedektörün referansı yeniden öğreneceğini söyler.
   - "Bu sapma müşteriye ayda kaç TL'ye mal oluyor?" Asistan tutar uydurmaz.
4. **Bildirilen değişiklikle açıklama.** Buzdolabı vakasında (Hane 661, +%40) "Bildirilen değişiklikle
   açıkla" seçeneğini ve "Yeni cihaz takıldı" türünü seçin. Vaka kapanır ve değişiklik dedektöre aktarılır.
5. **Atama ve SMS.** Klima vakasını teknisyene atayın; teknisyen hesabıyla müşteriye giden SMS'i ve
   talep sayfasını gösterin.
6. **Güneş paneli.** Temmuz'da gözlenen üretim açığı yok, yalnız veri sorunları var. Üretim açığını
   doğrulama senaryosundan gösterin (`SW-SYN-SOL-0661`, −%35): yalnız okunur, gerçek vaka sayılmaz.

## Bir şey ters giderse

- **Model yanıt vermiyor.** Panelde "Dil modeline ulaşılamadı" yazar ve açıklamalar şablondan gelir.
  Demo bu durumda da sürer; Ollama'yı açıp sayfayı yenileyin.
- **Yanıt gelmiyor.** İlk soru, model belleğe yüklenirken yaklaşık 30 saniye sürebilir. Bu yüzden
  3. adımdaki iki satırın çıkmasını bekleyin.
- **Ekranda "Örnek kanıt dosyaları" yazıyor.** Dedektör koşusu bu bilgisayarda yok demektir. Veriler
  klasördeyken koşuyu yeniden alın (README, "Dedektör koşusu") ve sunucuyu yeniden başlatın.
- **Jüri "bu vakalar gerçek arıza mı?" diye sorarsa.** Hayır, bilinmiyor: veri setinde etiketli arıza yok.
  Yöntemin ölçüsü, cevabı bilinen doğrulama senaryolarıdır (62/75). Gözlenen vakalar inceleme önerisidir.
