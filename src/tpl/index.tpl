<?php

/**
 * Окно файлового менеджера (file-window) на Common/Modal ядра Simflex CMS: шапка с крошками и «Закрыть», дерево папок
 * и кнопки папки (desktop), поиск и сортировка, сетка карточек (на планшете и телефоне — строки), сведения о файле
 * и «Готово», нижняя панель (планшет, телефон), окна «Переименовать» и «Новая папка», контекстное меню.
 * Содержимое строит assets/js/file-manager.js по API Manager. Стили — assets/styles/file-manager.scss (собираются
 * со стилями админки)
 * @var string $fileManagerApi Адрес API (Manager::handleRequest())
 * @var string $fileManagerRoot Веб-путь корня файлов, например /uf
 * @var string $fileManagerAssets Веб-путь опубликованного каталога assets пакета
 * @var string $theme Тема админки: light или dark
 */

use Simflex\Core\Layout\Components\Common\Modal\Layout as Modal;
use Simflex\Core\Layout\Components\Common\Modal\ModalSize;
use Simflex\Core\Layout\Components\Common\Modal\ModalTheme;
use Simflex\Core\Layout\Components\UI\Core\Buttons\Button\ButtonSize;
use Simflex\Core\Layout\Components\UI\Core\Buttons\Button\ButtonStyle;
use Simflex\Core\Layout\Components\UI\Core\Buttons\Button\ButtonTheme;
use Simflex\Core\Layout\Components\UI\Core\Buttons\Button\Layout as Button;
use Simflex\Core\Layout\Components\UI\Core\Dropdown\DropdownSize;
use Simflex\Core\Layout\Components\UI\Core\Dropdown\DropdownTheme;
use Simflex\Core\Layout\Components\UI\Core\Dropdown\Layout as Dropdown;
use Simflex\Core\Layout\Components\UI\Core\TextInput\Layout as TextInput;
use Simflex\Core\Layout\Components\UI\Core\TextInput\TextInputSize;
use Simflex\Core\Layout\Components\UI\Core\TextInput\TextInputTheme;
use Simflex\Core\Layout\Components\UI\Core\Tooltip\Layout as Tooltip;
use Simflex\Core\Layout\Components\UI\Core\Tooltip\TooltipPosition;
use Simflex\Core\Layout\Components\UI\Core\Tooltip\TooltipTheme;
use Simflex\Core\Layout\LayoutManager;

LayoutManager::useStyle(dirname(__DIR__) . '/assets/styles/file-manager.scss');

$sprite = $fileManagerAssets . '/img/icons.svg';
$buttonTheme = ButtonTheme::from($theme);
/** Иконка набора file-icon */
$icon = fn(string $name, string $class = 'fm-icon') => '<svg class="' . $class . '" aria-hidden="true"><use href="'
    . htmlspecialchars($sprite) . '#fm-' . $name . '"></use></svg>';
/** Кнопка действия (file-tool) с подсказкой */
$tool = fn(string $name, string $label, string $action, string $extra = '') => Tooltip::drawTooltip(
    trigger: '<button type="button" class="file-tool" data-fm-action="' . $action . '" aria-label="' . $label . '"'
        . $extra . '>' . $icon($name) . '</button>',
    text: $label,
    position: TooltipPosition::Bottom,
    theme: TooltipTheme::from($theme),
);
/** Кнопка нижней панели (file-tabbar-item) */
$tab = fn(string $name, string $label, string $action) => '<button type="button" class="file-tabbar__item"'
    . ' data-fm-action="' . $action . '">' . $icon($name) . '<span>' . $label . '</span></button>';
/** Пункт контекстного меню */
$menuItem = fn(string $name, string $label, string $action, string $class = '') => '<button type="button"'
    . ' class="file-menu__item ' . $class . '" role="menuitem" data-fm-action="' . $action . '">' . $icon($name)
    . '<span>' . $label . '</span></button>';
/** Окно с полем имени: переименование, новая папка */
$nameModal = fn(string $id, string $title, string $action) => Modal::drawModal(
    id: $id,
    title: $title,
    content: TextInput::drawInput(
        placeholder: 'Название',
        labelText: 'Название',
        size: TextInputSize::Small,
        theme: TextInputTheme::from($theme),
        attributes: ['data-fm-name' => '', 'autocomplete' => 'off'],
    ),
    footer: Button::drawButton(
        text: 'Сохранить',
        size: ButtonSize::Small,
        theme: $buttonTheme,
        attributes: ['data-fm-action' => $action],
        iconLeft: 'check',
    ) . Button::drawButton(
        text: 'Отмена',
        style: ButtonStyle::Secondary,
        size: ButtonSize::Small,
        theme: $buttonTheme,
        attributes: ['data-modal-close' => ''],
    ),
    theme: ModalTheme::from($theme),
    className: 'file-modal',
);

