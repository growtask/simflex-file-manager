# Журнал изменений

Формат — [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/).

## [4.0.0] — не выпущена

### Добавлено

- `window.fileManager.open()` сообщает об отмене: `onCancel` — при любом закрытии без выбора (крестик, Esc,
  подложка, `close()`), и возвращает Promise — выбранные файлы по «Готово» или `null`. На одно открытие ровно
  один ответ; `open()` при открытом окне отменяет прежний вызов. Прежние вызовы с `onSelect` работают как раньше.
- `open({accept})` — какие файлы можно выбрать: массив расширений (`['jpg', 'png']`) или строка как у
  `<input type=file accept>` (`'image/*,.pdf'`). Неподходящие файлы видны, но неактивны (`file-card_disabled`),
  «Готово» их не отдаёт, загрузка через окно — только подходящих (о прочих — сообщение). Без `accept` — как раньше.
- `open({select: true})` — режим выбора без `onSelect` (для Promise). Подключение к редактору texted — в README.

### Исправлено

- Подтверждение удаления открывалось под окном менеджера, а окно менеджера становилось недоступным —
  слои окон исправлены в `Common/Modal` ядра (нужна версия ядра с этим исправлением).
- Меню неактивного файла: «Удалить» удаляет этот файл, а не выбранные.

### Изменено

- Несовместимо: API `/admin/fm` отвечает конвертом `JsonEnvelopeResponse` ядра: `{"error": {"code": 0, "message": ""}, ...}`;
  списки (`getTree`, `getFileList`, статусы `upload`) — в `items`, пустой ответ изменяющих методов — только `error`.
  Вместо `success` и кодов вида `not_authenticated` — HTTP-статус (401 не вошёл, 403 запрещено или нет прав
  на запись, 404 не найдено, 409 имя занято, 413 большой файл, 422 недопустимое имя) и `error.message` на русском.
  `file-manager.js` разбирает конвертом.
- Новый дизайн админки Simflex CMS 4.0 (Figma SimflexCMS, страница Way-File): окно `file-window` на компонентах
  Layout ядра (`Common/Modal`, `Button`, `TextInput`, `Dropdown`, `Tooltip`) — шапка с крошками, дерево папок,
  поиск и сортировка, сетка карточек (на планшете и телефоне — список и нижняя панель), сведения о файле, «Готово»;
  меню файла и папки по правому клику или долгому нажатию; окна «Переименовать», «Новая папка»; удаление —
  подтверждением админки. Светлая и тёмная тема.
- Стили — `src/assets/styles/file-manager.scss` на токенах ядра, собираются со стилями админки
  (`LayoutManager::useStyle()`); иконки — свой спрайт `src/assets/img/icons.svg` (набор `file-icon`).
- JS — ES-модуль `src/assets/js/file-manager.js` без jQuery: `window.fileManager.open({multiple, onSelect})`,
  `close()`; `init(callback)` оставлен для прежних вызовов. Изменяющие запросы — POST.
- Шаблон `src/tpl/index.tpl` получает переменные `$fileManagerApi`, `$fileManagerRoot`, `$fileManagerAssets`,
  `$theme` вместо глобальных `fileManager.apiBase`, `rootDir`, `assetsDir`.
- API: в `getFileList` — `bytes` и `mtime` (сортировка), картинки — также jpeg, gif, avif; скрытые файлы и папки
  (с точки) не показываются; размер картинки, который не читается, — пустой вместо ошибки.

### Удалено

- `src/assets/css/*` (`styles.css`, `styles.min.css`, `.map`, `styles.scss`), `src/assets/js/app.js`, `app.min.js`,
  картинки-заглушки `src/assets/img/file-img-*`, пример `bootstrap.php`.
