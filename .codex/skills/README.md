# Codex skills (kullanılmayan kopyalar)

2026-09-23: Projenin kullandığı dokuz skill [`.claude/skills/`](../../.claude/skills/README.md)
klasörüne taşındı. Burada yalnız `ponytail` ailesinin sabitlenmiş kopyaları kaldı
(`ponytail`, `ponytail-review`, `ponytail-audit`, `ponytail-debt`, `ponytail-gain`,
`ponytail-help`).

**Bu skill'ler kullanılmıyor.** En kısa kodu hedefliyorlar; projede öncelik, kodun proje
sahibi tarafından takip edilip sunumda anlatılabilmesi. Kod yazım ilkeleri
[`AGENTS.md`](../../AGENTS.md) §5'tedir. Kopyalar, kaynak kaydı ve olası bir geri dönüş
için duruyor.

Aktif skill listesi, projeye özel kısıtlar ve güncelleme yordamı:
[`.claude/skills/README.md`](../../.claude/skills/README.md).
Kaynak, sabit commit ve lisanslar: [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md).

## Vendor edilmeyen paket

`mksglu/context-mode` bağımsız bir skill değil; MCP sunucusu ve Codex hook'larından oluşuyor.
`ctx_*` MCP araçlarının kurulu olmasını varsaydığı için yalnız `SKILL.md`'sini kopyalamak
var olmayan araçlar için talimat üretirdi. Bu nedenle bilerek alınmadı; hiçbir hook, MCP
manifesti veya kurulum komutu bu projeye eklenmedi.