$window = '<div class="file-window__head">'
    . '<nav class="file-window__crumbs" aria-label="Путь" data-fm-crumbs></nav>'
    . '<button type="button" class="file-tool file-window__close" data-modal-close aria-label="Закрыть">'
    . $icon('close') . '</button></div>'
    . '<div class="file-window__body">'
    . '<aside class="file-window__side">'
    . '<div class="file-window__tree" role="tree" aria-label="Папки" data-fm-tree></div>'
    . '<div class="file-window__tools">'
    . $tool('upload', 'Загрузить', 'upload')
    . $tool('folder-plus', 'Создать папку', 'create')
    . $tool('refresh', 'Обновить', 'refresh')
    . $tool('folder-x', 'Удалить папку', 'delete-folder', ' data-fm-delete-folder')
    . '</div></aside>'
    . '<div class="file-window__main">'
    . '<div class="file-window__toolbar">'
    . TextInput::drawInput(
        className: 'file-window__search',
        placeholder: 'Введите название файла',
        size: TextInputSize::Small,
        theme: TextInputTheme::from($theme),
        icon: 'search',
        attributes: ['data-fm-search' => '', 'aria-label' => 'Поиск по названию', 'type' => 'search'],
    )
    . Dropdown::drawSelect(
        name: '',
        options: ['name' => 'По названию', 'date' => 'По дате', 'size' => 'По размеру', 'type' => 'По типу'],
        value: 'name',
        size: DropdownSize::Small,
        theme: DropdownTheme::from($theme),
        className: 'file-window__sort',
        attributes: ['aria-label' => 'Сортировка'],
        inputAttributes: ['data-fm-sort' => ''],
    )
    . '</div>'
    . '<div class="file-window__board" data-fm-board>'
    . '<div class="file-window__files" role="listbox" aria-label="Файлы" data-fm-files></div>'
    . '<div class="file-window__state" data-fm-state hidden>' . $icon('folder', 'file-window__state-icon')
    . '<p class="file-window__state-title" data-fm-state-title></p>'
    . '<p class="file-window__state-text" data-fm-state-text></p></div>'
    . '</div>'
    . '<div class="file-window__bottom">'
    . '<div class="file-window__info" data-fm-info><p class="file-window__info-name" data-fm-info-name></p>'
    . '<p class="file-window__info-meta" data-fm-info-meta></p></div>'
    . Button::drawButton(
        className: 'file-window__done',
        text: 'Готово',
        size: ButtonSize::Small,
        theme: $buttonTheme,
        attributes: ['data-fm-action' => 'done'],
        iconLeft: 'check',
        disabled: true,
    )
    . '</div></div></div>'
    . '<div class="file-tabbar">'
    . $tab('back', 'Назад', 'back')
    . $tab('upload', 'Загрузить', 'upload')
    . $tab('folder-plus', 'Создать', 'create')
    . $tab('refresh', 'Обновить', 'refresh')
    . $tab('check', 'Готово', 'done')
    . '</div>'
    . '<div class="file-window__drop" data-fm-drop hidden>' . $icon('upload', 'file-window__drop-icon')
    . '<p>Отпустите файлы, чтобы загрузить их в эту папку</p></div>'
    . '<input class="file-window__input" type="file" multiple tabindex="-1" aria-hidden="true" data-fm-input>';
?>
<div class="file-manager" data-fm-api="<?= htmlspecialchars($fileManagerApi) ?>"
     data-fm-root="<?= htmlspecialchars($fileManagerRoot) ?>" data-fm-sprite="<?= htmlspecialchars($sprite) ?>">
    <?= Modal::drawModal(
        id: 'sf-file-manager',
        content: $window,
        size: ModalSize::Large,
        theme: ModalTheme::from($theme),
        className: 'file-window file-window-theme_' . $theme,
        attributes: ['aria-label' => 'Файловый менеджер'],
    ) ?>
    <?= $nameModal('sf-file-manager-rename', 'Переименовать', 'rename-save') ?>
    <?= $nameModal('sf-file-manager-create', 'Новая папка', 'create-save') ?>
    <div class="file-menu file-menu-theme_<?= $theme ?>" role="menu" data-fm-menu="file" hidden>
        <?= $menuItem('download', 'Скачать', 'download') ?>
        <?= $menuItem('edit', 'Переименовать', 'rename') ?>
        <?= $menuItem('link', 'Копировать путь', 'copy-path') ?>
        <hr class="file-menu__line">
        <?= $menuItem('trash', 'Удалить', 'delete', 'file-menu__item_danger') ?>
    </div>
    <div class="file-menu file-menu-theme_<?= $theme ?>" role="menu" data-fm-menu="folder" hidden>
        <?= $menuItem('folder', 'Открыть', 'open') ?>
        <?= $menuItem('edit', 'Переименовать', 'rename') ?>
        <?= $menuItem('folder-plus', 'Создать папку', 'create') ?>
        <?= $menuItem('link', 'Копировать путь', 'copy-path') ?>
        <hr class="file-menu__line">
        <?= $menuItem('trash', 'Удалить', 'delete', 'file-menu__item_danger') ?>
    </div>
</div>
