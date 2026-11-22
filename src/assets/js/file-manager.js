/**
 * Файловый менеджер (ES-модуль, без jQuery): окно file-window из tpl/index.tpl, данные — API Manager
 * (data-fm-api: ?method=getTree|getFileList|download|delete|createDir|rename|upload).
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
 * Окно: дерево папок, крошки, поиск и сортировка, выбор файла (Ctrl/⌘ или режим multiple — несколько),
 * двойной клик — открыть папку или выбрать файл, правый клик или долгое нажатие — меню, перетаскивание файлов
 * в окно — загрузка. Подтверждение удаления, тосты — window.sfAdmin (admin.js ядра), окна — Common/Modal.
 */

const MODAL_ID = 'sf-file-manager';
const LONG_PRESS = 500;

const UPLOAD_ERRORS = {
    error: 'не загружен',
    forbidden: 'такой тип файла нельзя загрузить',
    error_save: 'не сохранён',
    too_large: 'слишком большой',
    bad_image: 'картинка повреждена или с посторонним кодом',
};

const root = document.querySelector('.file-manager');
const modal = document.getElementById(MODAL_ID);

const toast = (message, type = 'success') => (window.sfAdmin
    ? window.sfAdmin.toast(message, {type})
    : window.alert(message));
const confirmAction = (message, title, confirmText) => window.sfAdmin
    // Figma file-modal: «Удалить» — основная кнопка
    ? window.sfAdmin.confirm(message, {title, confirmText})
    : Promise.resolve(window.confirm(message));

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
const extensionOf = (name) => (name.includes('.') ? name.split('.').pop().toLowerCase() : '');

/** Последний элемент пути: /images/a.png → a.png */
const baseName = (path) => path.split('/').filter(Boolean).pop() ?? '';
/** Папка пути: /images/a.png → /images */
const parentPath = (path) => path.split('/').slice(0, -1).join('/');

