# Huawei Cloud'a taşıma

Kupon tanımlanınca konsolu tek bir sunucuya (ECS) taşımak için adımlar. Kurulum PRD §6.1'deki
yaklaşımdır: bir Linux VM üzerinde Docker Compose ile konsol, PostgreSQL ve HTTPS vekili. Kanıt
dosyaları ve veritabanı yedekleri OBS'te, konsol imajı SWR'de durur. Yerelde uçtan uca denendi
(Caddy üzerinden erişim, `Secure` çerez, PostgreSQL'e kayıt, yeniden başlatma, yedek ve geri
yükleme); Huawei Cloud üzerinde henüz çalıştırılmadı.

| Bileşen | Huawei Cloud servisi | Dosya |
|---|---|---|
| Sunucu | ECS (Ubuntu 22.04, 2 vCPU / 4 GB) + EIP | `terraform/main.tf`, `terraform/cloud-init.yaml` |
| Ağ | VPC, alt ağ, güvenlik grubu (80/443 herkese, 22 yalnız yönetici IP'sine) | `terraform/main.tf` |
| Konsol ve API | Docker imajı, SWR'de | `Dockerfile`, `deploy/scripts/push-image.sh` |
| Veritabanı | Sunucuda PostgreSQL 16 (varsayılan) veya RDS for PostgreSQL | `deploy/compose.cloud.yml`, `managed_database` |
| HTTPS | Caddy, sertifikayı kendisi alır ve yeniler | `deploy/Caddyfile` |
| Kanıt dosyaları | OBS `evidence/<run-id>/` | `deploy/scripts/sync-evidence.sh` |
| Yedekler | Her gece `pg_dump` → OBS `backups/` (30 gün) | `deploy/scripts/backup-db.sh`, `restore-db.sh` |
| Günlükler | Konteyner stdout'unda istek başına JSON satırı; LTS'e ICAgent ile alınabilir | `server/app.ts` |

## Gerekenler

- Kupon tanımlı Huawei Cloud hesabı ve bir IAM kullanıcısının erişim anahtarı (AK/SK)
- Bilgisayarda Terraform 1.5+, Docker ve bir SSH anahtarı
- İsteğe bağlı: konsol için bir alan adı (HTTPS sertifikası için gerekir)

Fiyatlar bölgeye göre değişir; uygulamadan önce Huawei Cloud fiyat hesaplayıcısında ECS, EIP
(trafik bazlı), OBS ve varsa RDS kalemlerini kuponla karşılaştırın. RDS en pahalı kalemdir, bu yüzden
varsayılan kapalıdır.

## 1. Altyapıyı kur

```bash
cd deploy/huawei/terraform
cp silentwatt.tfvars.example silentwatt.tfvars     # bölge, yönetici IP'si, bucket adı
export HW_ACCESS_KEY=...  HW_SECRET_KEY=...
terraform init
terraform plan -var-file=silentwatt.tfvars
terraform apply -var-file=silentwatt.tfvars
```

Çıktıda `public_ip`, `obs_bucket` ve `swr_registry` yazar. Alan adı varsa DNS'te bir A kaydını
`public_ip` adresine yönlendirin. `s6.large.2` veya `5_bgp` bölgede yoksa `plan` hata verir;
konsoldan bölgede olan karşılığını seçip `silentwatt.tfvars` içine yazın.

## 2. İmajı SWR'ye gönder

SWR konsolunda "Generate Login Command" ile verilen `docker login` komutunu çalıştırın, sonra:

```bash
SWR_REGION=tr-west-1 SWR_ORG=silentwatt deploy/scripts/push-image.sh
```

Bu adım isteğe bağlıdır: imaj sunucuda `docker compose build` ile de derlenebilir.

## 3. Hesapları hazırla

Gerçek kullanıcılar için (parola standart girdiden okunur, komut satırına yazılmaz):

```bash
npm run hash-password -- u-ayse operator ayse@kurum.com.tr "Ayşe Yılmaz" < parola.txt
```

Kayıtları bir JSON dizisine koyup `users.json` olarak kaydedin. Bu dosya Git'e girmez.

## 4. Sunucuyu hazırla

```bash
ssh root@<public_ip>
cloud-init status --wait                    # Docker ve obsutil kurulumu bitsin
cd /srv/silentwatt/app                       # depoyu buraya kopyalayın veya klonlayın
cp deploy/.env.example deploy/.env           # SILENTWATT_SITE, POSTGRES_PASSWORD, OBS_BUCKET, SILENTWATT_IMAGE
scp users.json root@<public_ip>:/srv/silentwatt/app/deploy/users.json   # bilgisayardan
obsutil config -i=<AK> -k=<SK> -e=obs.<bölge>.myhuaweicloud.com
```

OBS için yalnızca bu bucket'a yazma izni olan ayrı bir IAM kullanıcısı kullanın.

## 5. Başlat

```bash
cd /srv/silentwatt/app/deploy
docker compose -f compose.cloud.yml --profile localdb up -d
curl -s https://<alan-adı>/api/health
```

- Dedektör çıktısı henüz yoksa `.env` içinde `SILENTWATT_EVIDENCE_DIR=/app/shared/fixtures/evidence`
  satırını açın; konsol örnek kanıt dosyalarıyla açılır.
- Alan adı yoksa ilk kontrol için `SILENTWATT_SITE=:80` kullanılabilir. Bu durumda tarayıcı `Secure`
  çerezi saklamaz ve giriş yapılamaz; internete açık kalıcı kullanım için alan adı ve HTTPS gerekir.
- RDS kullanılıyorsa `--profile localdb` yazılmaz, `.env` içine `SILENTWATT_DATABASE_URL` eklenir.

## 6. Dedektör çıktısını yayınla

ML koşusu bittiğinde (Yusuf):

```bash
obsutil sync artifacts/evidence/<run-id>/ obs://<bucket>/evidence/<run-id>/
```

Sunucuda:

```bash
/srv/silentwatt/app/deploy/scripts/sync-evidence.sh <run-id>
```

Betik koşuyu indirir ve konsolu yeniden başlatır. Konsol sözleşmeye uymayan bir koşuyla (yanlış şema,
pencere dışı tarih) açılmaz; bu durumda betik önceki kanıta geri döner.

## 7. Yedekler

`cloud-init` her gece 03:15'te `backup-db.sh` çalıştıracak cron kaydını kurar: yerelde 14 gün,
OBS'te 30 gün saklanır. Geri yükleme:

```bash
deploy/scripts/restore-db.sh obs://<bucket>/backups/silentwatt-<tarih>.sql.gz
```

## Kapatma

Kupon bitince veya demo sonrası `terraform destroy -var-file=silentwatt.tfvars` tüm kaynakları siler.
Önce OBS'teki yedekleri indirin: bucket boş değilse silme işlemi durur.
