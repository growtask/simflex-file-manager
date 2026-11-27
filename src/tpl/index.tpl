<?php

/**
 * Файловый менеджер: разметка окон на своём слое интерфейса, без зависимостей от страницы. Окна — <dialog>
 * (верхний слой браузера): окно менеджера, окна действий («Переименовать», «Создать папку», «Переместить»,
 * подтверждение удаления, «Сжать перед загрузкой?»), меню файла, папки и сортировки, подсказка, уведомления.
 * Содержимое строит assets/js/file-manager.js по API Manager, стили — assets/styles/file-manager.css.
 * Шаблон выводится в конце <body> (include с переменными ниже), скрипт подключается как модуль.
 * @var string $fileManagerApi Адрес API (страница, которая вызывает Manager::handleRequest())
 * @var string $fileManagerRoot Адрес корня файлов на сайте, например /uploads
 * @var string $fileManagerAssets Адрес каталога src/assets пакета, доступного из браузера
 * @var string $theme Тема: light (по умолчанию) или dark
 * @var string $fileManagerCsrfToken CSRF-токен для изменяющих запросов (заголовок X-CSRF-Token); пусто — из
 *      <meta name="csrf-token"> страницы, если он есть
 * @var string[] $fileManagerProtectedDirs Системные папки (Manager::setProtectedDirs()): в меню без удаления
 */

$assetsDir = dirname(__DIR__) . '/assets';
/** Адрес статики с версией по времени изменения: обновлённый пакет не берётся из кэша браузера */
$asset = fn(string $path) => $fileManagerAssets . '/' . $path . '?v=' . (int)@filemtime($assetsDir . '/' . $path);
$e = fn(string $text) => htmlspecialchars($text, ENT_QUOTES);
$sprite = $asset('img/icons.svg');
$theme = ($theme ?? 'light') === 'dark' ? 'dark' : 'light';
/** Иконка из спрайта assets/img/icons.svg */
$icon = fn(string $name, string $class = '') => '<svg class="fm-icon' . ($class ? ' ' . $class : '')
    . '" aria-hidden="true"><use href="' . $e($sprite) . '#fm-' . $name . '"></use></svg>';
/** Кнопка-иконка с подсказкой */
$tool = fn(string $name, string $label, string $action, string $extra = '') => '<button type="button" class="fm-tool'
    . '" data-fm-action="' . $action . '" aria-label="' . $e($label) . '" data-fm-tip="' . $e($label) . '"'
    . $extra . '>'
    . $icon($name) . '</button>';
/** Пункт меню */
$item = fn(string $name, string $label, string $action, string $class = '') => '<button type="button" class="fm-item'
    . ($class ? ' ' . $class : '') . '" role="menuitem" data-fm-action="' . $action . '">' . $icon($name)
    . '<span class="fm-item__label">' . $e($label) . '</span></button>';
/** Пункт нижней панели телефона */
$tab = fn(string $name, string $label, string $action, string $class = '') => '<button type="button"'
    . ' class="fm-tabbar__item' . ($class ? ' ' . $class : '') . '" data-fm-action="' . $action . '">' . $icon($name)
    . '<span>' . $e($label) . '</span></button>';
/** Поле form-input: название, поле, подсказка */
$field = fn(string $label, string $placeholder, string $hint, string $attributes) => '<label class="fm-field">'
    . '<span class="fm-field__label">' . $e($label) . '</span>'
    . '<input class="fm-field__input" type="text" autocomplete="off" spellcheck="false"'
    . ' placeholder="' . $e($placeholder) . '" ' . $attributes . '>'
    . '<span class="fm-field__hint">' . $e($hint) . '</span></label>';