if (root && modal) {
    const api = root.dataset.fmApi;
    const filesRoot = root.dataset.fmRoot;
    const sprite = root.dataset.fmSprite;
    const dialog = modal.querySelector('.modal__dialog');
    const find = (selector) => modal.querySelector(selector);
    const treeElement = find('[data-fm-tree]');
    const filesElement = find('[data-fm-files]');
    const searchInput = find('[data-fm-search]');
    const sortInput = find('[data-fm-sort]');
    const doneButton = find('.file-window__done');
    const fileInput = find('[data-fm-input]');
    const dropElement = find('[data-fm-drop]');
    const renameModal = document.getElementById('sf-file-manager-rename');
    const createModal = document.getElementById('sf-file-manager-create');
    // меню — внутри окна: всё вне открытого окна недоступно (inert)
    const menus = {};
    root.querySelectorAll('[data-fm-menu]').forEach((menu) => {
        menus[menu.dataset.fmMenu] = menu;
        dialog.append(menu);
    });

    const state = {
        path: '',
        tree: [],
        expanded: new Set(),
        items: [],
        selected: new Set(),
        // только что загруженные (style new) и не принятые сервером (style error) файлы
        added: new Set(),
        failed: [],
        uploading: [],
        multiple: false,
        // режим выбора: «Готово» отдаёт файлы
        select: false,
        // расширения, которые можно выбрать (parseAccept), null — любые
        accept: null,
        // файлы, выбранные «Готово»: отдаются вызвавшему при закрытии окна
        result: null,
        // элемент, для которого открыто меню или окно переименования
        target: null,
        loaded: false,
        // номер последнего запроса дерева и отмена запроса списка (устаревшие ответы не применяются)
        treeRequest: 0,
        filesAbort: null,
        // папка для «Загрузить файлы» из меню папки (пока открыт выбор файлов)
        uploadPath: null,
    };

    /** Можно ли выбрать: папка — всегда, файл — если подходит под accept */
    const isAccepted = (item) => item.type === 'dir' || !state.accept || state.accept.has(extensionOf(item.name));

    const icon = (name, className = 'fm-icon') => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', className);
        svg.setAttribute('aria-hidden', 'true');
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', `${sprite}#fm-${name}`);
        svg.append(use);
        return svg;
    };

    const element = (tag, className, text = '') => {
        const node = document.createElement(tag);
        node.className = className;
        if (text !== '') {
            node.textContent = text;
        }
        return node;
    };

    /** Запрос к API: изменяющие — POST */
    const call = async (method, params = {}, files = null, signal = undefined) => {
        const isModifying = ['delete', 'createDir', 'rename', 'upload'].includes(method);
        let url = `${api}?method=${method}`;
        let options = {credentials: 'same-origin', headers: {'X-Requested-With': 'XMLHttpRequest'}, signal};
        if (isModifying) {
            // CSRF-токен сессии админки: без него сервер изменяющий запрос не принимает
            options.headers['X-CSRF-Token'] = document.querySelector('meta[name="csrf-token"]')?.content ?? '';
            const body = new FormData();
            Object.entries(params).forEach(([key, value]) => body.append(key, value));
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

    const report = (error) => toast(error.message || 'Ошибка', 'error');

    /** Недоступность кнопки: атрибут и aria-disabled (Button ядра) */
    const setDisabled = (button, isDisabled) => {
        button.disabled = isDisabled;
        button.toggleAttribute('aria-disabled', isDisabled);
    };

    /* ---------- дерево ---------- */

    const drawTree = (nodes, depth = 0) => {
        const list = element('ul', depth ? 'file-tree__group' : 'file-tree');
        list.setAttribute('role', depth ? 'group' : 'none');
        nodes.forEach((node) => {
            const item = element('li', 'file-tree__item');
            item.setAttribute('role', 'none');
            // дерево подгружается по уровням: data === null — вложенные папки ещё не загружены
            const hasChildren = node.has_children ?? (node.data?.length > 0);
            const isOpen = state.expanded.has(node.path);
            const row = element('button', 'file-tree-row');
            row.type = 'button';
            row.setAttribute('role', 'treeitem');
            row.dataset.fmPath = node.path;
            row.dataset.fmKind = 'dir';
            row.style.setProperty('--depth', String(depth));
            row.classList.toggle('file-tree-row_active', node.path === state.path);
            row.classList.toggle('file-tree-row_open', isOpen);
            row.classList.toggle('file-tree-row_leaf', !hasChildren);
            if (hasChildren) {
                row.setAttribute('aria-expanded', String(isOpen));
            }
            if (node.path === state.path) {
                row.setAttribute('aria-current', 'true');
            }
            const arrow = element('span', 'file-tree-row__arrow');
            arrow.dataset.fmToggle = '';
            if (hasChildren) {
                arrow.append(icon('down'));
            }
            row.append(arrow, icon('folder', 'fm-icon file-tree-row__icon'), element('span', 'file-tree-row__name', node.name));
            item.append(row);
            if (hasChildren && isOpen && node.data) {
                item.append(drawTree(node.data, depth + 1));
            }
            list.append(item);
        });
        return list;
    };

    const renderTree = () => treeElement.replaceChildren(drawTree(state.tree));

    /* ---------- крошки ---------- */

    const renderCrumbs = () => {
        const crumbs = find('[data-fm-crumbs]');
        const home = element('button', 'file-tool file-window__home');
        home.type = 'button';
        home.dataset.fmPath = '';
        home.setAttribute('aria-label', 'В корень');
        home.append(icon('home'));
        const parts = state.path.split('/').filter(Boolean);
        const items = parts.map((name, index) => {
            const path = '/' + parts.slice(0, index + 1).join('/');
            const isLast = index === parts.length - 1;
            const crumb = element(isLast ? 'span' : 'button', 'file-window__crumb' + (isLast ? ' file-window__crumb_current' : ''), name);
            if (isLast) {
                crumb.setAttribute('aria-current', 'page');
            } else {
                crumb.type = 'button';
                crumb.dataset.fmPath = path;
            }
            return crumb;
        });
        crumbs.replaceChildren(home, ...items);
    };

    /* ---------- файлы ---------- */

    const compare = {
        name: (a, b) => a.name.localeCompare(b.name, 'ru', {numeric: true}),
        date: (a, b) => (b.mtime ?? 0) - (a.mtime ?? 0),
        size: (a, b) => (b.bytes ?? 0) - (a.bytes ?? 0),

    };

    const getVisibleItems = () => {
        const query = searchInput.value.trim().toLowerCase();
        const sort = compare[sortInput.value] ?? compare.name;
        return state.items
            .filter((item) => query === '' || item.name.toLowerCase().includes(query))
            // папки — первыми
            .sort((a, b) => (a.type === b.type ? sort(a, b) : (a.type === 'dir' ? -1 : 1)));
    };

    const sizeText = (item) => (item.type === 'dir'
        ? `${item.count} ${['элемент', 'элемента', 'элементов'][plural(item.count)]}`
        : `${Number(item.size).toLocaleString('ru-RU')} ${item.size_ext}`);

    const plural = (count) => {
        const mod10 = count % 10;
        const mod100 = count % 100;
        if (mod10 === 1 && mod100 !== 11) {
            return 0;
        }
        return mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 1 : 2;
    };

    const drawCard = (item, style = 'default') => {
        const card = element('button', `file-card file-card_style_${style}`);
        card.type = 'button';
        card.setAttribute('role', 'option');
        if (item.path) {
            card.dataset.fmPath = item.path;
            card.dataset.fmKind = item.type;
            // не подходит под accept: видна, но не выбирается (меню — работает)
            if (!isAccepted(item)) {
                card.classList.add('file-card_disabled');
                card.setAttribute('aria-disabled', 'true');
            }
        }

        const preview = element('span', 'file-card__preview');
        if (style === 'uploading') {
            preview.append(element('span', 'file-card__loader'));
        } else if (style === 'error') {
            preview.append(icon('close', 'fm-icon file-card__icon'));
        } else if (item.type === 'dir') {
            preview.append(icon('folder', 'fm-icon file-card__icon'));
        } else if (item.is_pic) {
            const image = element('img', 'file-card__image');
            image.src = filesRoot + item.path;
            image.alt = '';
            image.loading = 'lazy';
            preview.append(image);
        } else {
            preview.append(icon('file', 'fm-icon file-card__icon'));
        }
        // чек — виден при выборе нескольких (file-card_selected)
        const check = element('span', 'file-card__check');
        check.append(icon('check'));
        preview.append(check);
        if (style !== 'uploading' && style !== 'error') {
            preview.append(element('span', 'file-card__size', sizeText(item)));
        }
        card.append(preview, element('span', 'file-card__name', item.name));
        card.append(element('span', 'file-card__date', style === 'error' ? item.error : (item.edited ?? '')));
        card.append(element('span', 'file-card__weight', style === 'uploading' || style === 'error' ? '' : sizeText(item)));
        applySelection(card);
        return card;
    };

    /** Выбор на карточке: один — active, несколько (или режим multiple) — selected с чеком */
    const applySelection = (card) => {
        const isSelected = state.selected.has(card.dataset.fmPath);
        const isMulti = state.multiple || state.selected.size > 1;
        card.setAttribute('aria-selected', String(isSelected));
        card.classList.toggle('file-card_active', isSelected && !isMulti);
        card.classList.toggle('file-card_selected', isSelected && isMulti);
    };

    /** Выбор меняется без перерисовки: двойной клик попадает в ту же карточку */
    const updateSelection = () => {
        filesElement.querySelectorAll('.file-card[data-fm-path]').forEach(applySelection);
        renderInfo();
    };

    const renderState = (visible) => {
        const stateElement = find('[data-fm-state]');
        const isSearch = searchInput.value.trim() !== '';
        const isEmpty = !visible.length && !state.uploading.length && !state.failed.length;
        stateElement.hidden = !isEmpty;
        find('[data-fm-state-title]').textContent = isSearch ? 'Ничего не найдено' : 'Папка пуста';
        find('[data-fm-state-text]').textContent = isSearch
            ? 'Попробуйте изменить запрос'
            : 'Загрузите файлы или перетащите их в окно';
    };

    const renderInfo = () => {
        const selected = state.items.filter((item) => state.selected.has(item.path));
        const name = find('[data-fm-info-name]');
        const meta = find('[data-fm-info-meta]');
        if (selected.length > 1) {
            name.textContent = `Выбрано: ${selected.length}`;
            meta.textContent = '';
        } else if (selected.length === 1) {
            const [item] = selected;
            name.textContent = item.name;
            meta.textContent = item.type === 'dir'
                ? [sizeText(item), item.edited && `Изменена: ${item.edited}`].filter(Boolean).join(' · ')
                : [`Вес: ${sizeText(item)}`, item.dimensions && `Размер: ${item.dimensions.replace('x', '×').replace('px', ' px')}`,
                    `Изменён: ${item.edited}`].filter(Boolean).join(' · ');
        } else {
            name.textContent = '';
            meta.textContent = '';
        }
        const files = selected.filter((item) => item.type === 'file' && isAccepted(item));
        const isDoneDisabled = !state.select || !files.length;
        [doneButton, find('.file-tabbar [data-fm-action="done"]')].forEach((button) => setDisabled(button, isDoneDisabled));
        setDisabled(find('[data-fm-delete-folder]'), state.path === '');
    };

    const renderFiles = () => {
        const visible = getVisibleItems();
        filesElement.setAttribute('aria-multiselectable', String(state.multiple));
        filesElement.replaceChildren(
            ...state.uploading.map((name) => drawCard({name}, 'uploading')),
            ...state.failed.map((item) => drawCard(item, 'error')),
            ...visible.map((item) => drawCard(item, state.added.has(item.path) ? 'new' : 'default')),
        );
        renderState(visible);
        renderInfo();
    };

    /* ---------- загрузка данных ---------- */

    /** Узел дерева по пути */
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
     * Ответ устаревшего запроса (дерево уже перечитывается заново) не применяется
     */
    const loadTree = async () => {
        const request = ++state.treeRequest;
        const paths = expandedPaths();
        const [root, ...levels] = await Promise.all([
            call('getTree', {path: '', depth: 1}),
            // раскрытая папка могла исчезнуть — без неё
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
        attach(root);
        state.tree = root;
        renderTree();
    };

    /** Догружает вложенные папки раскрытых узлов, которых ещё нет (раскрыли стрелкой или открыли глубокую папку) */
    const loadMissingLevels = async () => {
        for (const path of expandedPaths()) {
            const node = findNode(state.tree, path);
            if (node && node.data === null && node.has_children !== false) {
                const request = state.treeRequest;
                const data = await call('getTree', {path, depth: 1}).catch(() => []);
                if (request !== state.treeRequest) {
                    return;
                }
                node.data = data;
                renderTree();
            }
        }
    };

    /** Список папки: прежний запрос отменяется, ответ для другой папки не применяется (быстрые клики по дереву) */
    const loadFiles = async () => {
        const path = state.path;
        state.filesAbort?.abort();
        const abort = new AbortController();
        state.filesAbort = abort;
        let items;
        try {
            items = await call('getFileList', {path, include_dirs: 1}, null, abort.signal);
        } catch (error) {
            if (abort.signal.aborted) {
                return;
            }
            throw error;
        }
        if (abort.signal.aborted || path !== state.path) {
            return;
        }
        state.items = items;
        // выбор остаётся только у существующих
        const paths = new Set(state.items.map((item) => item.path));
        state.selected = new Set([...state.selected].filter((path) => paths.has(path)));
        renderFiles();
    };

    const navigate = async (path) => {
        state.path = path;
        state.selected.clear();
        state.failed = [];
        searchInput.value = '';
        // путь до папки раскрыт в дереве
        const parts = path.split('/').filter(Boolean);
        parts.forEach((part, index) => state.expanded.add('/' + parts.slice(0, index + 1).join('/')));
        renderCrumbs();
        renderTree();
        loadMissingLevels().catch(report);
        try {
            await loadFiles();
        } catch (error) {
            report(error);
        }
    };

    const refresh = async () => {
        try {
            await Promise.all([loadTree(), loadFiles()]);
        } catch (error) {
            report(error);
        }
    };

    /* ---------- выбор ---------- */

    const select = (path, isToggle) => {
        if (!isAccepted(getItem(path))) {
            return;
        }
        if (isToggle) {
            state.selected.has(path) ? state.selected.delete(path) : state.selected.add(path);
        } else {
            state.selected = new Set([path]);
        }
        updateSelection();
    };

    /** «Готово»: выбранные подходящие файлы уходят вызвавшему, когда окно закроется (modal:close) */
    const done = () => {
        const files = state.items.filter((item) => item.type === 'file' && state.selected.has(item.path) && isAccepted(item));
        if (!files.length || !state.select) {
            return;
        }
        state.result = files.map((item) => ({path: item.path, url: filesRoot + item.path, name: item.name, isImage: Boolean(item.is_pic)}));
        window.SimflexModal.close(MODAL_ID);
    };

    /** Двойной клик или Enter по файлу: выбрать только его и сразу «Готово» */
    const pick = (path) => {
        if (!isAccepted(getItem(path))) {
            return;
        }
        state.selected = new Set([path]);
        done();
    };

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

    /* ---------- действия ---------- */

    const getItem = (path) => state.items.find((item) => item.path === path)
        ?? {type: 'dir', path, name: baseName(path)};

    /** Окно имени: rename — прежнее имя в «Старое название» и в поле, create — пустое поле */
    const openNameModal = (target, value) => {
        const input = target.querySelector('[data-fm-name]');
        const oldName = target.querySelector('[data-fm-old-name]');
        if (oldName) {
            oldName.value = value;
        }
        input.value = value;
        window.SimflexModal.open(target.id);
        input.focus();
        input.select();
    };

    const saveName = async (target, method) => {
        const name = target.querySelector('[data-fm-name]').value.trim();
        if (name === '') {
            return;
        }
        try {
            if (method === 'rename') {
                await call('rename', {path: state.target.path, name});
                // переименованная открытая папка — новый путь
                if (state.target.type === 'dir' && (state.path === state.target.path || state.path.startsWith(state.target.path + '/'))) {
                    state.path = parentPath(state.target.path) + '/' + name + state.path.slice(state.target.path.length);
                }
            } else {
                await call('createDir', {path: state.target?.path ?? state.path, name});
            }
            window.SimflexModal.close(target.id);
            await refresh();
            renderCrumbs();
        } catch (error) {
            report(error);
        }
    };

    const remove = async (items) => {
        if (!items.length) {
            return;
        }
        // тексты — Figma file-modal (delfolder, delfile)
        const isFolder = items.length === 1 && items[0].type === 'dir';
        const [title, message] = items.length > 1
            ? ['Удалить файлы?', `Будет удалено: ${items.length}. Файлы будут удалены сразу.`]
            : (isFolder
                ? ['Удалить папку?', 'Папка и всё, что в ней, будут удалены сразу.']
                : ['Удалить файл?', 'Файл будет удалён сразу.']);
        const isConfirmed = await confirmAction(message, title, 'Удалить');
        if (!isConfirmed) {
            return;
        }
        const deleted = [];
        try {
            for (const item of items) {
                await call('delete', {path: item.path});
                deleted.push(item);
            }
        } catch (error) {
            // несколько: какие уже удалены, а какой нет
            const failed = items[deleted.length];
            toast(items.length > 1
                ? `Удалено ${deleted.length} из ${items.length}. «${failed.name}»: ${error.message || 'ошибка'}`
                : error.message || 'Ошибка', 'error');
        }
        const removedDir = deleted.find((item) => item.type === 'dir' && (state.path === item.path || state.path.startsWith(item.path + '/')));
        if (removedDir) {
            await navigate(parentPath(removedDir.path));
        }
        state.selected.clear();
        await refresh();
    };

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
        const names = [...files].map((file) => file.name);
        state.uploading.push(...names);
        renderFiles();
        let statuses = [];
        try {
            statuses = await call('upload', {path}, [...files]);
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
            updateSelection();
        }
    };

    /* ---------- меню ---------- */

    const closeMenus = () => Object.values(menus).forEach((menu) => {
        menu.hidden = true;
    });

    const openMenu = (item, x, y) => {
        closeMenus();
        state.target = item;
        if (item.type === 'file' && !state.selected.has(item.path)) {
            select(item.path, false);
        }
        const menu = menus[item.type === 'dir' ? 'folder' : 'file'];
        menu.hidden = false;
        // у курсора, в пределах окна браузера
        const rect = menu.getBoundingClientRect();
        menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
        menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
        menu.querySelector('.file-menu__item')?.focus();
    };

    const runAction = (action, item) => {
        const selectedItems = state.items.filter((entry) => state.selected.has(entry.path));
        switch (action) {
            case 'done':
                done();
                break;
            case 'upload':
                fileInput.click();
                break;
            case 'refresh':
                refresh();
                break;
            case 'back':
                state.path === '' ? window.SimflexModal.close(MODAL_ID) : navigate(parentPath(state.path));
                break;
            case 'create':
                state.target = item?.type === 'dir' ? item : null;
                openNameModal(createModal, '');
                break;
            case 'delete-folder':
                if (state.path !== '') {
                    remove([getItem(state.path)]);
                }
                break;
            case 'upload-to':
                // выбор файлов — сразу по нажатию (иначе браузер не откроет окно выбора)
                state.uploadPath = item.path;
                fileInput.click();
                break;
            case 'open':
                navigate(item.path);
                break;
            case 'rename':
                state.target = item;
                openNameModal(renameModal, item.name);
                break;
            case 'copy-path':
                copyPath(item);
                break;
            case 'download':
                download(item);
                break;
            case 'delete':
                // несколько выбранных — если меню открыто на одном из них (неактивный файл не выбирается)
                remove(item.type === 'file' && selectedItems.length > 1 && state.selected.has(item.path) ? selectedItems : [item]);
                break;
            case 'rename-save':
                saveName(renameModal, 'rename');
                break;
            case 'create-save':
                saveName(createModal, 'createDir');
                break;
        }
    };

    /* ---------- события ---------- */

    const itemOf = (target) => {
        const node = target.closest('[data-fm-path]');
        if (!node || !modal.contains(node) || node.dataset.fmKind === undefined) {
            return null;
        }
        return node.dataset.fmKind === 'dir' && node.classList.contains('file-tree-row')
            ? {type: 'dir', path: node.dataset.fmPath, name: baseName(node.dataset.fmPath)}
            : getItem(node.dataset.fmPath);
    };

    modal.addEventListener('click', (event) => {
        const actionButton = event.target.closest('[data-fm-action]');
        if (actionButton && !actionButton.disabled) {
            const menu = actionButton.closest('[data-fm-menu]');
            closeMenus();
            runAction(actionButton.dataset.fmAction, menu ? state.target : null);
            return;
        }
        closeMenus();
        const row = event.target.closest('.file-tree-row');
        if (row) {
            const path = row.dataset.fmPath;
            // стрелка — раскрыть или свернуть, название — открыть папку
            if (event.target.closest('[data-fm-toggle]') && !row.classList.contains('file-tree-row_leaf')) {
                state.expanded.has(path) ? state.expanded.delete(path) : state.expanded.add(path);
                renderTree();
                loadMissingLevels().catch(report);
            } else {
                navigate(path);
            }
            return;
        }
        const crumb = event.target.closest('.file-window__crumbs [data-fm-path]');
        if (crumb) {
            navigate(crumb.dataset.fmPath);
            return;
        }
        const card = event.target.closest('.file-card[data-fm-path]');
        if (card) {
            // на телефоне папка открывается касанием
            if (card.dataset.fmKind === 'dir' && window.matchMedia('(max-width: 811px)').matches) {
                navigate(card.dataset.fmPath);
                return;
            }
            select(card.dataset.fmPath, state.multiple || event.ctrlKey || event.metaKey);
        }
    });

    modal.addEventListener('dblclick', (event) => {
        const card = event.target.closest('.file-card[data-fm-path]');
        if (!card) {
            return;
        }
        if (card.dataset.fmKind === 'dir') {
            navigate(card.dataset.fmPath);
        } else {
            pick(card.dataset.fmPath);
        }
    });

    modal.addEventListener('contextmenu', (event) => {
        const item = itemOf(event.target);
        if (item) {
            event.preventDefault();
            openMenu(item, event.clientX, event.clientY);
        }
    });

    // долгое нажатие на сенсорном экране — меню
    let pressTimer = null;
    modal.addEventListener('touchstart', (event) => {
        const item = itemOf(event.target);
        if (!item) {
            return;
        }
        const touch = event.touches[0];
        pressTimer = setTimeout(() => openMenu(item, touch.clientX, touch.clientY), LONG_PRESS);
    }, {passive: true});
    ['touchend', 'touchmove', 'touchcancel'].forEach((type) => modal.addEventListener(type, () => clearTimeout(pressTimer)));

    modal.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && Object.values(menus).some((menu) => !menu.hidden)) {
            // Esc закрывает меню, а не окно
            event.stopPropagation();
            closeMenus();
            return;
        }
        const card = event.target.closest?.('.file-card[data-fm-path]');
        if (!card) {
            return;
        }
        if (event.key === 'Enter') {
            event.preventDefault();
            card.dataset.fmKind === 'dir' ? navigate(card.dataset.fmPath) : pick(card.dataset.fmPath);
        } else if (event.key === 'Delete') {
            event.preventDefault();
            remove(state.selected.size ? state.items.filter((item) => state.selected.has(item.path)) : [getItem(card.dataset.fmPath)]);
        } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault();
            const rect = card.getBoundingClientRect();
            openMenu(getItem(card.dataset.fmPath), rect.left + rect.width / 2, rect.bottom);
        }
    }, true);

    // Enter в окне имени — сохранить
    [renameModal, createModal].forEach((target) => {
        target.addEventListener('click', (event) => {
            const button = event.target.closest('[data-fm-action]');
            if (button) {
                runAction(button.dataset.fmAction, state.target);
            }
        });
        target.querySelector('[data-fm-name]').addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                runAction(target === renameModal ? 'rename-save' : 'create-save', state.target);
            }
        });
    });

    searchInput.addEventListener('input', renderFiles);
    sortInput.addEventListener('change', renderFiles);
    fileInput.addEventListener('change', () => {
        const path = state.uploadPath ?? state.path;
        state.uploadPath = null;
        upload([...fileInput.files], path);
        fileInput.value = '';
    });
    fileInput.addEventListener('cancel', () => {
        state.uploadPath = null;
    });
    // подсказка поиска — короче на телефоне (Figma: «Название файла»)
    const searchPlaceholder = () => {
        searchInput.placeholder = window.matchMedia('(max-width: 811px)').matches ? 'Название файла' : 'Введите название файла';
    };
    searchPlaceholder();
    window.matchMedia('(max-width: 811px)').addEventListener('change', searchPlaceholder);
    dialog.addEventListener('scroll', closeMenus, true);

    // перетаскивание файлов в окно
    let dragDepth = 0;
    const hasFiles = (event) => [...(event.dataTransfer?.types ?? [])].includes('Files');
    dialog.addEventListener('dragenter', (event) => {
        if (hasFiles(event)) {
            dragDepth++;
            dropElement.hidden = false;
        }
    });
    dialog.addEventListener('dragleave', () => {
        dragDepth = Math.max(0, dragDepth - 1);
        dropElement.hidden = dragDepth > 0 ? dropElement.hidden : true;
    });
    dialog.addEventListener('dragover', (event) => {
        if (hasFiles(event)) {
            event.preventDefault();
        }
    });
    dialog.addEventListener('drop', (event) => {
        if (!hasFiles(event)) {
            return;
        }
        event.preventDefault();
        dragDepth = 0;
        dropElement.hidden = true;
        upload([...event.dataTransfer.files]);
    });

    // любое закрытие окна (крестик, Esc, подложка, close(), «Готово»): ответ вызвавшему
    modal.addEventListener('modal:close', (event) => {
        if (event.target !== modal) {
            return;
        }
        closeMenus();
        state.added.clear();
        state.failed = [];
        const files = state.result;
        state.result = null;
        answer(files);
    });

    /* ---------- API ---------- */

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
        modal.classList.toggle('file-window_select', select);
        const isOpen = window.SimflexModal.isOpen(MODAL_ID);
        if (!isOpen) {
            window.SimflexModal.open(MODAL_ID);
        }
        if (!state.loaded) {
            state.loaded = true;
            navigate('');
            loadTree().catch(report);
        } else if (isOpen) {
            // то же окно с новыми условиями: карточки перерисовываются сразу
            renderFiles();
            refresh();
        } else {
            refresh();
        }
        return promise;
    };

    window.fileManager = {
        open,
        close: () => window.SimflexModal.close(MODAL_ID),
        // прежний вызов: один файл, callback получает путь от корня файлов
        init: (callback) => open({onSelect: callback ? (files) => callback(files[0].path) : null}),
    };
}
