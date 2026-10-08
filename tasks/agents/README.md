# Agent çalışma düzeni (8 Ekim 2026)

Yusuf'un 8 Ekim onayıyla uygulanan beş öneri. Ayrıntılı değerlendirme:
[teknik iş planı](../../docs/project-status/teknik-is-plani-2026-10-08.html).

1. **Agent tanımları** `.claude/agents/` altında:
   - `sw-implementer`: Data & AI işleri; Opus.
   - `sw-reviewer`: salt okunur inceleme; Opus 5.5, yüksek akıl yürütme düzeyi (`effort: high`).

   Kurallar, skill'ler ve rapor biçimi tanımda sabit; görev kartı yalnız işi, kapsamı, tabanı ve
   başarı ölçütünü anlatır.
2. **Başlangıç kontrolü:** `preflight.py`. Agent'ın ilk komutu. Ana çalışma klasöründe çalışmayı,
   kirli ağacı, taban commit'i içermeyen dalı, paketin yanlış yerden yüklenmesini, eksik veri yolunu
   ve dolu artifact dizinini reddeder. Dal tabanın gerisindeyse yalnız ileri sarar.
3. **Küçük işler ve devir dosyası:** Her iş en fazla 2–3 saat. Durum `tasks/agents/<iş>.md`
   dosyasında, `TEMPLATE.md` biçiminde; her adımda commit ile güncellenir. Kesintide yeni bir agent,
   eski worktree'de devir dosyasından devam eder; uzun transkript sürdürülmez.
4. **Birleştirme kapısı:** `merge_gate.py`. Her birleştirmeden önce ana oturum çalıştırır.
   - Kapsam kontrolü, geçici worktree'de deneme birleştirmesi, `git diff --check`, bütün testler,
     tip kontrolü ve build. Bunlardan biri başarısızsa birleştirme yapılmaz.
   - Yasak ifade ve etiketsiz PRD v1.1 sayısı taraması uyarı verir; uyarıları reviewer değerlendirir.
5. **Kullanım bütçesi:**
   - Aynı anda en fazla 2 agent çalışır.
   - Uygulayıcı Opus, reviewer Opus 5.5 high.
   - Sıra: uygulayıcı biter → kapı → reviewer → düzeltme → birleştirme.

Örnek kullanım:

```sh
# Agent, kendi worktree'sinde:
SILENTWATT_DATA_DIR=/…/SilentWatt/dataset python3 tasks/agents/preflight.py --base <commit> --artifacts-dir /…/Repository/artifacts/<yeni-dizin>

# Ana oturum, ana klasörde:
python3 tasks/agents/merge_gate.py --branch <agent dalı> --scope 'packages/ml/src/silentwatt_ml/detection/*' --scope 'docs/architecture/detector-mvp.md'
```

İlk deneme (8 Ekim): başlangıç kontrolü ana klasörde ve dolu artifact dizininde doğru biçimde durdu,
dedektör worktree'sinde geçti. Kapı, dedektör dalında 177 testi birleşik hâlde geçirdi ve PRD v1.1'den
alınmış yapı ayarlarını uyarı olarak listeledi.
