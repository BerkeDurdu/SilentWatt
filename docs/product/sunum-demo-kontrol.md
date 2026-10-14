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

1. **Genel Bakış.** Doğrulama senaryolarından 5'in 5'i yakalandı. Klima, buzdolabı ve güneş paneli ayrı
   aileler olarak izleniyor.
2. **Vaka Kuyruğu → klima vakası (Hane 90003, +%18).** Günlük grafikte referans çizgisini, işaretli
   günleri ve değerlendirilmeyen günleri gösterin.
3. **Yapay zekâ asistanı paneli.** Özetteki "Kanıt denetiminden geçti" etiketini gösterin. Ardından iki
   soru sorun:
   - "Müşteri yeni klima aldığını söylerse ne yapmalıyım?" Asistan, vakanın bildirilen değişiklikle
     kapatılabileceğini ve dedektörün referansı yeniden öğreneceğini söyler.
   - "Bu sapma müşteriye ayda kaç TL'ye mal oluyor?" Asistan tutar uydurmaz.
4. **Bildirilen değişiklikle açıklama.** Buzdolabı vakasında "Bildirilen değişiklikle açıkla" seçeneğini
   ve "Yeni cihaz takıldı" türünü seçin. Vaka kapanır ve değişiklik dedektöre aktarılır.
5. **Güneş paneli vakası.** Bu vakada sapma tüketim fazlası değil, üretim açığıdır. Teknisyene atayın ve
   müşteriye giden SMS ile talep sayfasını gösterin.

## Bir şey ters giderse

- **Model yanıt vermiyor.** Panelde "Dil modeline ulaşılamadı" yazar ve açıklamalar şablondan gelir.
  Demo bu durumda da sürer; Ollama'yı açıp sayfayı yenileyin.
- **Yanıt gelmiyor.** İlk soru, model belleğe yüklenirken yaklaşık 30 saniye sürebilir. Bu yüzden
  3. adımdaki iki satırın çıkmasını bekleyin.
- **Ekranlardaki sayılar.** Örnek kanıt dosyalarından gelir ve ekranda bu uyarı yazar. Gerçek buzdolabı
  ve güneş paneli sonuçları ML koşusundan gelecek.
