# Doğrulama dersleri

- Bir komutun çıktısındaki satır sayısı test/dosya sayısı değildir. PASS/FAIL
  kayıtlarını ayrı say; exit kodunu sonraki shell komutuyla maskeleme.
  Toplu kontrolün başarısını `check=True` veya açık exit-code yakalama ile doğrula.
- Katalog/galeri ile yayımlanacak diyagramın doğrulama sözleşmesi farklıdır.
  Kapsam istisnasını açık gerekçelendir; başarısız ham sonucu PASS diye sunma.

# Süreç dersleri

- Bir işi agent'a vermeden veya seçenek önermeden önce rol sınırını kontrol et (PRD §3.2,
  `docs/architecture/ml-pipeline.md`). Yusuf'un alanı C, yani Data & AI. Ekranlar A'nın, API ve
  API sözleşmesi B'nin işidir; C'nin teslimi kanıt dosyaları, Python modülü/CLI ve kanıt
  alanlarının anlamıdır. Öneri bu sınırı aşıyorsa önermeden önce söyle (6 Ekim 2026: konsol ve
  API için başlatılan agent'lar durduruldu).
- Agent aracının worktree'si o anki daldan değil varsayılan daldan (`main`) açılabiliyor. Agent'ın
  ilk adımı başlangıç commit'ini doğrulamak ve gerekirse kendi dalını `git merge --ff-only <taban>`
  ile ilerletmek olmalı (7 Ekim 2026: üç agent da `main`'den başladı).
- Paralel agent'lar oturum kullanım limitini hızla tüketir (7 Ekim: üç agent ve reviewer yaklaşık
  bir saatte). Aynı anda en fazla iki agent; her adımdan sonra commit, böylece limit kesintisinde
  iş kaybolmaz.
