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
  корень каталога, проверка доступа, белый список расширений, изменяющие запросы — только со своего сайта;
- `src/tpl/index.tpl` — окно на компонентах Layout ядра (`Common/Modal`, `Button`, `TextInput`, `Dropdown`,
  `Tooltip`);
- `src/assets/styles/file-manager.scss` — стили на токенах ядра, собираются со стилями админки
  (`LayoutManager::useStyle()`);
- `src/assets/js/file-manager.js` — ES-модуль без зависимостей;
- `src/assets/img/icons.svg` — иконки набора `file-icon` (Figma SimflexCMS, страница Way-File).

## Подключение (делает ядро)

```php
// API: Kernel::executeFileManager()
$manager = new \Simflex\FileManager\Manager($publicDir . '/uf', $canUseFileManager);
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
    onSelect: (files) => {
        // files: [{path: '/images/a.png', url: '/uf/images/a.png', name: 'a.png', isImage: true}]
    },
});
window.fileManager.close();
// прежний вызов: callback получает путь первого файла от корня (/images/a.png)
window.fileManager.init((path) => {});
```

Без `onSelect` окно открывается для управления файлами, кнопки «Готово» нет.