/** Окно действия: крестик снаружи, заголовок, текст, содержимое, «Отменить» и главная кнопка */
$modal = fn(
    string $id,
    string $title,
    string $text,
    string $content,
    string $cancel,
    string $saveText,
    string $action,
) =>
    '<dialog id="' . $id . '" class="fm-root fm-dialog fm-dialog_modal" data-fm-theme="' . $theme . '"'
    . ' aria-labelledby="' . $id . '-title">'
    . '<div class="fm-modal fm-dialog__box">'
    . '<button type="button" class="fm-modal__close" data-fm-close aria-label="Закрыть">' . $icon('close') . '</button>'
    . '<div class="fm-modal__box">'
    . '<div class="fm-modal__head">'
    . '<h2 class="fm-modal__title" id="' . $id . '-title" data-fm-title>' . $e($title) . '</h2>'
    . '<p class="fm-modal__text" data-fm-text>' . $e($text) . '</p>'
    // файл стоит на страницах (API usage) — перед удалением и переименованием
    . '<p class="fm-modal__warning" role="alert" data-fm-warning hidden></p></div>'
    . $content
    . '<div class="fm-modal__footer">'
    . '<button type="button" class="fm-button fm-button_gray fm-button_l" data-fm-close>' . $e($cancel) . '</button>'
    . '<button type="button" class="fm-button fm-button_primary fm-button_l" data-fm-action="' . $action . '">'
    . $e($saveText) . '</button>'
    . '</div></div></div></dialog>';
