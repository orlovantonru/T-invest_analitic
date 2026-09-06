# Структура проекта

Приложение анализа брокерского портфеля: **Vite + React 18 + TypeScript** (фронт)
и **Node-прокси** к T-Invest API (бэкенд). Один репозиторий, один процесс в проде.

## Режимы работы

| Режим | Когда | Данные |
|---|---|---|
| **live** | прокси доступен + валидный токен (+ сессия, если включён логин) | реальный портфель из T-Invest API |
| **auth** | прокси включил аутентификацию, сессии нет | показывается `LoginScreen` |
| **demo** | прокси недоступен (локальная разработка без токена) | вымышленный набор из `src/data/demo.ts` |

Ключевая идея: **компоненты и селекторы не знают, откуда данные** — прокси
нормализует ответы T-Invest ровно в те же типы (`Account` / `Holding` / `Tx`),
что и демо-набор.

## Поток данных

```
                    ┌─────────────────────────── браузер ───────────────────────────┐
                    │                                                                │
  main.tsx ─┬─ StoreProvider ......... UI-состояние (вкладка, фильтры, шиты)         │
            │                                                                        │
            └─ PortfolioDataProvider ─ РЕЖИМ + все загруженные данные + ленивые       │
                     │                 загрузчики (ensureCandles/Operations/…)        │
                     │  api.*                                                         │
                     ▼                                                                │
              /api/*, /auth/*  ──────────────────────────────────────────────────────┘
                     │  (dev: Vite proxy → :8787 ; prod: Caddy → web:8787)
                     ▼
        ┌──────────── server/ (Node) ────────────┐
        │  index.js   маршруты + нормализация     │
        │  auth.js    пароль + сессия-cookie      │
        │  tinvest.js клиент T-Invest + кэш + CA  │
        └───────────────────┬────────────────────┘
                            │ Bearer TINVEST_TOKEN (только чтение)
                            ▼
                 invest-public-api.tbank.ru
```

Внутри браузера: `PortfolioDataProvider` отдаёт сырые массивы через
`usePortfolioData()`; вкладки прогоняют их через **чистые селекторы**
`src/lib/portfolio.ts`, получая уже готовые к рендеру строки и цвета.

---

## Файлы

### Корень

| Файл | Назначение |
|---|---|
| `package.json` | Скрипты: `dev` (прокси + Vite), `build` (`tsc && vite build`), `server`, `start`. Зависимости: только `react` / `react-dom`; всё остальное — dev. |
| `vite.config.ts` | Плагин React + dev-прокси `/api`, `/auth`, `/healthz` → `:8787`. В проде Vite не участвует. |
| `tsconfig.json` | Строгий TS, `noUnusedLocals/Parameters`, `noEmit` (эмитит Vite). |
| `index.html` | Точка монтирования (`#root`), подключает `src/main.tsx`. |
| `Dockerfile` | Двухстадийная сборка: `node:22-slim` собирает `dist/`, рантайм-образ = Node + `dist/` + `server/`, без `node_modules`. `HEALTHCHECK` → `/healthz`. |
| `docker-compose.yml` | Прод-стек: `web` (Node) + `caddy` (TLS + reverse-proxy). Наружу — только `caddy`. |
| `Caddyfile` | `{$APP_DOMAIN} { reverse_proxy web:8787 }` + security-заголовки. Домен из окружения — файл под деплой не редактируется. |
| `.env.example` / `.env.production.example` | Шаблоны переменных (dev / прод). Реальные `.env*` — в `.gitignore`. |
| `README.md` | Как запустить (демо + live), что реально/приблизительно в live. |
| `DEPLOY.md` | Подробная пошаговая инструкция деплоя на VPS. |
| `docs/STRUCTURE.md` | Этот файл. |

### `scripts/`

| Файл | Назначение |
|---|---|
| `dev.mjs` | `npm run dev`: спавнит прокси (`--watch`, если есть `.env`) и Vite; падение одного гасит второй. |
| `hash-password.mjs` | `node scripts/hash-password.mjs 'пароль'` → строка для `APP_PASSWORD_HASH` (scrypt). |

### `server/` — Node-прокси

