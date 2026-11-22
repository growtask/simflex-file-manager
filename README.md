# Simflex File Manager

Файловый менеджер админки Simflex CMS 4.0: окно выбора и управления файлами каталога загрузок (`public/uf`).
Пакет подключает ядро `simflex/core` (окно — в `Admin/theme/tpl/body.tpl`, API — `/admin/fm`).

## Возможности

- дерево папок, хлебные крошки, поиск по названию, сортировка (название, дата, размер, тип);
- выбор файла, нескольких (Ctrl/⌘ или режим `multiple`), «Готово» отдаёт выбранные;
- загрузка кнопкой и перетаскиванием в окно, новые файлы выделяются, ошибки показываются карточкой и тостом;
- создание, переименование, удаление папок и файлов (удаление — после подтверждения, без корзины), копирование
  пути, скачивание; меню по правому клику или долгому нажатию;
- на планшете и телефоне — список без дерева и нижняя панель; светлая и тёмная тема админки.

## Состав

- `src/FileManager/Manager.php` — API (`?method=getTree|getFileList|download|delete|createDir|rename|upload`):
  корень каталога, проверка доступа, белый список расширений, изменяющие запросы — только POST со своего сайта
  и с CSRF-токеном (`X-CSRF-Token`), путь не выходит из корня, корень не удаляется и не переименовывается;
  загрузка — имя латиницей, без перезаписи, JPEG/PNG/WebP сжимаются в WebP до 2560 px;
- `src/tpl/index.tpl` — окно на компонентах Layout ядра (`Common/Modal`, `Button`, `TextInput`, `Dropdown`,
  `Tooltip`);
- `src/assets/styles/file-manager.scss` — стили на токенах ядра, собираются со стилями админки
  (`LayoutManager::useStyle()`);
- `src/assets/js/file-manager.js` — ES-модуль без зависимостей;
- `src/assets/img/icons.svg` — иконки набора `file-icon` (Figma SimflexCMS, страница Way-File).

## Подключение (делает ядро)

```php
// API: Kernel::executeFileManager()
// третий аргумент — проверка CSRF-токена изменяющего запроса
$manager = new \Simflex\FileManager\Manager($publicDir . '/uf', $canUseFileManager, fn() => Csrf::isValid($request));
$manager->handleRequest();
```

```php
// окно — в body админки, до вывода head
echo View::render($packageDir . '/src/tpl/index.tpl', [
    'fileManagerApi' => '/admin/fm',
    'fileManagerRoot' => '/uf',
    'fileManagerAssets' => Assets::publish($packageDir . '/src/assets'),
    'theme' => 'light',
]);
$page->jsModule($fileManagerAssets . '/js/file-manager.js');
```

## JS

```js
window.fileManager.open({
    multiple: false,
    // какие файлы можно выбрать: расширения или строка как у <input type=file accept>; без accept — любые
    accept: ['jpg', 'jpeg', 'png', 'webp', 'gif'], // или 'image/*,.pdf'
    onSelect: (files) => {
        // files: [{path: '/images/a.png', url: '/uf/images/a.png', name: 'a.png', isImage: true}]
    },
    // окно закрыто без выбора: крестик, Esc, подложка, close() или новый open()
    onCancel: () => {},
});

// то же через Promise: файлы по «Готово», null при отмене
const files = await window.fileManager.open({select: true, accept: 'image/*'});

window.fileManager.close();
// прежний вызов: callback получает путь первого файла от корня (/images/a.png)
window.fileManager.init((path) => {});
```

- На одно открытие — ровно один ответ: `onSelect` или `onCancel` (и Promise с файлами или `null`). `open()` при
  открытом окне отменяет прежний вызов и продолжает в том же окне с новыми параметрами.
- Режим выбора (кнопка «Готово») — при `onSelect` или `select: true`. Без них окно открывается для работы
  с файлами, «Готово» недоступна.
- При `accept` неподходящие файлы видны, но неактивны (не выбираются, «Готово» их не отдаёт); папки доступны всегда.
  Через окно загружаются только подходящие файлы, о прочих — сообщение.
- Окно открывается поверх уже открытых окон админки (стопка `Common/Modal` ядра), Esc закрывает только верхнее.

Выбор файла для редактора texted (`mediaSource: 'manager'`):

```js
pickFile: ({multiple, extensions}) => window.fileManager.open({
    multiple,
    select: true,
    accept: extensions || undefined,
}).then((files) => files && files.map((file) => ({url: file.url, alt: '', name: file.name}))),
```
