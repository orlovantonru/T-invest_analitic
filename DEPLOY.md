# Деплой на VPS — подробная инструкция

Публичный HTTPS-домен, статика SPA открыта, **весь `/api/*` за логином** (сессионная
cookie). Всё в Docker Compose: контейнер `web` (Node: статика + `/api` + `/auth`) за
контейнером `caddy` (TLS Let's Encrypt + reverse-proxy).

```
                 :443 TLS (Let's Encrypt, авто)
  браузер ─────────▶ caddy ─────────▶ web:8787 (Node)
                    reverse_proxy      ├─ GET /            → dist/  (SPA, открыто)
                                       ├─ GET /healthz     → {"ok":true} (открыто)
                                       ├─ POST /auth/login → Set-Cookie sid
                                       ├─ GET  /auth/me    → 200 | 401
                                       └─ GET  /api/*      → 401 без валидной sid
                                            │ Bearer TINVEST_TOKEN (только чтение)
                                            └─▶ invest-public-api.tbank.ru
```

---

## Содержание

1. [Что понадобится](#1-что-понадобится)
2. [Шаг 0. Отозвать текущий токен, выпустить новый](#шаг-0-отозвать-текущий-токен-выпустить-новый)
3. [Шаг 1. DNS](#шаг-1-dns)
4. [Шаг 2. Первичная настройка VPS](#шаг-2-первичная-настройка-vps)
5. [Шаг 3. Docker и Compose](#шаг-3-docker-и-compose)
6. [Шаг 4. Код на сервер](#шаг-4-код-на-сервер)
7. [Шаг 5. Секреты — `.env.production`](#шаг-5-секреты--envproduction)
8. [Шаг 6. (домен из `APP_DOMAIN`)](#шаг-6-пропущен--домен-берётся-из-app_domain)
9. [Шаг 7. Сборка и запуск](#шаг-7-сборка-и-запуск)
10. [Шаг 8. Проверка](#шаг-8-проверка)
11. [Обновление](#обновление)
12. [Откат](#откат)
13. [Эксплуатация](#эксплуатация)
14. [Управление доступом](#управление-доступом)
15. [Диагностика проблем](#диагностика-проблем)
16. [Опционально](#опционально)
17. [Чеклист](#чеклист)

---

## 1. Что понадобится

| | |
|---|---|
| **VPS** | Ubuntu 22.04 / 24.04 LTS. Минимум 1 vCPU / 1 ГБ RAM / 10 ГБ диск. Сборка образа съедает ~1 ГБ RAM — при 1 ГБ добавьте swap (см. [Опционально](#опционально)). |
| **Домен** | Например `portfolio.example.com`. Нужен доступ к DNS-записям. |
| **Токен T-Invest** | **Новый, только для чтения** (см. Шаг 0). |
| **Локально** | SSH-клиент; `git`; по желанию Node ≥ 20 (для генерации хеша пароля — иначе сделаем через Docker). |

Все команды на сервере — от пользователя `deploy` (создаётся в Шаге 2), кроме
явно помеченных `# root`.

---

## Шаг 0. Отозвать текущий токен, выпустить новый

Токен мог засветиться в переписке / отслеживаемых файлах.

1. T-Bank (приложение или [t-bank.ru/invest](https://www.tbank.ru/invest/)) → **Инвестиции → Настройки → «Токены Т-Invest API»**.
2. Удалить старый токен.
3. Создать новый, доступ — **«Только чтение»**. Скопировать (показывается один раз).
4. Держать в буфере до Шага 5. Никуда не коммитить.

Проверить, что токен рабочий и read-only (с любой машины):

```bash
TOKEN='вставьте_токен'
curl -s -X POST https://invest-public-api.tbank.ru/rest/tinkoff.public.invest.api.contract.v1.UsersService/GetAccounts \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}'
```

Ответ должен содержать `"accessLevel": "ACCOUNT_ACCESS_LEVEL_READ_ONLY"`.

---

## Шаг 1. DNS

У регистратора / DNS-провайдера добавить **A-запись**:

| Тип | Имя | Значение | TTL |
|---|---|---|---|
| A | `portfolio` (или `@` для корня) | `<IPv4 вашего VPS>` | 300 |

Если у VPS есть IPv6 — добавьте и **AAAA** на тот же адрес (иначе уберите IPv6 у
сервера, чтобы Let's Encrypt не пытался проверять недоступный адрес).

Дождаться распространения (с локальной машины):

```bash
dig +short portfolio.example.com        # должен вернуть IP вашего VPS
```

Не переходить к Шагу 7, пока `dig` не отдаёт правильный IP — иначе выпуск
сертификата не пройдёт.

---

## Шаг 2. Первичная настройка VPS

Подключиться по SSH как `root` (или как даёт провайдер).

### 2.1 Обновления и базовые пакеты

```bash
# root
apt update && apt upgrade -y
apt install -y ca-certificates curl git ufw fail2ban unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades   # авто-обновления безопасности
```

Заметки по выводу:
- Строки `SyntaxWarning: invalid escape sequence` из `fail2ban/tests/...` —
  безвредные предупреждения Python 3.12, игнорировать.
- `needrestart` может показать `Pending kernel upgrade!` и список отложенных
  перезапусков сервисов — значит `apt upgrade` поставил новое ядро. Сейчас
  удобнее всего перезагрузиться:
  ```bash
  reboot
  ```
  Переподключиться и проверить: `uname -r` (новая версия), `systemctl is-active fail2ban`.

### 2.2 Пользователь `deploy`

```bash
# root
adduser --gecos "" --disabled-password deploy
usermod -aG sudo deploy

# перенести свой SSH-ключ пользователю deploy
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/    # если логинились по ключу под root
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
```

Если своего ключа ещё нет — на **локальной** машине:

```bash
ssh-keygen -t ed25519 -C "deploy@portfolio"
# затем вставить содержимое ~/.ssh/id_ed25519.pub в /home/deploy/.ssh/authorized_keys на сервере
```

Проверить вход: `ssh deploy@<IP_VPS>` — должно пускать без пароля.

### 2.3 Ужесточение SSH

```bash
# root
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh
```

⚠️ Перед выходом из root-сессии откройте **новое** окно и убедитесь, что
`ssh deploy@<IP>` работает — иначе можно потерять доступ.

### 2.4 Firewall

```bash
# root
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status
```

### 2.5 fail2ban

Работает «из коробки» для SSH после установки. Проверить:

```bash
systemctl status fail2ban --no-pager
fail2ban-client status sshd
```

---

## Шаг 3. Docker и Compose

```bash
# от deploy (sudo внутри)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy
```

**Перелогиниться** (`exit`, снова `ssh deploy@...`), чтобы применилась группа `docker`.

Проверить:

```bash
docker version
docker compose version          # v2, идёт плагином
docker run --rm hello-world
```

---

## Шаг 4. Код на сервер

Репозиторий публичный — просто клонируем:

```bash
cd ~
git clone https://github.com/orlovantonru/T-invest_analitic.git mobinvest/app
cd mobinvest/app
ls Dockerfile docker-compose.yml Caddyfile .env.production.example server/ scripts/hash-password.mjs
```

(Каталог `mobinvest/app` — чтобы совпадало с локальной структурой; сам git-репозиторий
живёт в `app/`.)

---

## Шаг 5. Секреты — `.env.production`

```bash
cd ~/mobinvest/app
cp .env.production.example .env.production
chmod 600 .env.production
```

Сгенерировать значения:

**SESSION_SECRET** (ключ подписи cookie):

```bash
openssl rand -hex 32
```

**APP_PASSWORD_HASH** (scrypt-хеш пароля для входа, пользователь `admin`):

```bash
docker run --rm -v "$PWD":/a -w /a node:22-slim \
  node scripts/hash-password.mjs 'ПРИДУМАЙТЕ_ПАРОЛЬ' 2>/dev/null
```

Открыть файл и вписать значения:

```bash
nano .env.production
```

```ini
APP_DOMAIN=portfolio.ВАШ-ДОМЕН.com
TINVEST_TOKEN=t.НОВЫЙ_ТОКЕН_ИЗ_ШАГА_0
SESSION_SECRET=вывод_openssl_rand
APP_PASSWORD_HASH=salt:hash_из_hash-password.mjs
PROXY_PORT=8787
PROXY_HOST=0.0.0.0
NODE_ENV=production
```

- `APP_DOMAIN` — домен из Шага 1 (его DNS A-запись указывает на VPS). Caddy читает
  его из окружения (`{$APP_DOMAIN}` в `Caddyfile`), поэтому **править `Caddyfile`
  не нужно**.
- **Несколько пользователей** вместо одного пароля: закомментируйте
  `APP_PASSWORD_HASH`, добавьте `APP_USERS={"alice":"salt:hash","bob":"salt:hash"}`.
- В `.env.production` **нет** кавычек вокруг значений и переносов внутри них.
- Файл в `.gitignore`. Никогда не коммитьте и не пересылайте его.

---

## Шаг 6. (пропущен — домен берётся из `APP_DOMAIN`)

`Caddyfile` не трогаем. Если нужен **staging-сертификат** Let's Encrypt на время
тестов (лимит — 5 неудач/час, 50 серт./неделю на домен), добавьте первой строкой:

```caddy
{
	acme_ca https://acme-staging-v02.api.letsencrypt.org/directory
}
```
После успеха уберите и `docker compose up -d` заново. (Или коммитить это не надо —
правьте локальную копию `Caddyfile` на сервере, потом `git checkout Caddyfile`.)

---

## Шаг 7. Сборка и запуск

```bash
cd ~/mobinvest/app
docker compose up -d --build
```

Первый прогон: ~1–3 мин (сборка образа + подтягивание `caddy:2`).

Наблюдать за получением сертификата:

```bash
docker compose logs -f caddy
```

Ждём строку вида `certificate obtained successfully` для вашего домена.
`Ctrl+C` — выйти из логов (контейнеры продолжат работать).

Статус:

```bash
docker compose ps
```

Оба сервиса — `running`; `web` должен быть `healthy` (через ~30–40 с после старта).

---

## Шаг 8. Проверка

С локальной машины или прямо на сервере:

```bash
# health — открыт, без данных
curl -s https://portfolio.ВАШ-ДОМЕН.com/healthz
# {"ok":true}

# API без cookie — должен отдать 401
curl -s -o /dev/null -w '%{http_code}\n' https://portfolio.ВАШ-ДОМЕН.com/api/accounts
# 401

# сертификат
curl -sI https://portfolio.ВАШ-ДОМЕН.com | head -1
# HTTP/2 200

# заголовки безопасности
curl -sI https://portfolio.ВАШ-ДОМЕН.com | grep -i 'strict-transport\|x-frame\|x-content'

# HTTP -> HTTPS редирект
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://portfolio.ВАШ-ДОМЕН.com
# 308 https://portfolio.ВАШ-ДОМЕН.com/
```

Проверка логина (подставьте свой пароль):

```bash
# неверный пароль -> 401
curl -s -X POST https://portfolio.ВАШ-ДОМЕН.com/auth/login \
  -H 'Content-Type: application/json' -d '{"user":"admin","password":"wrong"}'

# верный -> 200 + Set-Cookie, дальше API открывается
curl -s -c /tmp/cj -X POST https://portfolio.ВАШ-ДОМЕН.com/auth/login \
  -H 'Content-Type: application/json' -d '{"user":"admin","password":"ВАШ_ПАРОЛЬ"}'
curl -s -b /tmp/cj https://portfolio.ВАШ-ДОМЕН.com/api/accounts
rm /tmp/cj
```

Открыть в браузере `https://portfolio.ВАШ-ДОМЕН.com` → форма входа → пароль →
портфель. Проверить вкладки и кнопку «Выйти» (в шите выбора счёта).

---

## Обновление

Локально закоммитили и запушили в GitHub — на сервере:

```bash
cd ~/mobinvest/app
git pull
docker compose up -d --build    # пересобирает web; caddy не трогается
docker image prune -f           # убрать старые слои
```

`web` пересоберётся и перезапустится (даунтайм ~1–2 с). Сессии переживают
перезапуск (cookie stateless). Сертификаты Caddy — в volume, не теряются.
`.env.production` не в git — `git pull` его не трогает.

Проверить после обновления: `curl -s https://ВАШ-ДОМЕН/healthz`.

---

## Откат

```bash
cd ~/mobinvest/app
git log --oneline -5            # найти предыдущий рабочий коммит/тег
git checkout <коммит-или-тег>
docker compose up -d --build
```

Состояния, которое можно потерять, нет — ни БД, ни загруженных файлов. Volume
`caddy_data` (сертификаты) не зависит от версии кода.

Вернуться на актуальную ветку: `git checkout main && docker compose up -d --build`.

---

## Эксплуатация

### Логи

```bash
docker compose logs -f web            # приложение (ошибки прокси, T-Invest)
docker compose logs -f caddy          # TLS, доступ
docker compose logs --since 1h web
```

Ротация уже настроена в `docker-compose.yml` (`json-file`, 10 МБ × 3 файла на сервис).

### Перезапуск / остановка

```bash
docker compose restart web
docker compose down                   # остановить всё
docker compose up -d                  # поднять
```

После перезагрузки VPS всё поднимется само (`restart: unless-stopped` +
`docker` включён в автозапуск по умолчанию). Проверить:
`sudo systemctl is-enabled docker`.

### Ресурсы

```bash
docker stats --no-stream
df -h /                               # место на диске
docker system df                      # сколько занимают образы/volume
```

### TLS

Продлевается Caddy автоматически (~за 30 дней до истечения). Ничего делать не
нужно. Посмотреть срок:

```bash
echo | openssl s_client -connect portfolio.ВАШ-ДОМЕН.com:443 2>/dev/null \
  | openssl x509 -noout -dates
```

### Бэкап

Бэкапить практически нечего. Достаточно хранить в надёжном месте
**`.env.production`** (или сами секреты). При желании — сертификаты:

```bash
docker volume ls | grep caddy         # уточнить имя volume
docker run --rm -v <имя>_caddy_data:/d -v "$PWD":/b alpine \
  tar czf /b/caddy_data.tgz -C /d .
```

### Обновление хоста

`unattended-upgrades` ставит патчи безопасности сам. Раз в пару месяцев вручную:

```bash
sudo apt update && sudo apt upgrade -y && sudo reboot
```

---

## Управление доступом

### Сменить пароль / добавить пользователя

1. Сгенерировать хеш:
   ```bash
   docker run --rm -v "$PWD":/a -w /a node:22-slim \
     node scripts/hash-password.mjs 'НОВЫЙ_ПАРОЛЬ' 2>/dev/null
   ```
2. Обновить `APP_PASSWORD_HASH` (или `APP_USERS`) в `.env.production`.
3. `docker compose up -d` (пересборка не нужна — меняется только env).

### Разлогинить всех

Поменять `SESSION_SECRET` в `.env.production` → `docker compose up -d`. Все
существующие cookie станут невалидными.

### Ограничить вход по IP

Если знаете свои адреса — в `Caddyfile` внутри блока домена, до `reverse_proxy`:

```caddy
@login path /auth/login
handle @login {
	@allowed remote_ip 203.0.113.0/24 198.51.100.7
	handle @allowed { reverse_proxy web:8787 }
	respond 403
}
reverse_proxy web:8787
```

`docker compose up -d` (Caddy перечитает конфиг).

---

## Диагностика проблем

### Сертификат не выпускается

`docker compose logs caddy` и смотреть причину:

| В логах | Причина / решение |
|---|---|
| `no records found for name` / `DNS problem` | A/AAAA-запись не указывает на VPS или не распространилась. `dig +short ВАШ-ДОМЕН`. |
| `connection refused` на `:80` | Порт 80 закрыт (`ufw allow 80/tcp`) или занят другим сервисом (`sudo ss -tlnp \| grep :80`). |
| `too many certificates` / `rateLimited` | Достигнут лимит Let's Encrypt. Переключитесь на staging (Шаг 6), дождитесь снятия лимита (неделя). |
| AAAA есть, но IPv6 не работает | Удалите AAAA-запись **или** включите IPv6 на VPS. |

### `502 Bad Gateway` от Caddy

`web` не отвечает. Проверить:

```bash
docker compose ps                     # web running/healthy?
docker compose logs --tail 50 web
docker compose exec web wget -qO- http://127.0.0.1:8787/healthz
```

Частые причины: опечатка в `.env.production` (кавычки, пробелы), падение на старте.

### `web` в статусе `unhealthy`

```bash
docker inspect --format '{{json .State.Health}}' $(docker compose ps -q web)
```

Healthcheck бьёт в `/healthz`. Если 200 не приходит — приложение не стартовало,
смотрите `docker compose logs web`.

### `/api/*` всегда 401, хотя пароль верный

- Cookie не долетает: проверьте, что заходите по **HTTPS** (cookie `Secure`), а не
  по IP/HTTP.
- `SESSION_SECRET` поменялся между входом и запросом (перезапуск с новым секретом).
- Часы на VPS врут (`timedatectl` — должно быть `System clock synchronized: yes`).

### T-Invest отвечает `401 Unauthorized` (в логах `web`)

Токен неверный/отозван. Проверьте командой из Шага 0. Пересоздайте, обновите
`.env.production`, `docker compose up -d`.

### T-Invest отвечает `429` / `RESOURCE_EXHAUSTED`

Превышены лимиты API. Прокси ограничивает параллелизм и кэширует; при активном
обновлении несколькими людьми возможны всплески — подождите минуту.

### Ошибка TLS при обращении прокси к `tbank.ru` (`SELF_SIGNED_CERT_IN_CHAIN`)

Не должно возникать: `server/russian-trusted-ca.pem` встроен и подключается в
`server/tinvest.js`. Если файл потерялся при заливке — верните его
(`ls server/russian-trusted-ca.pem`) и пересоберите.

### Диск заполнился

```bash
docker image prune -af
docker builder prune -af
sudo journalctl --vacuum-time=7d
```

### Сборка убивается по памяти (`Killed` во время `npm run build`)

Мало RAM. Добавьте swap (см. [Опционально](#опционально)) или соберите образ
локально и запушьте в реестр.

---

## Опционально

### Swap для VPS с 1 ГБ RAM

```bash
# root
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
free -h
```

### Сборка локально + push в реестр (вместо сборки на VPS)

Локально: `docker build -t ghcr.io/USER/mobinvest:latest app && docker push ...`
На VPS: заменить `build: .` на `image: ghcr.io/USER/mobinvest:latest` в
`docker-compose.yml`, затем `docker compose pull && docker compose up -d`.

### Внешний мониторинг

Аптайм-чек на `https://ВАШ-ДОМЕН/healthz` (UptimeRobot, Better Stack,
healthchecks.io) с оповещением при недоступности.

### Доступ только для себя (без публичного порта)

Вместо публикации 80/443 — [Tailscale](https://tailscale.com/) на VPS и на своих
устройствах, Caddy слушает только tailnet-адрес, `ufw` не открывает 80/443.
Надёжнее логина, но неудобно с чужих устройств.

---

## Чеклист

- [ ] Старый токен T-Invest отозван, выпущен новый (read-only), проверен
- [ ] DNS A (и AAAA при наличии IPv6) → IP VPS, `dig` подтверждает
- [ ] VPS: обновления, `deploy` с sudo и SSH-ключом, root-login и парольный вход отключены
- [ ] `ufw`: 22/80/443, включён; `fail2ban` активен
- [ ] Docker + Compose v2, `deploy` в группе `docker`, перелогин выполнен
- [ ] Код на сервере, все файлы на месте
- [ ] `.env.production`: `TINVEST_TOKEN`, `SESSION_SECRET`, `APP_PASSWORD_HASH`; `chmod 600`
- [ ] `APP_DOMAIN` в `.env.production` = ваш домен
- [ ] `docker compose up -d --build` — оба контейнера `running`, `web` `healthy`
- [ ] В логах caddy — `certificate obtained successfully`
- [ ] `/healthz` = 200, `/api/accounts` без cookie = 401, HTTP→HTTPS = 308
- [ ] Вход в браузере работает, вкладки грузят живые данные, «Выйти» работает
- [ ] `.env.production` / секреты сохранены в надёжном месте
