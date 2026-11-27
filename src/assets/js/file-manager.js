/**
 * Файловый менеджер Simflex (ES-модуль, без зависимостей): окна из tpl/index.tpl, данные — API Manager
 * (data-fm-api: ?method=getTree|getFileList|download|delete|createDir|rename|upload). Интерфейс свой, независимый
 * от админки (как редактор texted): окна — <dialog> (верхний слой: открытое последним всегда сверху), свои меню,
 * подсказка, подтверждение и тосты.
 *
 * Открытие: window.fileManager.open({multiple, accept, onSelect, onCancel, select}) — окно выбора файлов.
 * Выбранные файлы [{path, url, name, isImage}] (path — от корня файлов, url — с корнем, например /uf/images/a.png)
 * получает onSelect по «Готово»; закрытие без выбора (крестик, Esc, подложка, close(), новый open()) — onCancel.
 * На одно открытие — ровно один ответ. open() возвращает Promise: файлы по «Готово», null при отмене.
 * Режим выбора («Готово» доступно) — при onSelect или select: true; без них окно только для работы с файлами.
 * accept — какие файлы можно выбрать: массив расширений (['jpg', 'png']) или строка как у <input type=file accept>
 * ('image/*,.pdf'); остальные файлы видны, но неактивны, загрузить через окно можно только подходящие.
 * window.fileManager.init(callback) — прежний вызов (плагин TinyMCE fm): callback(path) одного файла.
 *
 * Работа в окне: клик по папке открывает её, по файлу — выбирает; несколько файлов и папки отмечаются галочкой
 * в углу карточки (видна при наведении), Ctrl/⌘+клик и Shift+клик; двойной клик или Enter по файлу — «Готово».
 * Правый клик или долгое нажатие — меню; перетаскивание файлов в окно — загрузка; Delete — удалить выбранное.
 */

const WINDOW_ID = 'sf-file-manager';
const LONG_PRESS = 500;
const MOBILE = '(max-width: 811px)';

const UPLOAD_ERRORS = {
    error: 'не загружен',
    forbidden: 'такой тип файла нельзя загрузить',
    error_save: 'не сохранён',
    too_large: 'слишком большой',
    bad_image: 'картинка повреждена или с посторонним кодом',
};

/** Что можно сжать при загрузке (Manager::COMPRESSED_IMAGES, COMPRESSED_VIDEOS); аудио не сжимается */
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const VIDEO_EXTENSIONS = ['mp4', 'm4v', 'mov', 'avi', 'mkv', 'webm', 'ogv'];
/** Запомненный ответ «сжимать или нет» — до конца работы (sessionStorage) */
const COMPRESS_KEY = 'sf-file-manager-compress';

const SORT_LABELS = {name: 'По названию', date: 'Дата изменения', size: 'Вес файла'};

/** Расширения для MIME-типов в accept (как у <input type=file accept>) */
const MIME_EXTENSIONS = {
    'image/*': ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'ico', 'tif', 'tiff', 'heic', 'svg'],
    'video/*': ['mp4', 'm4v', 'webm', 'ogv', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'mpg', 'mpeg', '3gp'],
    'audio/*': ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac'],
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png'],
    'image/gif': ['gif'],
    'image/webp': ['webp'],
    'image/avif': ['avif'],
    'image/svg+xml': ['svg'],
    'video/mp4': ['mp4', 'm4v'],
    'video/webm': ['webm'],
    'audio/mpeg': ['mp3'],
    'audio/wav': ['wav'],
    'application/pdf': ['pdf'],
};

/**
 * accept → множество расширений в нижнем регистре; null — подходит любой файл (accept не задан, '*' или '*\/*')
 * @param {string|string[]|null|undefined} accept
 * @returns {Set<string>|null}
 */
const parseAccept = (accept) => {
    if (accept === null || accept === undefined || accept === '') {
        return null;
    }
    const parts = (Array.isArray(accept) ? accept : String(accept).split(','))
        .map((part) => String(part).trim().toLowerCase())
        .filter(Boolean);
    if (!parts.length || parts.some((part) => part === '*' || part === '*/*')) {
        return null;
    }
    const extensions = new Set();
    parts.forEach((part) => (part.includes('/') ? MIME_EXTENSIONS[part] ?? [] : [part.replace(/^\./, '')])
        .forEach((extension) => extensions.add(extension)));
    return extensions;
};

/** Расширение имени в нижнем регистре: photo.JPG → jpg, без точки — пусто */
/** Сколько ждать поиска ссылок на файл (API usage), мс: дольше — «не удалось проверить» */
const USAGE_TIMEOUT = 15000;

const extensionOf = (name) => (name.includes('.') ? name.split('.').pop().toLowerCase() : '');
/** Последний элемент пути: /images/a.png → a.png */
const baseName = (path) => path.split('/').filter(Boolean).pop() ?? '';
/** Папка пути: /images/a.png → /images */
const parentPath = (path) => path.split('/').slice(0, -1).join('/');

/** Форма слова для числа: 1 элемент, 2 элемента, 5 элементов */
const plural = (count, forms) => {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) {
        return forms[0];
    }
    return mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? forms[1] : forms[2];
};

const root = document.querySelector('.file-manager');
const win = document.getElementById(WINDOW_ID);