?>
<link rel="stylesheet" href="<?= $e($asset('styles/file-manager.css')) ?>">
<div class="file-manager" data-fm-api="<?= $e($fileManagerApi) ?>" data-fm-root="<?= $e($fileManagerRoot) ?>"
     data-fm-sprite="<?= $e($sprite) ?>"
     data-fm-csrf="<?= $e((string)($fileManagerCsrfToken ?? '')) ?>"
     data-fm-protected="<?= $e(json_encode(array_values($fileManagerProtectedDirs ?? []))) ?>">
    <dialog id="sf-file-manager" class="fm-root fm-dialog fm-dialog_window" data-fm-theme="<?= $theme ?>"
            aria-label="Файловый менеджер">
        <div class="fm-window fm-dialog__box">
            <div class="fm-window__head">
                <nav class="fm-crumbs" aria-label="Путь">
                    <button type="button" class="fm-tool fm-crumbs__home" data-fm-path="" aria-label="В корень"
                            data-fm-tip="В корень"><?= $icon('home', 'fm-icon_16') ?></button>
                    <div class="fm-crumbs__list" data-fm-crumbs></div>
                </nav>
                <?= $tool('close', 'Закрыть', 'close', ' data-fm-close') ?>
            </div>
            <div class="fm-window__body">
                <aside class="fm-side">
                    <div class="fm-tree" role="tree" aria-label="Папки" data-fm-tree></div>
                    <div class="fm-tools">
                        <?= $tool('upload', 'Загрузить', 'upload') ?>
                        <?= $tool('folder-plus', 'Создать папку', 'create') ?>
                        <?= $tool('refresh', 'Обновить', 'refresh') ?>
                        <?= $tool('folder-x', 'Удалить папку', 'delete-folder', ' data-fm-delete-folder') ?>
                        <?php /* режим отметки: вместо кнопок папки — выход из него */ ?>
                        <button type="button" class="fm-button fm-button_gray fm-tools__cancel"
                                data-fm-action="cancel-selection"><?= $icon('close') ?>Отменить выбор</button>
                    </div>
                </aside>
                <div class="fm-main">
                    <div class="fm-toolbar">
                        <label class="fm-search"><?= $icon('search') ?>
                            <input class="fm-search__input" type="search" placeholder="Введите название файла"
                                   aria-label="Поиск по названию" autocomplete="off" data-fm-search></label>
                        <span class="fm-toolbar__line" aria-hidden="true"></span>
                        <button type="button" class="fm-sort" aria-haspopup="menu" aria-expanded="false" data-fm-sort>
                            <span data-fm-sort-label>По названию</span><?= $icon('down') ?></button>
                    </div>
                    <div class="fm-board" data-fm-board>
                        <div class="fm-files" role="listbox" aria-label="Файлы" data-fm-files></div>
                        <div class="fm-state" data-fm-state hidden>
                            <span class="fm-state__marker" data-fm-state-marker><?= $icon('file-search') ?></span>
                            <p class="fm-state__title" data-fm-state-title></p>
                            <p class="fm-state__text" data-fm-state-text></p>
                        </div>
                    </div>
                    <div class="fm-bottom">
                        <div class="fm-info" aria-live="polite">
                            <p class="fm-info__name" data-fm-info-name></p>
                            <p class="fm-info__meta" data-fm-info-meta></p>
                        </div>
                        <button type="button" class="fm-button fm-button_primary fm-done" data-fm-action="done"
                                disabled>
                            <?= $icon('check') ?>Готово</button>
                    </div>
                    <div class="fm-drop" data-fm-drop hidden><?= $icon('upload') ?>
                        <p>Отпустите файлы, чтобы загрузить их в эту папку</p></div>
                </div>
            </div>
            <div class="fm-tabbar">
                <?= $tab('back', 'Назад', 'back') ?>
                <?= $tab('upload', 'Загрузить', 'upload') ?>
                <?= $tab('folder-plus', 'Создать', 'create') ?>
                <?= $tab('refresh', 'Обновить', 'refresh') ?>
                <?= $tab('check', 'Готово', 'done') ?>
                <?php /* режим отметки: «Отменить выбор», «Переместить» и «Удалить» отмеченное, «Готово» */ ?>
                <?= $tab('close', 'Отменить', 'cancel-selection', 'fm-tabbar__item_check') ?>
                <?= $tab('folder-move', 'Переместить', 'move-selected', 'fm-tabbar__item_check') ?>
                <?= $tab('trash', 'Удалить', 'delete-selected', 'fm-tabbar__item_check fm-tabbar__item_danger') ?>
                <?= $tab('check', 'Готово', 'done', 'fm-tabbar__item_check') ?>
            </div>
        </div>
        <input class="fm-input" type="file" multiple hidden data-fm-input>
        <div class="fm-pop" role="menu" data-fm-menu="file" hidden><span class="fm-pop__corner"></span>
            <div class="fm-pop__box">
                <?php /* телефон и планшет: наведения нет — режим отметки отсюда */ ?>
                <?= $item('check', 'Выбрать', 'select-item', 'fm-item_touch') ?>
                <?= $item('download', 'Скачать', 'download') ?>
                <?= $item('edit', 'Переименовать', 'rename') ?>
                <?= $item('folder-move', 'Переместить', 'move') ?>
                <?= $item('link', 'Копировать путь', 'copy-path') ?>
                <div class="fm-pop__line" role="separator"></div>
                <?= $item('trash', 'Удалить', 'delete', 'fm-item_danger') ?>
            </div>
        </div>
        <div class="fm-pop" role="menu" data-fm-menu="folder" hidden><span class="fm-pop__corner"></span>
            <div class="fm-pop__box">
                <?= $item('check', 'Выбрать', 'select-item', 'fm-item_touch') ?>
                <?= $item('folder-plus', 'Создать папку', 'create') ?>
                <?= $item('upload', 'Загрузить файлы', 'upload-to') ?>
                <?= $item('edit', 'Переименовать', 'rename') ?>
                <?= $item('folder-move', 'Переместить', 'move') ?>
                <?= $item('link', 'Копировать путь', 'copy-path') ?>
                <div class="fm-pop__line" role="separator"></div>
                <?= $item('trash', 'Удалить', 'delete', 'fm-item_danger') ?>
            </div>
        </div>
        <div class="fm-pop fm-pop_sort" role="menu" aria-label="Сортировка" data-fm-menu="sort" hidden>
            <span class="fm-pop__corner"></span>
            <div class="fm-pop__box">
                <?php $sorts = ['name' => 'По названию', 'date' => 'Дата изменения', 'size' => 'Вес файла']; ?>
                <?php foreach ($sorts as $value => $label): ?>
                    <button type="button" class="fm-item" role="menuitemradio"
                            aria-checked="<?= $value === 'name' ? 'true' : 'false' ?>"
                            data-fm-sort-value="<?= $value ?>">
                        <span class="fm-item__label"><?= $e($label) ?></span></button>
                <?php endforeach; ?>
            </div>
        </div>
        <div class="fm-tip" role="tooltip" data-fm-tip-box><span class="fm-tip__corner"></span>
            <div class="fm-tip__body" data-fm-tip-text></div></div>
    </dialog>
    <?= $modal(
        'sf-file-manager-rename',
        'Переименовать',
        'Введите новое название папки или файла.',
        $field('Старое название', '', 'Предыдущее имя.', 'data-fm-old-name disabled')
        . $field('Новое название', 'Новое имя', 'Без символов / и \.', 'data-fm-name'),
        'Отменить',
        'Применить',
        'rename-save',
    ) ?>
    <?= $modal(
        'sf-file-manager-create',
        'Создать папку',
        'Введите название новой папки.',
        $field('Название папки', 'Папка', 'Латиницей или кириллицей.', 'data-fm-name'),
        'Отменить',
        'Создать',
        'create-save',
    ) ?>
    <?= $modal(
        'sf-file-manager-confirm',
        'Удалить файл?',
        'Файл будет удалён сразу.',
        '',
        'Отмена',
        'Удалить',
        'confirm-yes',
    ) ?>
    <?php /* «Переместить»: папка назначения выбирается пошагово — список вложенных папок, «назад» и путь */ ?>
    <dialog id="sf-file-manager-move" class="fm-root fm-dialog fm-dialog_modal" data-fm-theme="<?= $theme ?>"
            aria-labelledby="sf-file-manager-move-title">
        <div class="fm-modal fm-dialog__box">
            <button type="button" class="fm-modal__close" data-fm-close aria-label="Закрыть">
                <?= $icon('close') ?></button>
            <div class="fm-modal__box">
                <div class="fm-modal__head">
                    <h2 class="fm-modal__title" id="sf-file-manager-move-title">Переместить</h2>
                    <p class="fm-modal__text" data-fm-text></p>
                    <p class="fm-modal__warning" role="alert" data-fm-warning hidden></p>
                </div>
                <div class="fm-move">
                    <div class="fm-move__head">
                        <button type="button" class="fm-tool fm-move__back" data-fm-move-back
                                aria-label="На уровень выше">
                            <?= $icon('back') ?></button>
                        <nav class="fm-move__path" aria-label="Папка назначения" data-fm-move-path></nav>
                    </div>
                    <div class="fm-move__list" role="listbox" aria-label="Папки" data-fm-move-list></div>
                </div>
                <div class="fm-modal__footer fm-move__footer">
                    <button type="button" class="fm-button fm-button_gray fm-button_l fm-move__create"
                            data-fm-action="move-create"><?= $icon('folder-plus') ?><span>Новая папка</span></button>
                    <button type="button" class="fm-button fm-button_gray fm-button_l" data-fm-close>Отмена</button>
                    <button type="button" class="fm-button fm-button_primary fm-button_l"
                            data-fm-action="move-here">Переместить сюда</button>
                </div>
            </div>
        </div>
    </dialog>
    <?php /* вопрос перед загрузкой: сжимать картинки и видео или загрузить как есть (аудио не сжимается) */ ?>
    <dialog id="sf-file-manager-compress" class="fm-root fm-dialog fm-dialog_modal" data-fm-theme="<?= $theme ?>"
            aria-labelledby="sf-file-manager-compress-title">
        <div class="fm-modal fm-dialog__box">
            <button type="button" class="fm-modal__close" data-fm-close aria-label="Не загружать">
                <?= $icon('close') ?></button>
            <div class="fm-modal__box">
                <div class="fm-modal__head">
                    <h2 class="fm-modal__title" id="sf-file-manager-compress-title">Сжать перед загрузкой?</h2>
                    <p class="fm-modal__text">Сжатые файлы легче: страницы сайта открываются быстрее.</p>
                </div>
                <ul class="fm-compress" data-fm-compress-list></ul>
                <label class="fm-check"><input type="checkbox" class="fm-check__input" data-fm-compress-remember>
                    <span>Запомнить выбор до конца работы</span></label>
                <div class="fm-modal__footer">
                    <button type="button" class="fm-button fm-button_gray fm-button_l"
                            data-fm-action="compress-no">Как есть</button>
                    <button type="button" class="fm-button fm-button_primary fm-button_l"
                            data-fm-action="compress-yes">Сжать</button>
                </div>
            </div>
        </div>
    </dialog>
    <div class="fm-root fm-toasts" popover="manual" role="status" aria-live="polite" data-fm-theme="<?= $theme ?>"
         data-fm-toasts></div>
</div>