| Файл | Назначение |
|---|---|
| `index.js` | HTTP-сервер. Маршруты: `/healthz` (открыт), `/auth/{login,logout,me}`, `/api/*` (за сессией), всё остальное — статика `dist/` + SPA-fallback. Функции `build*` берут ответы T-Invest и приводят к модели приложения: `buildPortfolio` (позиции + тоталы, конвертация валют, класс/сектор/НКД), `buildOperations` (пагинация по курсору, 4 типа операций), `buildCandles`, `buildBenchmark`, `buildSectors`, `buildBondCoupons`. |
| `auth.js` | Пароль как scrypt-хеш из env (`APP_PASSWORD_HASH` / `APP_USERS`), сессия — подписанная на `SESSION_SECRET` cookie `sid` (без хранилища). Антибрутфорс по IP. Нет пароля → аутентификация выключена (dev). |
| `tinvest.js` | Клиент REST-шлюза T-Invest: авторизованные POST через `https.request` со своим CA-agent (`russian-trusted-ca.pem` + дефолтные корни), `mv()` (MoneyValue → число), пул параллелизма, кэши (инструменты, свечи с TTL, UID индекса, курсы). `ALLOWED` — белый список методов. |
| `russian-trusted-ca.pem` | Корневой + промежуточный сертификаты «Russian Trusted Root CA» (Минцифры) — их нет в списке Node, а `*.tbank.ru` ими подписан. |

### `src/` — фронтенд

**Точка входа и глобальное состояние**

| Файл | Назначение |
|---|---|
| `main.tsx` | `createRoot` → `StoreProvider` → `PortfolioDataProvider` → `App`. Импортирует `styles.css`. |
| `App.tsx` | По `status`: спиннер / `LoginScreen` / (демо-баннер +) интерфейс. Интерфейс = `Header` + активная вкладка + `BottomNav` + оверлеи. |
| `store.tsx` | Состояние **интерфейса** (не данных): вкладка, счёт, флаги шитов, фильтры/сортировки, параметры графика. `useReducer` + контекст, действие `set` (патч). Хук `useStore()`. |

**Данные**

| Файл | Назначение |
|---|---|
| `data/demo.ts` | ТИПЫ модели (`Account` / `Holding` / `Tx` / …) + офлайн-набор (счета, позиции, операции, `PERF_SEED`, `BOND_INFO`, `ISSUER_INFO`) + списки для чипов/шитов. |
| `data/PortfolioDataProvider.tsx` | Оркестратор. Держит все загруженные данные и вычисляет РЕЖИМ. Первая загрузка — только «Обзор» (счета + портфель). Остальное лениво: `ensureOperations` / `ensureCandles` / `ensureBenchmark` / `ensureSectors` / `ensureBondCoupons` (идемпотентны, кэш + набор `inflight`). `retryAuth()` (после логина), `logout()`. Хук `usePortfolioData()`. |
| `api/client.ts` | Типизированные `fetch`-обёртки над `/api/*` и `/auth/*`. Любая ошибка → `ProxyError` со `status` (0 = нет прокси, 401 = нужен вход, 5xx = ошибка API). |

**Логика (чистые функции)**

| Файл | Назначение |
|---|---|
| `lib/portfolio.ts` | Все селекторы: `enrich` (позиция → +value/cost/P&L), `getTotals`, `getClassSegments`, `getTopMovers`, `getDividendMonthTotal`, `getHoldingRows`, `getAllocation`, `getHistory`, `getDetail`, и для «Динамики» — `getPerformanceDemo` (синтетика из `PERF_SEED`) и `getPerformanceLive` (приблизительно: доходность свечей каждой бумаги, взвешенная по доле; бенчмарк = IMOEX). Возвращают готовые строки/цвета. |
| `lib/format.ts` | Форматирование денег/процентов/дат (`ru-RU`, запятая в процентах, «₽»/«$»). |
| `lib/series.ts` | Математика графиков: `genSeries` (детерминированный псевдо-ряд для демо), `buildPoints` / `buildSparkPoints` (массив → `points` для `<polyline>`), `tickDates`. |

**Компоненты**

