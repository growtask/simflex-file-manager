# Simflex File Manager

Файловый менеджер для PHP-сайтов: окно выбора и управления файлами каталога загрузок и JSON API к нему.
Работает на любом сайте на PHP 8.1+ — с CMS или без неё, без зависимостей. Создан для
[Simflex CMS](https://github.com/growtask/simflex-core), где подключается ядром.

- дерево папок, путь, поиск по названию, сортировка по названию, дате и весу;
- выбор одного или нескольких файлов, фильтр по типу (`accept`), ответ через Promise;
- загрузка кнопкой и перетаскиванием, сжатие картинок в WebP и видео в MP4 — по согласию пользователя;
- создание, переименование, перемещение и удаление файлов и папок, копирование пути, скачивание;
- предупреждение, если на файл ссылаются страницы сайта (поиск задаёт сайт);
- окна — `<dialog>` поверх страницы, светлая и тёмная тема, версия для телефона и планшета, управление с клавиатуры;
- безопасный API: путь не выходит из каталога, изменения — только POST со своего сайта и с CSRF-токеном,
  белый список расширений, загрузка без перезаписи.

## Требования

- PHP 8.1 или новее, `ext-json`;
- для сжатия картинок — GD с поддержкой WebP; для сжатия видео — `ffmpeg` (в `PATH` или путь в переменной окружения
  `FM_FFMPEG`). Без них файлы загружаются как есть.

## Установка

```bash
composer require simflex/file-manager
```

## Подключение

### 1. Обработчик API

Страница, на которую окно отправляет запросы. Доступ к ней должен быть только у тех, кому можно работать с файлами.

```php
// public/file-manager.php
require __DIR__ . '/../vendor/autoload.php';

session_start();

$manager = new \Simflex\FileManager\Manager(
    __DIR__ . '/uploads',                                    // каталог файлов
    fn(): bool => ($_SESSION['role'] ?? '') === 'admin',      // есть ли доступ
    fn(): bool => hash_equals($_SESSION['csrf'] ?? '', $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''), // CSRF-токен
);
$manager->handleRequest();
```

Необязательные настройки:

```php
$manager
    ->setProtectedDirs(['/images', '/files'])                // папки, которые нельзя удалить и переместить
    ->setUsageFinder(fn(string $url): array => $finder->find($url), '/uploads') // где на сайте стоит ссылка на файл
    ->setErrorLogger(fn(string $message) => $logger->error($message));       // журнал внутренних ошибок
```

`setUsageFinder` получает адрес файла (`/uploads/images/a.png`, у папки — с `/` в конце) и возвращает
`['таблица' => число записей]`; без него предупреждения о ссылках нет.

### 2. Статика

Каталог `vendor/simflex/file-manager/src/assets` (скрипт, стили, иконки) должен открываться из браузера:
скопируйте его в публичную папку при сборке или сделайте ссылку.

```bash
ln -s ../vendor/simflex/file-manager/src/assets public/file-manager
```

### 3. Окно

Шаблон выводится в конце `<body>`, скрипт подключается модулем:

```php
<?php
$fileManagerApi = '/file-manager.php';
$fileManagerRoot = '/uploads';                 // адрес каталога файлов на сайте
$fileManagerAssets = '/file-manager';          // адрес статики из шага 2
$fileManagerCsrfToken = $_SESSION['csrf'];
$fileManagerProtectedDirs = ['/images', '/files'];
$theme = 'light';                              // или dark
include __DIR__ . '/../vendor/simflex/file-manager/src/tpl/index.tpl';
?>
<script type="module" src="/file-manager/js/file-manager.js"></script>
```

## Открытие окна

```js
const files = await window.fileManager.open({
    multiple: true,              // можно выбрать несколько
    select: true,                // кнопка «Готово»: окно отдаёт выбранные файлы
    accept: ['jpg', 'png'],      // или строка как у <input accept>: 'image/*,.pdf'; без accept — любые
});
// по «Готово»: [{path: '/images/a.png', url: '/uploads/images/a.png', name: 'a.png', isImage: true}]
// окно закрыли без выбора (крестик, Esc, клик по фону, close(), новый open()): null

window.fileManager.close();
```

Вместо Promise можно передать `onSelect(files)` и `onCancel()` — на одно открытие вызывается ровно один из них.
Без `select` и `onSelect` окно открывается для работы с файлами. При `accept` неподходящие файлы видны, но выбрать
и загрузить их нельзя.

## API

Запрос — `?method=…` к обработчику, ответ — JSON:

```json
{"error": {"code": 0, "message": ""}, "items": [...]}
```

Ошибка — HTTP-статус (401, 403, 404, 405, 409, 413, 422, 500), `error.code` равен статусу, `error.message` — текст
для пользователя.

| Метод | Запрос | Параметры |
|---|---|---|
| `getTree` | GET | `path`, `depth` (1 — только вложенные папки) |
| `getFileList` | GET | `path`, `include_dirs` |
| `download` | GET | `path` — файл отдаётся потоком |
| `usage` | GET | `path` — где на сайте стоит ссылка: `[{table, count}]` |
| `compression` | GET | что сервер умеет сжимать: `image`, `video` |
| `createDir` | POST | `path`, `name` |
| `rename` | POST | `path`, `name` |
| `move` | POST | `path` — папка назначения, `items[]` — что перемещать |
| `delete` | POST | `path` |
| `upload` | POST | `path`, `file[]`, `compress=1` — сжать картинки и видео |

Изменяющие методы (POST) принимаются только со страницы этого же сайта и с заголовком `X-CSRF-Token`, если задана
проверка. `Manager::process()` возвращает ответ без отправки — `[статус, тело]`, например для тестов
с `new Request($get, $post, $files, $server)`.

## Безопасность

- путь начинается с `/`, без `.`, `..`, `\`, не проходит через символические ссылки и не выходит из каталога;
  корень и системные папки не удаляются, не переименовываются и не перемещаются;
- загружаются только файлы из белого списка (`Manager::ALLOWED_EXTENSIONS`: картинки, документы, архивы, аудио,
  видео, шрифты) с безопасным именем; HTML, SVG, JS и PHP — нет;
- файл с тем же именем не перезаписывается (`photo-2.webp`).

Каталог загрузок лучше закрыть от выполнения скриптов на уровне веб-сервера (для Apache — `.htaccess`
с `php_flag engine off`, `X-Content-Type-Options: nosniff`).

## Вид

Цвета, скругления и тени — CSS-переменные `--fm-*` на `.fm-root` (`src/assets/styles/file-manager.css`):
переопределите их, чтобы окно было в цветах сайта. Тёмная тема — `$theme = 'dark'`.

## Simflex CMS

В Simflex CMS 4.0 менеджер подключает ядро: API — `/admin/fm`, окно — в админке на каждой странице, доступ —
`fileManagerPrivilege`, системные папки — `fileManagerProtectedDirs`, поиск ссылок — по текстовым колонкам базы.
Подробнее — в документации Simflex CMS.

## Лицензия

[MIT](LICENSE). Авторы: pf, Denis Glushkov, Arseniy Kosobryuhov, Andrey Timofeevich.