if (root && win) {
    const api = root.dataset.fmApi;
    const filesRoot = root.dataset.fmRoot;
    const sprite = root.dataset.fmSprite;
    // системные папки (Manager::PROTECTED_DIRS): их нельзя удалить, переименовать и переместить
    const protectedDirs = new Set(JSON.parse(root.dataset.fmProtected || '[]'));
    const find = (selector) => win.querySelector(selector);
    const windowBox = find('.fm-window');
    const treeElement = find('[data-fm-tree]');
    const filesElement = find('[data-fm-files]');
    const boardElement = find('[data-fm-board]');
    const crumbsElement = find('[data-fm-crumbs]');
    const homeButton = find('.fm-crumbs__home');
    const searchInput = find('[data-fm-search]');
    const sortButton = find('[data-fm-sort]');
    const fileInput = find('[data-fm-input]');
    const dropElement = find('[data-fm-drop]');
    const tipBox = find('[data-fm-tip-box]');
    const renameDialog = document.getElementById('sf-file-manager-rename');
    const createDialog = document.getElementById('sf-file-manager-create');
    const confirmDialog = document.getElementById('sf-file-manager-confirm');
    const compressDialog = document.getElementById('sf-file-manager-compress');
    const moveDialog = document.getElementById('sf-file-manager-move');
    const toastsElement = root.querySelector('[data-fm-toasts]');
    const dialogs = [win, renameDialog, createDialog, confirmDialog, compressDialog, moveDialog];
    const menus = {};
    win.querySelectorAll('[data-fm-menu]').forEach((menu) => {
        menus[menu.dataset.fmMenu] = menu;
    });

    const state = {
        path: '',
        tree: [],
        expanded: new Set(),
        items: [],
        selected: new Set(),
        // от какого файла выделяется диапазон (Shift+клик)
        anchor: null,
        sort: 'name',
        // только что загруженные (style new) и не принятые сервером (style error) файлы
        added: new Set(),
        failed: [],
        uploading: [],
        multiple: false,
        // режим отметки: включает галочка (Ctrl/⌘, Shift, пробел), дальше клик по карточке отмечает её; выход —
        // «Отменить выбор», Esc или снятая последняя отметка
        checking: false,
        // режим выбора: «Готово» отдаёт файлы
        select: false,
        // расширения, которые можно выбрать (parseAccept), null — любые
        accept: null,
        // файлы, выбранные «Готово»: отдаются вызвавшему при закрытии окна
        result: null,
        // элемент, для которого открыто меню или окно имени
        target: null,
        loaded: false,
        // папка списка загружается
        loading: false,
        // номер последнего запроса дерева и отмена запроса списка (устаревшие ответы не применяются)
        treeRequest: 0,
        filesAbort: null,
        // папка для «Загрузить файлы» из меню папки (пока открыт выбор файлов)
        uploadPath: null,
    };

    /* ---------- разметка ---------- */

    const icon = (name, className = '') => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', `fm-icon${className ? ' ' + className : ''}`);
        svg.setAttribute('aria-hidden', 'true');
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', `${sprite}#fm-${name}`);
        svg.append(use);
        return svg;
    };

    const element = (tag, className = '', text = '') => {
        const node = document.createElement(tag);
        if (className) {
            node.className = className;
        }
        if (text !== '') {
            node.textContent = text;
        }
        return node;
    };

    /** Можно ли выбрать: папка — всегда, файл — если подходит под accept */
    const isAccepted = (item) => item.type === 'dir' || !state.accept || state.accept.has(extensionOf(item.name));

    /** Можно ли отметить: подходит и не системная папка (её нельзя ни удалить, ни переместить) */
    const isCheckable = (item) => isAccepted(item) && !protectedDirs.has(item.path);

    const getItem = (path) => state.items.find((item) => item.path === path)
        ?? {type: 'dir', path, name: baseName(path)};

    /* ---------- окна (<dialog>) ---------- */

    /**
     * Открывает окно поверх всех (верхний слой браузера). Окно админки (Common/Modal) делает остальную страницу
     * недоступной (inert) — вместе с менеджером, поэтому на время своих окон контейнер это снимает
     */
    const showDialog = (dialog) => {
        if (root.hasAttribute('inert')) {
            root.removeAttribute('inert');
            root.dataset.fmInert = '';
        }
        if (!dialog.open) {
            dialog.showModal();
        }
        dialog.classList.add('is-open');
    };

    const hideDialog = (dialog) => {
        if (dialog.open) {
            dialog.close();
        }
    };

    dialogs.forEach((dialog) => {
        dialog.addEventListener('close', () => {
            dialog.classList.remove('is-open');
            // все окна менеджера закрыты, а окно админки ещё открыто — контейнер снова недоступен, как был
            if (!dialogs.some((item) => item.open) && root.dataset.fmInert !== undefined) {
                delete root.dataset.fmInert;
                if (document.documentElement.classList.contains('modal-open')) {
                    root.setAttribute('inert', '');
                }
            }
        });
        // клик по подложке (вне карточки окна) и крестик — закрыть
        dialog.addEventListener('click', (event) => {
            if (event.target === dialog || event.target.closest('[data-fm-close]')) {
                hideDialog(dialog);
            }
        });
        // клавиши окна не доходят до страницы: Esc и Tab окна админки под менеджером не срабатывают.
        // Esc закрывает только это окно (в окне менеджера сначала меню): браузер иначе может закрыть
        // по одному Esc сразу несколько окон, открытых без нажатия пользователя
        dialog.addEventListener('keydown', (event) => {
            event.stopPropagation();
            if (event.key !== 'Escape' || event.defaultPrevented) {
                return;
            }
            event.preventDefault();
            if (dialog === win && Object.values(menus).some(isMenuOpen)) {
                closeMenus();
                sortButton.setAttribute('aria-expanded', 'false');
                return;
            }
            // в режиме отметки Esc сначала снимает отметки
            if (dialog === win && state.checking) {
                runAction('cancel-selection');
                return;
            }
            hideDialog(dialog);
        });
        // прочие запросы закрытия (жест «назад» на телефоне) — тоже только это окно
        dialog.addEventListener('cancel', (event) => {
            event.preventDefault();
            hideDialog(dialog);
        });
    });

    // экранная клавиатура телефона закрывает низ экрана: шторка окна поднимается над ней (--fm-keyboard)
    const keyboardOffset = () => {
        const viewport = window.visualViewport;
        const height = viewport ? Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)) : 0;
        dialogs.forEach((dialog) => dialog.style.setProperty('--fm-keyboard', `${height}px`));
    };
    window.visualViewport?.addEventListener('resize', keyboardOffset);
    window.visualViewport?.addEventListener('scroll', keyboardOffset);

    /** Подтверждение (Figma file-modal delfile, delfolder): Promise<boolean> */
    const confirmAction = (title, text, yesText = 'Удалить') => new Promise((resolve) => {
        confirmDialog.querySelector('[data-fm-title]').textContent = title;
        confirmDialog.querySelector('[data-fm-text]').textContent = text;
        const yes = confirmDialog.querySelector('[data-fm-action="confirm-yes"]');
        yes.textContent = yesText;
        // прошлое окно могли закрыть, пока шла проверка ссылок
        yes.disabled = false;
        let answer = false;
        const onYes = () => {
            answer = true;
            hideDialog(confirmDialog);
        };
        yes.addEventListener('click', onYes, {once: true});
        confirmDialog.addEventListener('close', () => {
            yes.removeEventListener('click', onYes);
            resolve(answer);
        }, {once: true});
        showDialog(confirmDialog);
        yes.focus({preventScroll: true});
    });

    /* ---------- тосты ---------- */

    const toast = (message, type = 'success') => {
        if (!toastsElement.showPopover) {
            window.alert(message);
            return;
        }
        // поверх всех открытых окон: показанный последним слой — верхний
        if (toastsElement.matches(':popover-open')) {
            toastsElement.hidePopover();
        }
        toastsElement.showPopover();
        // success — зелёный, error — красный, info — тёмный (Figma Feedback/toast)
        const item = element('div', `fm-toast fm-toast_${type}`, message);
        toastsElement.append(item);
        while (toastsElement.children.length > 3) {
            toastsElement.firstElementChild.remove();
        }
        setTimeout(() => {
            item.classList.add('is-closing');
            setTimeout(() => {
                item.remove();
                if (!toastsElement.children.length && toastsElement.matches(':popover-open')) {
                    toastsElement.hidePopover();
                }
            }, 160);
        }, type === 'error' ? 5000 : 3000);
    };

    const report = (error) => {
        if (error?.name !== 'AbortError') {
            toast(error?.message || 'Ошибка', 'error');
        }
    };

    /* ---------- подсказка ---------- */

    const hideTip = () => tipBox.classList.remove('is-visible');

    const showTip = (target) => {
        if (target.getAttribute('aria-expanded') === 'true' || target.disabled
            || Object.values(menus).some(isMenuOpen)) {
            return;
        }
        tipBox.querySelector('[data-fm-tip-text]').textContent = target.dataset.fmTip;
        const rect = target.getBoundingClientRect();
        const tip = tipBox.getBoundingClientRect();
        const left = Math.max(8, Math.min(rect.left + rect.width / 2 - tip.width / 2, window.innerWidth - tip.width - 8));
        tipBox.style.left = `${left}px`;
        tipBox.style.top = `${rect.bottom + 4}px`;
        tipBox.style.setProperty('--corner-x', `${rect.left + rect.width / 2 - left - 4}px`);
        tipBox.classList.add('is-visible');
    };

    win.addEventListener('mouseover', (event) => {
        const target = event.target.closest('[data-fm-tip]');
        if (target && !target.contains(event.relatedTarget)) {
            showTip(target);
        }
    });
    win.addEventListener('mouseout', (event) => {
        const target = event.target.closest('[data-fm-tip]');
        if (target && !target.contains(event.relatedTarget)) {
            hideTip();
        }
    });
    // нажатие прячет подсказку сразу (не висит после клика)
    win.addEventListener('mousedown', hideTip, true);

    /* ---------- меню ---------- */

    /** Меню открыто (не закрывается) */
    const isMenuOpen = (menu) => !menu.hidden && !menu.classList.contains('is-closing');

    /** Закрыть меню плавно: гаснет 120 мс, потом hidden */
    const closeMenus = () => {
        Object.values(menus).forEach((menu) => {
            if (!isMenuOpen(menu)) {
                return;
            }
            menu.classList.add('is-closing');
            clearTimeout(menu.closeTimer);
            menu.closeTimer = setTimeout(() => {
                menu.hidden = true;
                menu.classList.remove('is-closing');
            }, 120);
        });
        sortButton.setAttribute('aria-expanded', 'false');
    };

    /** Меню у точки (x, y): под ней, уголок на x; не помещается снизу — над ней */
    const openMenu = (menu, x, y, {focus = true} = {}) => {
        closeMenus();
        hideTip();
        clearTimeout(menu.closeTimer);
        menu.classList.remove('fm-pop_up', 'is-closing');
        menu.hidden = false;
        const rect = menu.getBoundingClientRect();
        const left = Math.max(8, Math.min(x - 28, window.innerWidth - rect.width - 8));
        let top = y + 4;
        if (top + rect.height > window.innerHeight - 8) {
            top = Math.max(8, y - rect.height - 4);
            menu.classList.add('fm-pop_up');
        }
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
        menu.style.setProperty('--corner-x', `${Math.max(16, Math.min(x - left - 4, rect.width - 24))}px`);
        if (focus) {
            (menu.querySelector('[aria-checked="true"]') ?? menu.querySelector('.fm-item'))?.focus({preventScroll: true});
        }
    };

    const openItemMenu = (item, x, y) => {
        state.target = item;
        // в режиме отметки меню не сбрасывает отмеченное
        if (item.type === 'file' && !state.selected.has(item.path) && isAccepted(item) && !state.checking) {
            selectOnly(item.path);
        }
        const menu = menus[item.type === 'dir' ? 'folder' : 'file'];
        // у системной папки нет «Выбрать», «Переименовать», «Переместить» и «Удалить»
        const isProtected = protectedDirs.has(item.path);
        menu.querySelectorAll('[data-fm-action="select-item"], [data-fm-action="rename"], [data-fm-action="move"], '
            + '[data-fm-action="delete"]')
            .forEach((menuItem) => {
                menuItem.hidden = isProtected;
            });
        menu.querySelector('.fm-pop__line').hidden = isProtected;
        openMenu(menu, x, y);
    };

    // стрелки ходят по пунктам открытого меню
    win.addEventListener('keydown', (event) => {
        const menu = Object.values(menus).find(isMenuOpen);
        if (!menu || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            return;
        }
        event.preventDefault();
        const items = [...menu.querySelectorAll('.fm-item')];
        const index = items.indexOf(document.activeElement);
        const next = {
            ArrowDown: (index + 1) % items.length,
            ArrowUp: (index - 1 + items.length) % items.length,
            Home: 0,
            End: items.length - 1,
        }[event.key];
        items[next]?.focus();
    });

    /* ---------- API ---------- */

    /** Запрос к API: изменяющие — POST с CSRF-токеном */
    const call = async (method, params = {}, files = null, signal = undefined) => {
        const isModifying = ['delete', 'createDir', 'rename', 'move', 'upload'].includes(method);
        let url = `${api}?method=${method}`;
        let options = {credentials: 'same-origin', headers: {'X-Requested-With': 'XMLHttpRequest'}, signal};
        if (isModifying) {
            // CSRF-токен сессии админки: без него сервер изменяющий запрос не принимает
            options.headers['X-CSRF-Token'] = document.querySelector('meta[name="csrf-token"]')?.content ?? '';
            const body = new FormData();
            // список — как key[] (PHP соберёт массив)
            Object.entries(params).forEach(([key, value]) => (Array.isArray(value)
                ? value.forEach((part) => body.append(`${key}[]`, part))
                : body.append(key, value)));
            (files ?? []).forEach((file) => body.append('file[]', file));
            // путь — и в адресе: Manager читает $_REQUEST, а размер тела проверяет до разбора
            url += `&path=${encodeURIComponent(params.path ?? '')}`;
            options = {...options, method: 'POST', body};
        } else {
            url += '&' + new URLSearchParams(params).toString();
        }
        const response = await fetch(url, options);
        let json = null;
        try {
            json = await response.json();
        } catch (e) {
            // тело не JSON: ошибка сервера без конверта
        }
        if (!response.ok || !json || json.error?.code) {
            throw new Error(json?.error?.message || 'Ошибка');
        }
        // конверт: список — в items, пустой ответ — без ключей
        return json.items ?? [];
    };

    /* ---------- дерево ---------- */

    const drawTree = (nodes, depth = 0) => {
        const list = element('ul');
        list.setAttribute('role', depth ? 'group' : 'none');
        nodes.forEach((node) => {
            const item = element('li');
            item.setAttribute('role', 'none');
            // по уровням: стрелка — только если вложенные папки есть (has_children), пустую не раскрыть
            const hasChildren = node.has_children ?? (node.data?.length > 0);
            const isOpen = hasChildren && state.expanded.has(node.path);
            const row = element('button', 'fm-tree-row');
            row.type = 'button';
            row.setAttribute('role', 'treeitem');
            row.dataset.fmPath = node.path;
            row.dataset.fmKind = 'dir';
            row.style.setProperty('--depth', String(depth));
            if (hasChildren) {
                row.setAttribute('aria-expanded', String(isOpen));
            }
            if (node.path === state.path) {
                row.setAttribute('aria-current', 'true');
            }
            const toggle = element('span', 'fm-tree-row__toggle');
            if (hasChildren) {
                toggle.dataset.fmToggle = '';
                toggle.append(icon('forward', 'fm-icon_16'));
            }
            row.append(toggle, icon('folder', 'fm-icon_16'), element('span', 'fm-tree-row__name', node.name));
            item.append(row);
            if (isOpen && node.data?.length) {
                const group = drawTree(node.data, depth + 1);
                // только что раскрытая ветка появляется плавно
                if (node.path === state.justExpanded) {
                    group.classList.add('fm-tree__group_in');
                }
                item.append(group);
            }
            list.append(item);
        });
        return list;
    };

    const renderTree = () => {
        treeElement.replaceChildren(drawTree(state.tree));
        // плавно — только в момент раскрытия, при следующих перерисовках ветка уже на месте
        state.justExpanded = null;
    };

    const findNode = (nodes, path) => {
        for (const node of nodes ?? []) {
            if (node.path === path) {
                return node;
            }
            if (path.startsWith(node.path + '/')) {
                return findNode(node.data, path);
            }
        }
        return null;
    };

    /** Раскрытые папки по глубине: родитель раньше вложенной */
    const expandedPaths = () => [...state.expanded].sort((a, b) => a.split('/').length - b.split('/').length);

    /**
     * Дерево по уровням: корень и раскрытые папки — по одному уровню (getTree depth=1), а не весь каталог файлов.
     * Ответ устаревшего запроса не применяется
     */
    const loadTree = async () => {
        const request = ++state.treeRequest;
        const paths = expandedPaths();
        const [rootLevel, ...levels] = await Promise.all([
            call('getTree', {path: '', depth: 1}),
            ...paths.map((path) => call('getTree', {path, depth: 1}).catch(() => null)),
        ]);
        if (request !== state.treeRequest) {
            return;
        }
        const children = new Map(paths.map((path, index) => [path, levels[index]]));
        const attach = (nodes) => nodes.forEach((node) => {
            node.data = children.get(node.path) ?? null;
            if (node.data) {
                attach(node.data);
            }
        });
        attach(rootLevel);
        state.tree = rootLevel;
        renderTree();
    };

    /** Догружает вложенные папки раскрытых узлов, которых ещё нет */
    const loadMissingLevels = async () => {
        for (const path of expandedPaths()) {
            const node = findNode(state.tree, path);
            if (node && node.data === null && node.has_children) {
                const request = state.treeRequest;
                const data = await call('getTree', {path, depth: 1}).catch(() => []);
                if (request !== state.treeRequest) {
                    return;
                }
                node.data = data;
                // подгруженный уровень появляется плавно
                state.justExpanded = path;
                renderTree();
            }
        }
    };

    /* ---------- крошки ---------- */

    const renderCrumbs = () => {
        // в корне «домой» отмечена: видно, где находишься
        if (state.path === '') {
            homeButton.setAttribute('aria-current', 'true');
        } else {
            homeButton.removeAttribute('aria-current');
        }
        const parts = state.path.split('/').filter(Boolean);
        const nodes = [];
        parts.forEach((name, index) => {
            nodes.push(element('span', 'fm-crumbs__sep', '/'));
            const isLast = index === parts.length - 1;
            const crumb = element(isLast ? 'span' : 'button', 'fm-crumbs__item', name);
            if (isLast) {
                crumb.setAttribute('aria-current', 'page');
            } else {
                crumb.type = 'button';
                crumb.dataset.fmPath = '/' + parts.slice(0, index + 1).join('/');
            }
            nodes.push(crumb);
        });
        crumbsElement.replaceChildren(...nodes);
        crumbsElement.scrollLeft = crumbsElement.scrollWidth;
    };

    /* ---------- файлы ---------- */

    const compare = {
        name: (a, b) => a.name.localeCompare(b.name, 'ru', {numeric: true}),
        date: (a, b) => (b.mtime ?? 0) - (a.mtime ?? 0),
        size: (a, b) => (b.bytes ?? 0) - (a.bytes ?? 0),
    };

    const getVisibleItems = () => {
        const query = searchInput.value.trim().toLowerCase();
        const sort = compare[state.sort] ?? compare.name;
        return state.items
            .filter((item) => query === '' || item.name.toLowerCase().includes(query))
            // папки — первыми
            .sort((a, b) => (a.type === b.type ? sort(a, b) : (a.type === 'dir' ? -1 : 1)));
    };

    const sizeText = (item) => (item.type === 'dir'
        ? `${item.count} ${plural(item.count, ['элемент', 'элемента', 'элементов'])}`
        : `${Number(item.size).toLocaleString('ru-RU')} ${item.size_ext}`);

    const drawCard = (item, style = 'default') => {
        const card = element('div', 'fm-card');
        card.setAttribute('role', 'option');
        if (style !== 'default') {
            card.classList.add(`fm-card_${style}`);
        }
        const preview = element('span', 'fm-card__preview');
        if (style === 'uploading') {
            preview.append(element('span', 'fm-spinner'));
        } else if (style === 'error') {
            preview.append(icon('close'));
        } else if (item.type === 'dir') {
            preview.append(icon('folder'));
        } else if (item.is_pic) {
            const image = element('img', 'fm-card__image');
            image.src = filesRoot + item.path;
            image.alt = '';
            image.loading = 'lazy';
            image.decoding = 'async';
            image.draggable = false;
            preview.append(image);
        } else {
            preview.append(icon('file'));
        }
        if (item.path) {
            card.dataset.fmPath = item.path;
            card.dataset.fmKind = item.type;
            card.tabIndex = -1;
            if (!isAccepted(item)) {
                card.classList.add('fm-card_disabled');
                card.setAttribute('aria-disabled', 'true');
            } else if (isCheckable(item)) {
                const check = element('button', 'fm-card__check');
                check.type = 'button';
                check.tabIndex = -1;
                check.setAttribute('aria-label', `Отметить «${item.name}»`);
                check.append(icon('checkbox-off'));
                // в карточке, а не в превью: на телефоне галочка стоит слева от превью (Figma file-card-mobile)
                card.append(check);
            }
            preview.append(element('span', 'fm-card__badge', sizeText(item)));
        }
        card.append(preview, element('span', 'fm-card__name', item.name));
        card.title = item.name;
        card.append(element('span', 'fm-card__date', style === 'error' ? item.error : (item.edited ?? '')));
        card.append(element('span', 'fm-card__weight', item.path ? sizeText(item) : ''));
        applySelection(card);
        return card;
    };

    /** Выбор на карточке без перерисовки: aria-selected и галочка */
    const applySelection = (card) => {
        const path = card.dataset.fmPath;
        if (!path) {
            return;
        }
        const isSelected = state.selected.has(path);
        card.setAttribute('aria-selected', String(isSelected));
        // галочка стоит только в режиме отметки: одиночный выбор кликом её не ставит
        card.querySelector('.fm-card__check use')?.setAttribute('href', `${sprite}#fm-checkbox-${isSelected && state.checking ? 'on' : 'off'}`);
    };

    const updateSelection = () => {
        if (!state.selected.size) {
            state.checking = false;
        }
        filesElement.classList.toggle('fm-files_multi', state.checking);
        windowBox.classList.toggle('fm-window_checking', state.checking);
        filesElement.querySelectorAll('.fm-card[data-fm-path]').forEach(applySelection);
        renderInfo();
    };

    const renderState = (visible) => {
        const stateElement = find('[data-fm-state]');
        const isEmpty = !visible.length && !state.uploading.length && !state.failed.length;
        stateElement.hidden = !state.loading && !isEmpty;
        stateElement.classList.toggle('fm-loading', state.loading);
        stateElement.querySelector('[data-fm-state-marker]').hidden = state.loading;
        stateElement.querySelector('.fm-spinner')?.remove();
        if (state.loading) {
            stateElement.prepend(element('span', 'fm-spinner'));
        }
        const isSearch = searchInput.value.trim() !== '';
        // тексты — Figma file-window empty, no-results; на телефоне перетаскивать некуда — кнопка внизу
        find('[data-fm-state-title]').textContent = state.loading ? '' : (isSearch ? 'Ничего не найдено' : 'В папке пока нет файлов');
        find('[data-fm-state-text]').textContent = state.loading ? '' : (isSearch
            ? 'Попробуйте изменить запрос.'
            : (mobile.matches ? 'Загрузите файлы кнопкой внизу.' : 'Загрузите файлы или перетащите их сюда.'));
    };

    const renderInfo = () => {
        const selected = state.items.filter((item) => state.selected.has(item.path));
        const name = find('[data-fm-info-name]');
        const meta = find('[data-fm-info-meta]');
        if (selected.length > 1 || (state.checking && selected.length)) {
            name.textContent = `Выбрано: ${selected.length}`;
            // окно открыто для одного файла (поле картинки): вставить можно только один
            meta.textContent = state.select && !state.multiple && selected.filter((item) => item.type === 'file').length > 1
                ? 'Для вставки выберите один файл'
                : '';
        } else if (selected.length === 1) {
            const [item] = selected;
            name.textContent = item.name;
            meta.textContent = item.type === 'dir'
                ? [sizeText(item), item.edited && `Изменена: ${item.edited}`].filter(Boolean).join('   ')
                : [`Вес: ${sizeText(item)}`, item.dimensions && `Размер: ${item.dimensions.replace('x', '×').replace('px', ' px')}`,
                    `Изменён: ${item.edited}`].filter(Boolean).join('   ');
        } else {
            // Figma: «Файл не выбран» в режиме выбора
            name.textContent = state.select ? 'Файл не выбран' : '';
            meta.textContent = '';
        }
        name.classList.toggle('fm-info__empty', !selected.length);
        const files = selected.filter((item) => item.type === 'file' && isAccepted(item));
        const isDoneDisabled = !state.select || !files.length || (!state.multiple && files.length > 1);
        win.querySelectorAll('[data-fm-action="done"]').forEach((button) => {
            button.disabled = isDoneDisabled;
        });
        find('[data-fm-delete-folder]').disabled = state.path === '' || protectedDirs.has(state.path);
    };

    /** @param {boolean} animate Карточки появляются мягко (после загрузки папки), а не при каждом выборе */
    const renderFiles = (animate = false) => {
        const visible = state.loading ? [] : getVisibleItems();
        filesElement.classList.toggle('fm-files_in', animate);
        filesElement.setAttribute('aria-multiselectable', 'true');
        filesElement.setAttribute('aria-busy', String(state.loading));
        filesElement.replaceChildren(
            ...state.uploading.map((name) => drawCard({name}, 'uploading')),
            ...state.failed.map((item) => drawCard(item, 'error')),
            ...visible.map((item) => drawCard(item, state.added.has(item.path) ? 'new' : 'default')),
        );
        if (animate) {
            [...filesElement.children].forEach((card, index) => card.style.setProperty('--i', String(index)));
        }
        updateSelection();
        renderState(visible);
    };

    /* ---------- загрузка данных ---------- */

    /** Список папки: прежний запрос отменяется, ответ для другой папки не применяется (быстрые клики) */
    const loadFiles = async ({quiet = false} = {}) => {
        const path = state.path;
        state.filesAbort?.abort();
        const abort = new AbortController();
        state.filesAbort = abort;
        if (!quiet) {
            // сразу пусто и загрузка, а не прежняя папка под новыми крошками
            state.loading = true;
            state.items = [];
            renderFiles();
        }
        let items;
        try {
            items = await call('getFileList', {path, include_dirs: 1}, null, abort.signal);
        } catch (error) {
            if (abort.signal.aborted) {
                return;
            }
            state.loading = false;
            renderFiles();
            throw error;
        }
        if (abort.signal.aborted || path !== state.path) {
            return;
        }
        state.loading = false;
        state.items = items;
        // выбор остаётся только у существующих
        const paths = new Set(items.map((item) => item.path));
        state.selected = new Set([...state.selected].filter((item) => paths.has(item)));
        renderFiles(!quiet);
    };

    const navigate = async (path) => {
        closeMenus();
        state.path = path;
        state.selected.clear();
        state.checking = false;
        state.anchor = null;
        state.failed = [];
        searchInput.value = '';
        // путь до папки и сама папка раскрыты в дереве: её вложенные папки видны сразу (только что раскрытая —
        // плавно)
        const parts = path.split('/').filter(Boolean);
        const isNewlyExpanded = path !== '' && !state.expanded.has(path);
        parts.forEach((part, index) => state.expanded.add('/' + parts.slice(0, index + 1).join('/')));
        state.justExpanded = isNewlyExpanded ? path : null;
        renderCrumbs();
        renderTree();
        loadMissingLevels().catch(report);
        try {
            await loadFiles();
        } catch (error) {
            report(error);
        }
    };

    /** Перечитать дерево и список без мигания (после действия) */
    const refresh = async () => {
        try {
            await Promise.all([loadTree(), loadFiles({quiet: true})]);
        } catch (error) {
            report(error);
        }
    };

    /* ---------- выбор ---------- */

    const selectOnly = (path) => {
        state.checking = false;
        state.selected = new Set([path]);
        state.anchor = path;
        updateSelection();
    };

    /**
     * Отметить или снять отметку. Вне режима отметки галочка пустая и у выбранного кликом файла — нажатие на неё
     * отмечает этот файл (а не снимает выбор) и включает режим; Ctrl/⌘ (keep) оставляет и выбранный кликом
     */
    const toggleSelect = (path, {keep = false} = {}) => {
        if (!isCheckable(getItem(path))) {
            return;
        }
        if (!state.checking) {
            state.selected = new Set(keep ? [...state.selected, path] : [path]);
            state.anchor = path;
            state.checking = true;
            updateSelection();
            return;
        }
        state.selected.has(path) ? state.selected.delete(path) : state.selected.add(path);
        state.anchor = path;
        state.checking = state.selected.size > 0;
        updateSelection();
    };

    /** Shift+клик: от прежнего до этого по видимому порядку */
    const selectRange = (path) => {
        const visible = getVisibleItems().filter(isCheckable).map((item) => item.path);
        const from = visible.indexOf(state.anchor);
        const to = visible.indexOf(path);
        if (from < 0 || to < 0) {
            selectOnly(path);
            return;
        }
        visible.slice(Math.min(from, to), Math.max(from, to) + 1).forEach((item) => state.selected.add(item));
        state.checking = true;
        updateSelection();
    };

    /** «Готово»: выбранные подходящие файлы уходят вызвавшему, когда окно закроется */
    const done = () => {
        const files = state.items.filter((item) => item.type === 'file' && state.selected.has(item.path) && isAccepted(item));
        if (!files.length || !state.select) {
            return;
        }
        state.result = files.map((item) => ({path: item.path, url: filesRoot + item.path, name: item.name, isImage: Boolean(item.is_pic)}));
        hideDialog(win);
    };

    /** Двойной клик или Enter по файлу: выбрать только его и сразу «Готово» */
    const pick = (path) => {
        if (!isAccepted(getItem(path))) {
            return;
        }
        state.selected = new Set([path]);
        done();
    };

    /* ---------- действия ---------- */

    /**
     * Где на сайте стоят ссылки на элементы (API usage): «в 3 записях (content, menu)», пусто — нигде.
     * Ссылка на папку — ссылка на что-то в ней
     */
    const usageText = async (items) => {
        // ответ дольше USAGE_TIMEOUT — проверка не удалась (кнопка действия не ждёт бесконечно)
        const timeout = new Promise((resolve) => setTimeout(() => resolve(null), USAGE_TIMEOUT));
        const results = await Promise.all(items.map((item) => Promise.race([
            call('usage', {path: item.path}).catch(() => null),
            timeout,
        ])));
        const tables = new Map();
        results.filter(Boolean).flat().forEach(({table, count}) => tables.set(table, (tables.get(table) ?? 0) + count));
        const total = [...tables.values()].reduce((sum, count) => sum + count, 0);
        return {
            text: total
                ? `в ${total} ${plural(total, ['записи', 'записях', 'записях'])} (${[...tables.keys()].join(', ')})`
                : '',
            isFailed: results.includes(null),
        };
    };

    /**
     * Предупреждение в окне: ссылки перестанут работать. Окно открыто сразу; пока сервер ищет ссылки, кнопка
     * действия недоступна (setBusy) — удалить, переименовать или переместить до предупреждения нельзя. Проверка
     * не удалась — тоже предупреждение
     * @param {string} actionName Действие в родительном падеже: «удаления», «переименования», «перемещения»
     * @param {function(boolean): void} setBusy Кнопка действия: true — недоступна, false — снова доступна
     */
    const warnUsage = (dialog, items, actionName, setBusy) => {
        const warning = dialog.querySelector('[data-fm-warning]');
        warning.textContent = 'Проверяем, есть ли ссылки на страницах сайта…';
        warning.dataset.fmState = 'checking';
        warning.hidden = false;
        setBusy(true);
        const request = Symbol('usage');
        dialog.usageRequest = request;
        return usageText(items).then(({text, isFailed}) => {
            if (!dialog.open || dialog.usageRequest !== request) {
                return;
            }
            setBusy(false);
            const what = items.length > 1 ? 'них' : (items[0].type === 'dir' ? 'файлы папки' : 'файл');
            delete warning.dataset.fmState;
            if (text) {
                warning.textContent = `Ссылки на ${what} есть ${text}. После ${actionName} они перестанут работать.`;
            } else if (isFailed) {
                warning.textContent = `Не удалось проверить ссылки на ${what}: если они есть на страницах, после `
                    + `${actionName} перестанут работать.`;
            } else {
                warning.hidden = true;
            }
        });
    };

    /** Окно имени: rename — прежнее имя в «Старое название» и в поле, create — пустое поле */
    const openNameDialog = (dialog, value) => {
        const input = dialog.querySelector('[data-fm-name]');
        const oldName = dialog.querySelector('[data-fm-old-name]');
        if (oldName) {
            oldName.value = value;
        }
        input.value = value;
        showDialog(dialog);
        // без прокрутки: окно ещё выезжает (шторка снизу), прокрутка сдвинула бы его содержимое
        input.focus({preventScroll: true});
        // имя без расширения выделено: обычно меняют его
        const dot = value.lastIndexOf('.');
        input.setSelectionRange(0, dot > 0 ? dot : value.length);
    };

    const saveName = async (dialog, method) => {
        // кнопка недоступна (идёт проверка ссылок) — Enter тоже не сохраняет
        if (dialog.querySelector('.fm-modal__footer [data-fm-action]').disabled) {
            return;
        }
        const input = dialog.querySelector('[data-fm-name]');
        const name = input.value.trim();
        if (name === '') {
            input.focus();
            return;
        }
        const target = state.target;
        try {
            if (method === 'rename') {
                if (name === target.name) {
                    hideDialog(dialog);
                    return;
                }
                await call('rename', {path: target.path, name});
                // переименованная открытая папка — новый путь
                if (target.type === 'dir' && (state.path === target.path || state.path.startsWith(target.path + '/'))) {
                    state.path = parentPath(target.path) + '/' + name + state.path.slice(target.path.length);
                    renderCrumbs();
                }
                toast(target.type === 'dir' ? 'Папка переименована' : 'Файл переименован');
            } else {
                const parent = target?.path ?? state.path;
                await call('createDir', {path: parent, name});
                toast(`Папка «${name}» создана`);
                // «Новая папка» в окне «Переместить»: сразу в неё
                if (moveDialog.open) {
                    moveBrowse(`${parent}/${name}`);
                }
            }
            hideDialog(dialog);
            await refresh();
        } catch (error) {
            report(error);
        }
    };

    /** Системная папка среди элементов — сообщение и true (действие не выполняется) */
    const hasProtected = (items, actionName) => {
        const item = items.find((candidate) => protectedDirs.has(candidate.path));
        if (item) {
            toast(`Системную папку «${item.name}» нельзя ${actionName}`, 'error');
        }
        return Boolean(item);
    };

    /** Имена для подтверждения: «a.png», «b.png» и ещё 3 */
    const namesText = (items) => {
        const names = items.slice(0, 3).map((item) => `«${item.name}»`).join(', ');
        const rest = items.length - 3;
        return rest > 0 ? `${names} и ещё ${rest}` : names;
    };

    const remove = async (items) => {
        // окно подтверждения уже открыто (повторный Delete) — второй раз не спрашиваем и не удаляем
        if (!items.length || confirmDialog.open || hasProtected(items, 'удалить')) {
            return;
        }
        // тексты — Figma file-modal (delfolder, delfile); всегда видно, что именно удалится
        const isFolder = items.length === 1 && items[0].type === 'dir';
        const hasFolders = items.some((item) => item.type === 'dir');
        const [title, text] = items.length > 1
            ? ['Удалить выбранное?', `Будет удалено: ${items.length} — ${namesText(items)}.`
                + (hasFolders ? ' Папки — вместе со всем, что в них.' : '') + ' Всё удалится сразу.']
            : (isFolder
                ? ['Удалить папку?', `Папка «${items[0].name}» и всё, что в ней, будут удалены сразу.`]
                : ['Удалить файл?', `Файл «${items[0].name}» будет удалён сразу.`]);
        const confirmed = confirmAction(title, text);
        const yes = confirmDialog.querySelector('[data-fm-action="confirm-yes"]');
        warnUsage(confirmDialog, items, 'удаления', (isBusy) => {
            yes.disabled = isBusy;
            if (!isBusy) {
                yes.focus({preventScroll: true});
            }
        });
        if (!await confirmed) {
            return;
        }
        const deleted = [];
        try {
            for (const item of items) {
                await call('delete', {path: item.path});
                deleted.push(item);
            }
            toast(items.length > 1 ? `Удалено: ${deleted.length}` : (isFolder ? 'Папка удалена' : 'Файл удалён'));
        } catch (error) {
            // несколько: какие уже удалены, а какой нет
            const failed = items[deleted.length];
            toast(items.length > 1
                ? `Удалено ${deleted.length} из ${items.length}. «${failed.name}»: ${error.message || 'ошибка'}`
                : error.message || 'Ошибка', 'error');
        }
        const removedDir = deleted.find((item) => item.type === 'dir' && (state.path === item.path || state.path.startsWith(item.path + '/')));
        state.selected.clear();
        if (removedDir) {
            await navigate(parentPath(removedDir.path));
            loadTree().catch(report);
        } else {
            await refresh();
        }
    };

    /* ---------- перемещение ---------- */

    /** Что перемещается, из какой папки, какая папка открыта в окне выбора; номер запроса — устаревший не рисуется */
    const moving = {items: [], from: '', path: '', request: 0, isChecking: false};

    /** Папка — одна из перемещаемых или внутри неё: туда нельзя */
    const isMovedPath = (path) => moving.items.some((item) => item.type === 'dir'
        && (path === item.path || path.startsWith(item.path + '/')));

    /** Путь в окне выбора: «Корень / images / company», последний — открытая папка; «сюда» — не в ту же папку */
    const renderMovePath = () => {
        const parts = moving.path.split('/').filter(Boolean);
        const crumbs = [{name: 'Корень', path: ''},
            ...parts.map((name, index) => ({name, path: '/' + parts.slice(0, index + 1).join('/')}))];
        const nodes = [];
        crumbs.forEach((crumb, index) => {
            if (index) {
                nodes.push(element('span', 'fm-move__sep', '/'));
            }
            const isLast = index === crumbs.length - 1;
            const node = element(isLast ? 'span' : 'button', 'fm-move__crumb', crumb.name);
            if (isLast) {
                node.setAttribute('aria-current', 'location');
            } else {
                node.type = 'button';
                node.dataset.fmMoveTo = crumb.path;
            }
            nodes.push(node);
        });
        if (moving.path === moving.from) {
            nodes.push(element('span', 'fm-move__here', 'сейчас здесь'));
        }
        const pathElement = moveDialog.querySelector('[data-fm-move-path]');
        pathElement.replaceChildren(...nodes);
        // длинный путь — виден конец
        pathElement.scrollLeft = pathElement.scrollWidth;
        moveDialog.querySelector('[data-fm-move-back]').disabled = moving.path === '';
        // пока ищутся ссылки на перемещаемое — тоже недоступна
        moveDialog.querySelector('[data-fm-action="move-here"]').disabled = moving.path === moving.from
            || moving.isChecking;
    };

    /** Открыть папку в окне выбора: её вложенные папки (getTree depth=1) */
    const moveBrowse = async (path) => {
        moving.path = path;
        renderMovePath();
        const list = moveDialog.querySelector('[data-fm-move-list]');
        const request = ++moving.request;
        list.classList.add('is-loading');
        let nodes = [];
        try {
            nodes = await call('getTree', {path, depth: 1});
        } catch (error) {
            report(error);
        }
        if (request !== moving.request) {
            return;
        }
        const rows = nodes.map((node) => {
            const row = element('button', 'fm-move__row');
            row.type = 'button';
            row.dataset.fmMoveTo = node.path;
            row.append(icon('folder'), element('span', 'fm-move__name', node.name));
            if (isMovedPath(node.path)) {
                row.disabled = true;
                row.append(element('span', 'fm-move__note', 'перемещается'));
            } else {
                row.append(icon('forward', 'fm-icon_16 fm-move__arrow'));
            }
            return row;
        });
        list.replaceChildren(...(rows.length ? rows : [element('p', 'fm-move__empty', 'Вложенных папок нет')]));
        list.classList.remove('is-loading');
        list.scrollTop = 0;
        // уровень сменяется плавно
        list.classList.remove('fm-move__list_in');
        void list.offsetWidth;
        list.classList.add('fm-move__list_in');
    };

    /** «Переместить»: окно выбора папки, открыто там, где элементы лежат сейчас */
    const openMove = (items) => {
        if (!items.length || hasProtected(items, 'переместить')) {
            return;
        }
        moving.items = items;
        moving.from = parentPath(items[0].path);
        moveDialog.querySelector('[data-fm-text]').textContent = items.length > 1
            ? `Выбрано: ${items.length}. Откройте папку, куда их переместить.`
            : `Откройте папку, куда переместить ${items[0].type === 'dir' ? 'папку' : 'файл'} «${items[0].name}».`;
        showDialog(moveDialog);
        moveBrowse(moving.from);
        warnUsage(moveDialog, items, 'перемещения', (isBusy) => {
            moving.isChecking = isBusy;
            renderMovePath();
        });
        moveDialog.querySelector('[data-fm-move-back]').focus({preventScroll: true});
    };

    const moveHere = async () => {
        const {items, path} = moving;
        const button = moveDialog.querySelector('[data-fm-action="move-here"]');
        if (path === moving.from || isMovedPath(path) || button.disabled) {
            return;
        }
        button.disabled = true;
        let isMoved = false;
        try {
            const moved = await call('move', {path, items: items.map((item) => item.path)});
            isMoved = true;
            hideDialog(moveDialog);
            toast(items.length > 1
                ? `Перемещено: ${moved.length}`
                : (items[0].type === 'dir' ? 'Папка перемещена' : 'Файл перемещён'));
        } catch (error) {
            report(error);
            button.disabled = false;
        }
        // открытая папка была внутри перемещённой (меню папки в дереве) — открыть её на новом месте
        const dir = items.find((item) => item.type === 'dir' && (state.path === item.path || state.path.startsWith(item.path + '/')));
        if (isMoved && dir) {
            await navigate(`${path}/${dir.name}${state.path.slice(dir.path.length)}`);
            loadTree().catch(report);
            return;
        }
        if (isMoved) {
            state.selected.clear();
            state.checking = false;
        }
        // и при ошибке: часть могла переместиться
        await refresh();
        updateSelection();
    };

    moveDialog.addEventListener('click', (event) => {
        const to = event.target.closest('[data-fm-move-to]');
        if (to) {
            if (!to.disabled) {
                moveBrowse(to.dataset.fmMoveTo);
            }
            return;
        }
        if (event.target.closest('[data-fm-move-back]')) {
            if (moving.path !== '') {
                moveBrowse(parentPath(moving.path));
            }
            return;
        }
        const action = event.target.closest('[data-fm-action]')?.dataset.fmAction;
        if (action === 'move-here') {
            moveHere();
        } else if (action === 'move-create') {
            state.target = {type: 'dir', path: moving.path, name: baseName(moving.path)};
            openNameDialog(createDialog, '');
        }
    });

    // Backspace — на уровень выше
    moveDialog.addEventListener('keydown', (event) => {
        if (event.key === 'Backspace' && moving.path !== '') {
            event.preventDefault();
            moveBrowse(parentPath(moving.path));
        }
    });

    const copyPath = async (item) => {
        try {
            await navigator.clipboard.writeText(filesRoot + item.path);
            toast('Путь скопирован');
        } catch {
            toast(filesRoot + item.path, 'info');
        }
    };

    const download = (item) => {
        const link = document.createElement('a');
        link.href = `${api}?method=download&path=${encodeURIComponent(item.path)}`;
        link.download = item.name;
        document.body.append(link);
        link.click();
        link.remove();
    };

    /** Что сервер умеет сжимать: ['image', 'video'] (видео — если есть ffmpeg); спрашивается один раз */
    let compression = null;
    const getCompression = async () => {
        compression ??= await call('compression').catch(() => []);
        return compression;
    };

    /**
     * Сжимать ли картинки и видео перед загрузкой: true / false, null — пользователь закрыл окно (не загружать).
     * Нечего сжимать (документы, аудио, GIF) — false без вопроса. «Запомнить выбор» — до конца работы (sessionStorage)
     */
    const askCompress = async (files) => {
        const kinds = await getCompression();
        const images = kinds.includes('image') ? files.filter((file) => IMAGE_EXTENSIONS.includes(extensionOf(file.name))) : [];
        const videos = kinds.includes('video') ? files.filter((file) => VIDEO_EXTENSIONS.includes(extensionOf(file.name))) : [];
        if (!images.length && !videos.length) {
            return false;
        }
        const remembered = sessionStorage.getItem(COMPRESS_KEY);
        if (remembered !== null) {
            return remembered === '1';
        }
        const list = compressDialog.querySelector('[data-fm-compress-list]');
        list.replaceChildren(...[
            images.length && `Картинки (${images.length}) — в WebP, не больше 2560 px. Обычно в несколько раз легче, на сайте выглядят так же.`,
            videos.length && `Видео (${videos.length}) — в MP4, не больше 1920 px. Загрузка займёт больше времени.`,
        ].filter(Boolean).map((text) => element('li', 'fm-compress__item', text)));
        const remember = compressDialog.querySelector('[data-fm-compress-remember]');
        remember.checked = false;
        return new Promise((resolve) => {
            let answer = null;
            const onClick = (event) => {
                const action = event.target.closest('[data-fm-action]')?.dataset.fmAction;
                if (action === 'compress-yes' || action === 'compress-no') {
                    answer = action === 'compress-yes';
                    hideDialog(compressDialog);
                }
            };
            compressDialog.addEventListener('click', onClick);
            compressDialog.addEventListener('close', () => {
                compressDialog.removeEventListener('click', onClick);
                if (answer !== null && remember.checked) {
                    sessionStorage.setItem(COMPRESS_KEY, answer ? '1' : '0');
                }
                resolve(answer);
            }, {once: true});
            showDialog(compressDialog);
            compressDialog.querySelector('[data-fm-action="compress-yes"]').focus({preventScroll: true});
        });
    };

    /** Загрузка в папку path (по умолчанию — открытую; «Загрузить файлы» в меню папки — в неё) */
    const upload = async (chosen, path = state.path) => {
        if (path !== state.path) {
            await navigate(path);
        }
        // при accept — только подходящие файлы
        const files = chosen.filter((file) => isAccepted({type: 'file', name: file.name}));
        const skipped = chosen.filter((file) => !files.includes(file));
        if (skipped.length) {
            const allowed = state.accept.size ? `можно выбрать только ${[...state.accept].join(', ')}` : 'файлы выбрать нельзя';
            toast(`Здесь ${allowed}. Не загружено: ${skipped.map((file) => file.name).join(', ')}`, 'error');
        }
        if (!files.length) {
            return;
        }
        // картинки и видео — сжимать или нет, решает пользователь; закрыл окно вопроса — не загружаем
        const compress = await askCompress(files);
        if (compress === null) {
            return;
        }
        const names = files.map((file) => file.name);
        state.uploading.push(...names);
        renderFiles();
        let statuses = [];
        try {
            statuses = await call('upload', {path, compress: compress ? '1' : '0'}, files);
        } catch (error) {
            report(error);
        }
        state.uploading = state.uploading.filter((name) => !names.includes(name));
        state.failed = [];
        statuses.forEach((status, index) => {
            if (UPLOAD_ERRORS[status]) {
                state.failed.push({name: names[index], error: UPLOAD_ERRORS[status]});
            } else {
                state.added.add(status);
            }
        });
        if (state.failed.length) {
            toast(`Не загружено: ${state.failed.map((item) => item.name).join(', ')}`, 'error');
        }
        await refresh();
        // загруженные выбираются: «Готово» сразу
        const uploaded = statuses.filter((status) => !UPLOAD_ERRORS[status]);
        if (uploaded.length) {
            state.selected = new Set(state.multiple ? uploaded : uploaded.slice(-1));
            state.checking = state.selected.size > 1;
            state.anchor = uploaded[uploaded.length - 1];
            updateSelection();
        }
    };

    /** Отмеченные, которые видно: скрытые поиском не удаляются и не перемещаются */
    const selectedItems = () => getVisibleItems().filter((item) => state.selected.has(item.path));

    const runAction = (action, item = null) => {
        closeMenus();
        switch (action) {
            case 'done':
                done();
                break;
            case 'close':
                hideDialog(win);
                break;
            case 'upload':
                fileInput.click();
                break;
            case 'upload-to':
                // выбор файлов — сразу по нажатию (иначе браузер не откроет окно выбора)
                state.uploadPath = item.path;
                fileInput.click();
                break;
            case 'refresh':
                refresh();
                break;
            case 'select-item':
                // «Выбрать» в меню (телефон): отметить и включить режим отметки
                if (isCheckable(item) && (!state.selected.has(item.path) || !state.checking)) {
                    state.checking = true;
                    state.selected.add(item.path);
                    state.anchor = item.path;
                    updateSelection();
                }
                break;
            case 'delete-selected':
                remove(selectedItems());
                break;
            case 'move-selected':
                openMove(selectedItems());
                break;
            case 'move':
                // несколько выбранных — если меню открыто на одном из них
                openMove(state.selected.size > 1 && state.selected.has(item.path) ? selectedItems() : [item]);
                break;
            case 'cancel-selection':
                state.selected.clear();
                state.checking = false;
                updateSelection();
                break;
            case 'back':
                state.path === '' ? hideDialog(win) : navigate(parentPath(state.path));
                break;
            case 'create':
                state.target = item?.type === 'dir' ? item : null;
                openNameDialog(createDialog, '');
                break;
            case 'delete-folder':
                if (state.path !== '') {
                    remove([getItem(state.path)]);
                }
                break;
            case 'rename':
                if (hasProtected([item], 'переименовать')) {
                    break;
                }
                state.target = item;
                openNameDialog(renameDialog, item.name);
                warnUsage(renameDialog, [item], 'переименования', (isBusy) => {
                    renameDialog.querySelector('[data-fm-action="rename-save"]').disabled = isBusy;
                });
                break;
            case 'copy-path':
                copyPath(item);
                break;
            case 'download':
                download(item);
                break;
            case 'delete':
                // несколько выбранных — если меню открыто на одном из них
                remove(state.selected.size > 1 && state.selected.has(item.path) ? selectedItems() : [item]);
                break;
            case 'rename-save':
                saveName(renameDialog, 'rename');
                break;
            case 'create-save':
                saveName(createDialog, 'createDir');
                break;
        }
    };

    /* ---------- события окна ---------- */

    const itemOf = (target) => {
        const node = target.closest('[data-fm-path][data-fm-kind]');
        if (!node || !win.contains(node)) {
            return null;
        }
        return node.classList.contains('fm-tree-row')
            ? {type: 'dir', path: node.dataset.fmPath, name: baseName(node.dataset.fmPath)}
            : getItem(node.dataset.fmPath);
    };

    const setSort = (value) => {
        state.sort = SORT_LABELS[value] ? value : 'name';
        find('[data-fm-sort-label]').textContent = SORT_LABELS[state.sort];
        menus.sort.querySelectorAll('[data-fm-sort-value]').forEach((item) => {
            item.setAttribute('aria-checked', String(item.dataset.fmSortValue === state.sort));
        });
        renderFiles();
    };

    win.addEventListener('click', (event) => {
        const menuItem = event.target.closest('[data-fm-menu] [data-fm-action]');
        if (menuItem) {
            runAction(menuItem.dataset.fmAction, state.target);
            return;
        }
        const sortItem = event.target.closest('[data-fm-sort-value]');
        if (sortItem) {
            setSort(sortItem.dataset.fmSortValue);
            closeMenus();
            sortButton.focus();
            return;
        }
        if (event.target.closest('[data-fm-sort]')) {
            const isOpen = isMenuOpen(menus.sort);
            closeMenus();
            if (!isOpen) {
                const rect = sortButton.getBoundingClientRect();
                openMenu(menus.sort, rect.left + 40, rect.bottom);
                sortButton.setAttribute('aria-expanded', 'true');
            }
            return;
        }
        closeMenus();
        const actionButton = event.target.closest('[data-fm-action]');
        if (actionButton && !actionButton.disabled) {
            runAction(actionButton.dataset.fmAction);
            return;
        }
        const row = event.target.closest('.fm-tree-row');
        if (row) {
            const path = row.dataset.fmPath;
            // стрелка — раскрыть или свернуть, название — открыть папку
            if (event.target.closest('[data-fm-toggle]')) {
                state.expanded.has(path) ? state.expanded.delete(path) : state.expanded.add(path);
                state.justExpanded = state.expanded.has(path) ? path : null;
                renderTree();
                loadMissingLevels().catch(report);
            } else {
                navigate(path);
            }
            return;
        }
        const crumb = event.target.closest('.fm-crumbs [data-fm-path]');
        if (crumb) {
            navigate(crumb.dataset.fmPath);
            return;
        }
        const card = event.target.closest('.fm-card[data-fm-path]');
        if (!card || card.classList.contains('fm-card_disabled')) {
            return;
        }
        const path = card.dataset.fmPath;
        // галочка и Ctrl/⌘ — отметить (включает режим отметки); Shift — диапазон; в режиме отметки клик по карточке
        // отмечает её; иначе папка — открыть, файл — выбрать один
        if (event.target.closest('.fm-card__check') || event.ctrlKey || event.metaKey) {
            toggleSelect(path, {keep: !event.target.closest('.fm-card__check')});
        } else if (event.shiftKey && state.anchor) {
            selectRange(path);
        } else if (state.checking) {
            toggleSelect(path);
        } else if (card.dataset.fmKind === 'dir') {
            navigate(path);
            return;
        } else {
            selectOnly(path);
        }
        card.focus({preventScroll: true});
    });

    win.addEventListener('dblclick', (event) => {
        const card = event.target.closest('.fm-card[data-fm-path][data-fm-kind="file"]');
        // в режиме отметки двойной клик — две отметки, а не «Готово»
        if (card && !event.target.closest('.fm-card__check') && !state.checking) {
            pick(card.dataset.fmPath);
        }
    });

    win.addEventListener('contextmenu', (event) => {
        const item = itemOf(event.target);
        if (item) {
            event.preventDefault();
            openItemMenu(item, event.clientX, event.clientY);
        }
    });

    // долгое нажатие на сенсорном экране — меню; клик, который браузер пришлёт, когда палец отпустят, не открывает
    // папку и не закрывает меню
    let pressTimer = null;
    let isLongPress = false;
    win.addEventListener('touchstart', (event) => {
        isLongPress = false;
        const item = itemOf(event.target);
        if (!item || event.touches.length > 1) {
            return;
        }
        const touch = event.touches[0];
        pressTimer = setTimeout(() => {
            isLongPress = true;
            openItemMenu(item, touch.clientX, touch.clientY);
        }, LONG_PRESS);
    }, {passive: true});
    ['touchend', 'touchmove', 'touchcancel'].forEach((type) => win.addEventListener(type, () => clearTimeout(pressTimer), {passive: true}));
    win.addEventListener('click', (event) => {
        if (isLongPress) {
            isLongPress = false;
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }, true);
    // браузер тоже открывает меню по долгому нажатию (contextmenu): второй раз не перестраиваем
    win.addEventListener('contextmenu', (event) => {
        if (isLongPress) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }, true);

    // клавиатура по карточкам: стрелки, Enter, пробел, Delete, меню
    win.addEventListener('keydown', (event) => {
        const card = event.target.closest?.('.fm-card[data-fm-path]');
        if (!card) {
            return;
        }
        const path = card.dataset.fmPath;
        if (event.key === 'Enter') {
            event.preventDefault();
            card.dataset.fmKind === 'dir' ? navigate(path) : pick(path);
        } else if (event.key === ' ') {
            event.preventDefault();
            toggleSelect(path);
        } else if (event.key === 'Delete') {
            event.preventDefault();
            remove(state.selected.has(path) ? selectedItems() : [getItem(path)]);
        } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault();
            const rect = card.getBoundingClientRect();
            openItemMenu(getItem(path), rect.left + rect.width / 2, rect.bottom);
        } else if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
            event.preventDefault();
            const cards = [...filesElement.querySelectorAll('.fm-card[data-fm-path]')];
            const index = cards.indexOf(card);
            const columns = getComputedStyle(filesElement).gridTemplateColumns.split(' ').length;
            const step = {ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns}[event.key];
            cards[Math.max(0, Math.min(cards.length - 1, index + step))]?.focus();
        }
    });

    // Tab попадает в список на выбранную или первую карточку
    filesElement.tabIndex = 0;
    filesElement.addEventListener('focus', () => {
        (filesElement.querySelector('.fm-card[aria-selected="true"]') ?? filesElement.querySelector('.fm-card[data-fm-path]'))?.focus();
    });

    // мышь вне меню закрывает его
    win.addEventListener('mousedown', (event) => {
        if (!event.target.closest('[data-fm-menu], [data-fm-sort]')) {
            closeMenus();
        }
    });

    // окна имени: кнопка и Enter — сохранить
    [[renameDialog, 'rename-save'], [createDialog, 'create-save']].forEach(([dialog, action]) => {
        dialog.querySelector(`[data-fm-action="${action}"]`).addEventListener('click', () => runAction(action));
        dialog.querySelector('[data-fm-name]').addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                runAction(action);
            }
        });
    });

    searchInput.addEventListener('input', renderFiles);
    fileInput.addEventListener('change', () => {
        const path = state.uploadPath ?? state.path;
        state.uploadPath = null;
        upload([...fileInput.files], path);
        fileInput.value = '';
    });
    fileInput.addEventListener('cancel', () => {
        state.uploadPath = null;
    });
    boardElement.addEventListener('scroll', () => {
        closeMenus();
        hideTip();
    }, {passive: true});
    window.addEventListener('resize', () => {
        closeMenus();
        hideTip();
    });

    // подсказка поиска — короче на телефоне (Figma: «Название файла»)
    const mobile = window.matchMedia(MOBILE);
    const searchPlaceholder = () => {
        searchInput.placeholder = mobile.matches ? 'Название файла' : 'Введите название файла';
    };
    searchPlaceholder();
    mobile.addEventListener('change', searchPlaceholder);

    // перетаскивание файлов в окно
    let dragDepth = 0;
    const hasFiles = (event) => [...(event.dataTransfer?.types ?? [])].includes('Files');
    windowBox.addEventListener('dragenter', (event) => {
        if (hasFiles(event)) {
            dragDepth++;
            dropElement.hidden = false;
        }
    });
    windowBox.addEventListener('dragleave', () => {
        dragDepth = Math.max(0, dragDepth - 1);
        if (!dragDepth) {
            dropElement.hidden = true;
        }
    });
    windowBox.addEventListener('dragover', (event) => {
        if (hasFiles(event)) {
            event.preventDefault();
        }
    });
    windowBox.addEventListener('drop', (event) => {
        if (!hasFiles(event)) {
            return;
        }
        event.preventDefault();
        dragDepth = 0;
        dropElement.hidden = true;
        upload([...event.dataTransfer.files]);
    });

    /* ---------- открытие и ответ вызвавшему ---------- */

    /** Открытие окна (open): ответ ждёт ровно один — {onSelect, onCancel, resolve} */
    let request = null;

    /** Ответ на открытие: files — onSelect, null — onCancel; Promise open() получает то же */
    const answer = (files) => {
        const current = request;
        request = null;
        if (!current) {
            return;
        }
        try {
            if (files) {
                current.onSelect?.(files);
            } else {
                current.onCancel?.();
            }
        } finally {
            current.resolve(files);
        }
    };

    // любое закрытие окна (крестик, Esc, подложка, close(), «Готово»): ответ вызвавшему
    win.addEventListener('close', () => {
        closeMenus();
        hideTip();
        [renameDialog, createDialog, confirmDialog, compressDialog, moveDialog].forEach(hideDialog);
        state.added.clear();
        state.failed = [];
        const files = state.result;
        state.result = null;
        answer(files);
    });

    /**
     * @param {{multiple?: boolean, accept?: string|string[]|null, onSelect?: Function|null, onCancel?: Function|null,
     *     select?: boolean}} options
     * @returns {Promise<Array<{path: string, url: string, name: string, isImage: boolean}>|null>}
     */
    const open = ({multiple = false, accept = null, onSelect = null, onCancel = null, select = Boolean(onSelect)} = {}) => {
        // окно уже открыто другим вызовом: тот получает отмену
        answer(null);
        const promise = new Promise((resolve) => {
            request = {onSelect, onCancel, resolve};
        });
        state.result = null;
        state.multiple = multiple;
        state.select = select;
        state.accept = parseAccept(accept);
        fileInput.accept = state.accept ? [...state.accept].map((extension) => '.' + extension).join(',') : '';
        state.selected.clear();
        windowBox.classList.toggle('fm-window_select', select);
        // что сервер умеет сжимать — заранее: вопрос о сжатии при загрузке появляется сразу
        getCompression();
        const isOpen = win.open;
        showDialog(win);
        if (!state.loaded) {
            state.loaded = true;
            navigate('');
            loadTree().catch(report);
        } else {
            if (isOpen) {
                renderFiles();
            }
            refresh();
        }
        return promise;
    };

    window.fileManager = {
        open,
        close: () => hideDialog(win),
        // прежний вызов: один файл, callback получает путь от корня файлов
        init: (callback) => open({onSelect: callback ? (files) => callback(files[0].path) : null}),
    };
}