| Файл | Назначение |
|---|---|
| `components/Header.tsx` | Шапка: селектор счёта, стоимость, изменение за день, общий P&L. |
| `components/BottomNav.tsx` | Нижняя навигация на 5 вкладок. |
| `components/Sheets.tsx` | Боттом-шиты: выбор счёта (+ «Выйти») и выбор сортировки. |
| `components/DetailOverlay.tsx` | Полноэкранная карточка бумаги. Заказывает свечи и (для облигаций) купоны при открытии. |
| `components/LoginScreen.tsx` | Форма входа (`POST /auth/login` → `retryAuth()`). |
| `components/Sparkline.tsx` | Обёртка над SVG `<polyline>` (координаты приходят готовыми). |
| `components/Chips.tsx` | Горизонтальный ряд чипов-фильтров. |
| `components/Icons.tsx` | Инлайновые SVG-иконки (стиль Lucide), без файлов. |
| `components/tabs/Overview.tsx` | «Обзор»: аллокация-бар, топ движения дня, карточка выплат. |
| `components/tabs/Holdings.tsx` | «Состав»: фильтр + сортировка + список позиций. |
| `components/tabs/Allocation.tsx` | «Аллокация»: Класс / Сектор / Валюта, донат + легенда. |
| `components/tabs/Performance.tsx` | «Динамика»: период, график (портфель/бенчмарк/инфляция), таблица доходности по бумагам. |
| `components/tabs/History.tsx` | «История операций»: фильтр по типу, список сделок и выплат. |
| `src/styles.css` | Все стили: токены Classical → классы ДС → оболочка приложения. |

---

## Ключевые механизмы

### Жизненный цикл загрузки (live)

1. `PortfolioDataProvider` монтируется → `status = "loading"`.
2. `api.me()`:
   - `200` → `status = "live"`, дальше `api.accounts()` → выбираем первый счёт;
   - `401` → `status = "auth"` (показывается `LoginScreen`);
   - сетевая ошибка → `status = "demo"`.
3. При смене `accountId` — эффект грузит `api.portfolio(accountId)` (кэш по счёту).
4. Как только портфель пришёл — фоном `ensureOperations()` и `ensureCandles()` для
   4 топ-муверов (спарклайны на «Обзоре»).
5. Дальше вкладки заказывают своё: «Динамика» — свечи всех бумаг + бенчмарк;
   «Аллокация → Сектор» — секторы; карточка облигации — купоны.

### Ленивая загрузка

Каждая `ensure*`-функция: проверяет кэш и набор `inflight` (ключ запроса), при
необходимости делает запрос, кладёт результат в `useState`, чистит `inflight`.
Повторные вызовы (в т.ч. из-за перерендера) — no-op.

### Аутентификация

- Пароль хранится **только** как scrypt-хеш в `.env.production` на сервере.
- Кука `sid` = `base64url(JSON{u,iat}) . HMAC-SHA256(payload, SESSION_SECRET)`;
  флаги `HttpOnly; SameSite=Lax; Secure` (в проде). Хранилища сессий нет →
  рестарт контейнера никого не разлогинивает; смена `SESSION_SECRET` —
  разлогинивает всех.
- Все `/api/*` за проверкой `readSession`. `/healthz` и статика — открыты.

### Приблизительная «Динамика» в live

В API нет ряда «стоимость портфеля во времени». `getPerformanceLive` строит:
`P(t) = Σᵢ wᵢ · rᵢ(t)`, где `wᵢ` — текущая доля бумаги, `rᵢ` — доходность её
дневных свечей (к началу периода). Ряды бумаг разной длины ресэмплятся к 80
точкам линейной интерполяцией (крайние точки сохраняются → итоговый процент
точный). Бенчмарк — свечи индекса МосБиржи. Линии инфляции нет. В UI помечено
как приблизительное.

### Демо-фолбэк

Если прокси недоступен, `PortfolioDataProvider` берёт данные из `data/demo.ts`
(тот же тип), а `App` показывает баннер. Работает без бэкенда вообще —
`npm run dev` без `.env`.

---

## С чего начинать чтение

1. `src/data/demo.ts` — модель данных (типы).
2. `src/data/PortfolioDataProvider.tsx` — как данные приходят и в каком режиме.
3. `src/lib/portfolio.ts` — как из данных получаются цифры для экрана.
4. `src/components/tabs/*` — как это рисуется.
5. `server/index.js` — как ответы T-Invest превращаются в модель.
