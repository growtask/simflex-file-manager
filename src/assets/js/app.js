class Modal {
    constructor(selector, trigger) {
        this.modal = document.querySelector(selector);
        this.closeTriggers = this.modal.querySelectorAll('.js--fm-modal-close');
        this.toggleTirggers = document.querySelectorAll(trigger);

        this.#events();
    }

    #events() {
        this.closeTriggers.forEach(trigger => {
            trigger.addEventListener('click', () => this.close());
        });

        this.toggleTirggers.forEach(trigger => {
            trigger.addEventListener('click', () => this.open());
        })
    }

    open() {
        this.modal.classList.add('modal_active');
    }

    close() {
        this.modal.classList.remove('modal_active');
    }
}


class ModalDelete extends Modal {
    constructor(selector, trigger, callback = () => { }) {
        super(selector, trigger);
        this.callback = callback;
        this.title = this.modal.querySelector('.modal__title');

        this.deleteTriggers = this.modal.querySelectorAll('.js--fm-modal-delete').forEach(trigger => {
            trigger.addEventListener('click', () => this.onDelete());
        });
    }

    open(data) {
        this.modal.classList.add('modal_active');
        if (data) {
            this.title.textContent = data.title;
            this.callback = data.callback;
        }
    }

    onDelete() {
        this.close();
        this.callback();
    }

}


class ModalRename extends Modal {
    constructor(selector, trigger, callback) {
        super(selector, trigger);

        this.callback = callback;
        this.pathField = this.modal.querySelector('input[name=path]');
        this.prevNameField = this.modal.querySelector('input[name=prev_name]');
        this.newNameField = this.modal.querySelector('input[name=new_name]');

        this.modal.querySelectorAll('.js--fm-modal-rename-save').forEach(trigger => {
            trigger.addEventListener('click', () => {
                this.save();
            })
        });
    }

    getName() {
        return this.newNameField.value;
    }

    open(data) {
        this.pathField.value = data.path || '/';
        this.prevNameField.value = data.prevName || '';

        this.callback = data.callback;
        this.modal.classList.add('modal_active');
    }

    // TODO: MAKE THIS WORK!!!
    save() {
        this.close();
        this.callback(this.newNameField.value);
        this.newNameField.value = '';
    }
}


class ModalCreateFolder extends Modal {
    constructor(selector, trigger, callback) {
        super(selector, trigger);
        this.callback = callback;

        this.nameField = this.modal.querySelector('input[name=name]');

        this.modal.querySelectorAll('.js--fm-modal-save-trigger').forEach((item) => {
            item.addEventListener('click', () => {
                this.save();
            })
        });
    }

    save() {
        this.close();
        this.callback(this.nameField.value);
        this.nameField.value = '';
    }
}

class ModalFileUploader extends Modal {
    constructor(selector, trigger, callback) {
        super(selector, trigger);
        this.fileInput = this.modal.querySelector('.file-uploader__input');
        this.filesWrap = this.modal.querySelector('.file-uploader__files');


        this.callback = callback;

        this.path = '/';
        
        this.modal.querySelectorAll('.js--fm-modal-file-save').forEach(item => {
            item.addEventListener('click', () => {
                this.onSave();
                this.callback();
            });
        })
    }

    close() {
        this.modal.classList.remove('modal_active');
        this.filesWrap.innerHTML = '';
        this.filesWrap.style.display = 'none';
        if (this.callback) {
            this.callback();
        }
    }

    setPath(path) {
        this.path = path;
        this.fileInput.setAttribute('data-path', path);
    }

    get getPath() {
        return this.path;
    }


}

function iniitTextFields() {
    document.querySelectorAll('.text-field').forEach(textField => {
        textField.addEventListener('input', () => {
            if (textField.value.trim()) {
                textField.classList.add('text-field_has-value');
            } else {
                textField.classList.remove('text-field_has-value');
            }
        })
    });
}
function removeFileExtenstion(filename) {
    return filename.replace(/\.[^/.]+$/, "")
}

function replaceLastPathElement(path, replacement) {
    const parts = path.split('/');
    parts[parts.length - 1] = replacement;
    return parts.join('/');
}

function getFileExtenstion(filename) {
    return filename.split('.').pop();
}

function formatEnding(number, endings) {
    const cases = [2, 0, 1, 1, 1, 2];
    const index = (number % 100 > 4 && number % 100 < 20) ? 2 : cases[Math.min(number % 10, 5)];
    return number + ' ' + endings[index];
}

function handleOutsideClick(targetElement, callback) {
    function handleClickOutside(event) {
        if (targetElement && !targetElement.contains(event.target)) {
            callback();
        }
    }

    document.addEventListener('click', handleClickOutside);

    // Вернуть функцию для удаления слушателя события
    return function removeClickListener() {
        document.removeEventListener('click', handleClickOutside);
    };
}

function copyToClipboard(text) {
    return new Promise((resolve, reject) => {
        if (typeof navigator !== "undefined" && typeof navigator.clipboard !== "undefined" && navigator.permissions !== "undefined") {
            const type = "text/plain";
            const blob = new Blob([text], { type });
            const data = [new ClipboardItem({ [type]: blob })];
            navigator.permissions.query({ name: "clipboard-write" }).then((permission) => {
                if (permission.state === "granted" || permission.state === "prompt") {
                    navigator.clipboard.write(data).then(resolve, reject).catch(reject);
                }
                else {
                    reject(new Error("Permission not granted!"));
                }
            });
        }
        else if (document.queryCommandSupported && document.queryCommandSupported("copy")) {
            const textarea = document.createElement("textarea");
            textarea.textContent = text;
            textarea.style.position = "fixed";
            textarea.style.width = '2em';
            textarea.style.height = '2em';
            textarea.style.padding = 0;
            textarea.style.border = 'none';
            textarea.style.outline = 'none';
            textarea.style.boxShadow = 'none';
            textarea.style.background = 'transparent';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            try {
                document.execCommand("copy");
                document.body.removeChild(textarea);
                resolve();
            }
            catch (e) {
                document.body.removeChild(textarea);
                reject(e);
            }
        }
        else {
            reject(new Error("None of copying methods are supported by this browser!"));
        }
    });

}


async function download(url, filename) {
    const data = await fetch(url)
    const blob = await data.blob()
    const objectUrl = URL.createObjectURL(blob)

    const link = document.createElement('a')

    link.setAttribute('href', objectUrl)
    link.setAttribute('download', filename)
    link.style.display = 'none'

    document.body.appendChild(link)

    link.click()

    document.body.removeChild(link)
}

// ------------------------------
//          HTML TEMPLATE
// ------------------------------
/* 
    <nav class="context-menu" id="file-context-menu">
      <ul class="context-menu__items">
        <li class="context-menu__item">
          <a href="#" class="context-menu__link">Переименовать</a>
        </li>
        <li class="context-menu__item">
          <a href="#" class="context-menu__link">Скачать</a>
        </li>
        <li class="context-menu__item">
          <a href="#" class="context-menu__link">Копировать путь</a>
        </li>
        <li class="context-menu__item">
          <a href="#" class="context-menu__link">Удалить</a>
        </li>
      </ul>
    </nav>
*/

class ContextMenu {
  constructor(root, items) {
    this.root = root;
    this.items = items;
    this.content = null;
    this.isShow = false;

    this.events();
  }

  events() {
    window.addEventListener('resize', () => {
      this.hide();
    });

    handleOutsideClick(this.root, () => this.hide());
  }

  #renderTemplate(ev) {
    const ulElement = document.createElement('ul');
    ulElement.classList.add('context-menu__items');


    this.items.forEach(item => {
      const liElement = document.createElement('li');
      liElement.classList.add('context-menu__item');

      const buttonElement = document.createElement('button');
      buttonElement.classList.add('context-menu__link');
      buttonElement.textContent = item.name;
      buttonElement.setAttribute('tabindex', '0');

      buttonElement.addEventListener('click', () => {
        item.callback(ev);
        this.hide();
      });

      liElement.appendChild(buttonElement);
      ulElement.appendChild(liElement);


    });

    this.content = ulElement;
    this.root.appendChild(ulElement);
  }


  show(ev) {

    if (!this.isShow) {
      this.#renderTemplate(ev);
    }

    this.root.classList.add('context-menu_active');
    this.isShow = true;
    this.root.focus();
    this.root.setAttribute('tabindex', '0');
    this.root.style.display = 'block';
    this.root.style.left = `${ev.clientX}px`;
    this.root.style.top = `${ev.clientY}px`;



  }

  hide() {
    if (this.content) {
      this.isShow = false;
      this.content.remove();
    }
  }
}


/**
 * name
 * icon
 * callback
 */

class Toolbar {
  constructor(selector, items) {
    this.root = document.querySelector(selector);
    this.items = items;

    this.#renderTemplate();
  }

  open() {
    this.root.classList.add('f-manager__tapbar_active');
  }

  close() {
    this.root.classList.remove('f-manager__tapbar_active');
  }

  #renderTemplate() {
    this.items.forEach(item => {
      const buttonElement = document.createElement('button');
      buttonElement.classList.add('f-manager__tapbar-control', 'btn-menu');

      buttonElement.innerHTML = `
      <i class="btn-menu__icon">
        ${item.icon}
      </i>
      <span class="btn-menu__text">${item.name}</span>
      `;

      buttonElement.addEventListener('click', item.callback);

      this.root.appendChild(buttonElement);
    });
  }
}
class Accordion {
    constructor(el) {
        // Store the <details> element
        this.el = el;
        // Store the <summary> element
        this.summary = el.querySelector('summary');
        // Store the <div class="content"> element
        this.content = el.querySelector('ul');

        // Store the animation object (so we can cancel it if needed)
        this.animation = null;
        // Store if the element is closing
        this.isClosing = false;
        // Store if the element is expanding
        this.isExpanding = false;
        // Detect user clicks on the summary element
        this.summary.addEventListener('click', (e) => this.onClick(e));
    }

    onClick(e) {
        // Stop default behaviour from the browser
        e.preventDefault();
        // Add an overflow on the <details> to avoid content overflowing
        this.el.style.overflow = 'hidden';
        // Check if the element is being closed or is already closed
        if (this.isClosing || !this.el.open) {
            this.open();
            // Check if the element is being openned or is already open
        } else if (this.isExpanding || this.el.open) {
            this.shrink();
        }
    }

    shrink() {
        // Set the element as "being closed"
        this.isClosing = true;

        // Store the current height of the element
        const startHeight = `${this.el.offsetHeight}px`;
        // Calculate the height of the summary
        const endHeight = `${this.summary.offsetHeight}px`;

        // If there is already an animation running
        if (this.animation) {
            // Cancel the current animation
            this.animation.cancel();
        }

        // Start a WAAPI animation
        this.animation = this.el.animate({
            // Set the keyframes from the startHeight to endHeight
            height: [startHeight, endHeight]
        }, {
            duration: 150,

        });

        // When the animation is complete, call onAnimationFinish()
        this.animation.onfinish = () => this.onAnimationFinish(false);
        // If the animation is cancelled, isClosing variable is set to false
        this.animation.oncancel = () => this.isClosing = false;
    }

    open() {
        // Apply a fixed height on the element
        this.el.style.height = `${this.el.offsetHeight}px`;
        // Force the [open] attribute on the details element
        this.el.open = true;
        // Wait for the next frame to call the expand function
        window.requestAnimationFrame(() => this.expand());
    }

    expand() {
        // Set the element as "being expanding"
        this.isExpanding = true;
        // Get the current fixed height of the element
        const startHeight = `${this.el.offsetHeight}px`;
        // Calculate the open height of the element (summary height + content height)
        const endHeight = `${this.summary.offsetHeight + this.content.offsetHeight}px`;

        // If there is already an animation running
        if (this.animation) {
            // Cancel the current animation
            this.animation.cancel();
        }

        // Start a WAAPI animation
        this.animation = this.el.animate({
            // Set the keyframes from the startHeight to endHeight
            height: [startHeight, endHeight]
        }, {
            duration: 150,
        });
        // When the animation is complete, call onAnimationFinish()
        this.animation.onfinish = () => this.onAnimationFinish(true);
        // If the animation is cancelled, isExpanding variable is set to false
        this.animation.oncancel = () => this.isExpanding = false;
    }

    onAnimationFinish(open) {
        // Set the open attribute based on the parameter
        this.el.open = open;
        // Clear the stored animation
        this.animation = null;
        // Reset isClosing & isExpanding
        this.isClosing = false;
        this.isExpanding = false;
        // Remove the overflow hidden and the fixed height
        this.el.style.height = this.el.style.overflow = '';
    }
}

document.querySelectorAll('details').forEach((el) => {
    new Accordion(el);
});

// --------------------------
//       HTML TEMPLATE
// --------------------------
/*
	  <div class="notification">
		<span class="notification__text">Папка удалена</span>
		<a href="#" class="notification__link">Перейти</a>
	  </div>
*/


class NotificationStack {
	constructor(root, options) {
		this.stack = document.createElement("div");
		this.stack.className = "notifications";

		if (root) {
			root.appendChild(this.stack);
		} else {
			document.querySelector('body').appendChild(this.stack);
		}
	}

	addNotification(options) {
		const notify = new Notification(this.stack, options);

		setTimeout(() => {
			notify.hide();
		}, 3000)

		return notify;
	}
}

class Notification {
	constructor(stack, options) {
		this.stack = stack;
		this.options = options;

		this.title = (typeof options.title !== 'undefined') ? options.title : false;
		this.linkText = (typeof options.linkText !== 'undefined') ? options.linkText : false;
		this.link = (typeof options.link !== 'undefined') ? options.link : false;
		this.callback = (typeof options.callback !== 'undefined') ? options.callback : false;

		this.autoHide = (typeof options.autoHide !== 'undefined') ? options.autoHide : false;
		this.onClick = (typeof options.onClick !== 'undefined') ? options.onClick : false;
		this.priority = (typeof options.priority !== 'undefined') ? options.priority : false;


		let notificationTemplate = `
		<div class="notification notification_active">
			${this.title ? `<span class="notification__text">${this.title}</span>` : ''}
			${this.linkText ? `<a href="${this.link ? this.link : '#'}" class="notification__link">${this.linkText}</a>` : ''}
		</div>
		`;

		this.element = document.createElement("div");
		this.element.className = ' notification-wrapper in';
		this.element.innerHTML = notificationTemplate;

		if (this.callback) {
			this.element.querySelector('.notification__link').addEventListener('click', () => this.callback());
		}

		this.stack.prepend(this.element);

		return this;
	}

	hide() {
		this.element.classList.add('collapsed');
		setTimeout(() => this.element.remove(), 600);
	}
}

const folderContext = document.getElementById('folder-context-menu');
const fileContext = document.getElementById('file-context-menu');

const FileManager = {
    apiBase: '/bootstrap.php',
    rootDir: '',
    assetsDir: '',

    root: document.querySelector('.f-manager__wrapper'),
    workspace: null,
    notify: null,
    tree: null,
    fileGrid: null,
    filesMobile: null,
    breadcrumbs: null,


    toolbarDefault: null,
    toolbarFile: null,
    toolbarFolder: null,

    curPath: '',
    curFilePath: '',
    curDirPath: '',
    currFileName: '',

    files: {},

    folderContextMenu: null,
    fileContextMenu: null,

    deleteFolderTriggers: [],
    deleteFileTriggers: [],

    activeFolder: '',
    callback: () => {
    },

    modalFiles: null,
    modalCreate: null,
    modalRename: null,
    modalDelete: null,

    /**
     * Скролл
     * При удалении / добавлении не сбрасывать дерево
     * Фокус в модалке + ентер на отправку
     * DONE: Мисс клик по файлу
     * DONE: При клику на рефреш, открывать дерево заного на ту позицую где был юзер
     * 
     */

    init(callback) {

        this.workspace = this.root.querySelector('.f-manager');
        this.tree = this.root.querySelector('.f-manager__tree');
        this.fileGrid = this.root.querySelector('.f-manager__files-grid');
        this.filesMobile = this.root.querySelector('.f-manager__files-column');
        this.breadcrumbs = this.root.querySelector('.f-manager__nav-list');

        this.deleteFolderTriggers = this.root.querySelectorAll('.js--fm-delete-folder');
        this.deleteFileTriggers = this.root.querySelectorAll('.js--fm-delete-file');

        this.callback = callback;

        this.toolbarDefault = new Toolbar('#f-tapbar-default', [
            {
                name: 'Назад',
                callback: () => {
                    if (this.curDirPath) {
                        const paths = this.curDirPath.split("/");
                        paths.pop();
                        this.curDirPath = paths.join("/");
                        this._navigate(this.curDirPath);
                    } else {
                        this.close();
                    }
                },
                icon: `
                <svg xmlns="http://www.w3.org/2000/svg" width="25" height="24" viewBox="0 0 25 24" fill="none">
                    <path d="M14.8 6L8.80005 12L14.8 18" stroke="#1461CC" stroke-width="2" stroke-linecap="round"
                    stroke-linejoin="round" />
                </svg>
                `
            },
            {
                name: 'Загрузить',
                callback: () => { this.modalFiles.open() },
                icon: `
                <svg xmlns="http://www.w3.org/2000/svg" width="25" height="24" viewBox="0 0 25 24" fill="none">
                    <path
                    d="M21.4 15V16.2C21.4 17.8802 21.4 18.7202 21.073 19.362C20.7854 19.9265 20.3265 20.3854 19.762 20.673C19.1203 21 18.2802 21 16.6 21H8.20002C6.51987 21 5.67979 21 5.03805 20.673C4.47357 20.3854 4.01462 19.9265 3.727 19.362C3.40002 18.7202 3.40002 17.8802 3.40002 16.2V15M17.4 8L12.4 3M12.4 3L7.40002 8M12.4 3V15"
                    stroke="#1461CC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                `
            },
            {
                name: 'Создать',
                callback: () => { this.modalCreate.open(); },
                icon: `
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path
                    d="M13 7L11.8845 4.76892C11.5634 4.1268 11.4029 3.80573 11.1634 3.57116C10.9516 3.36373 10.6963 3.20597 10.4161 3.10931C10.0992 3 9.74021 3 9.02229 3H5.2C4.0799 3 3.51984 3 3.09202 3.21799C2.71569 3.40973 2.40973 3.71569 2.21799 4.09202C2 4.51984 2 5.0799 2 6.2V7M2 7H17.2C18.8802 7 19.7202 7 20.362 7.32698C20.9265 7.6146 21.3854 8.07354 21.673 8.63803C22 9.27976 22 10.1198 22 11.8V16.2C22 17.8802 22 18.7202 21.673 19.362C21.3854 19.9265 20.9265 20.3854 20.362 20.673C19.7202 21 18.8802 21 17.2 21H6.8C5.11984 21 4.27976 21 3.63803 20.673C3.07354 20.3854 2.6146 19.9265 2.32698 19.362C2 18.7202 2 17.8802 2 16.2V7ZM12 17V11M9 14H15"
                    stroke="#1461CC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                `
            },
            {
                name: 'Обновить',
                callback: () => {
                    this._updateTree();
                    this._navigate(this.curDirPath);
                },
                icon: `
                <svg xmlns="http://www.w3.org/2000/svg" width="25" height="24" viewBox="0 0 25 24" fill="none">
                    <path
                    d="M2.6001 14C2.6001 14 2.72142 14.8492 6.23614 18.364C9.75086 21.8787 15.4493 21.8787 18.9641 18.364C20.2093 17.1187 21.0134 15.5993 21.3763 14M2.6001 14V20M2.6001 14H8.6001M22.6001 10C22.6001 10 22.4788 9.15076 18.9641 5.63604C15.4493 2.12132 9.75086 2.12132 6.23614 5.63604C4.99086 6.88131 4.18679 8.40072 3.82393 10M22.6001 10V4M22.6001 10H16.6001"
                    stroke="#1461CC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                `
            },
            {
                name: 'Готово',
                callback: () => { this.onSave() },
                icon: `
                <svg xmlns="http://www.w3.org/2000/svg" width="25" height="24" viewBox="0 0 25 24" fill="none">
                    <path d="M5.20007 12L10.2001 17L19.2001 8" stroke="#1461CC" stroke-width="2" stroke-linecap="round"
                    stroke-linejoin="round" />
                </svg>
                `
            },

        ]);
        this.toolbarFolder = new Toolbar('#f-tapbar-folder', [
            {
                name: 'Отмена',
                callback: () => {
                    this.filesMobile.querySelectorAll('.folder-card-mob').forEach(item => {
                        item.classList.remove('folder-card-mob_active');
                    });

                    this._activateMobileTapbar(this.toolbarDefault);
                },
                icon: `
                <svg xmlns="http://www.w3.org/2000/svg" width="25" height="24" viewBox="0 0 25 24" fill="none">
                    <path d="M14.8 6L8.80005 12L14.8 18" stroke="#1461CC" stroke-width="2" stroke-linecap="round"
                    stroke-linejoin="round" />
                </svg>
                `
            },
            {
                name: 'Загрузить',
                callback: () => {
                    this.modalFiles.open();
                },
                icon: `
                <svg xmlns="http://www.w3.org/2000/svg" width="25" height="24" viewBox="0 0 25 24" fill="none">
                    <path
                    d="M21.4 15V16.2C21.4 17.8802 21.4 18.7202 21.073 19.362C20.7854 19.9265 20.3265 20.3854 19.762 20.673C19.1203 21 18.2802 21 16.6 21H8.20002C6.51987 21 5.67979 21 5.03805 20.673C4.47357 20.3854 4.01462 19.9265 3.727 19.362C3.40002 18.7202 3.40002 17.8802 3.40002 16.2V15M17.4 8L12.4 3M12.4 3L7.40002 8M12.4 3V15"
                    stroke="#1461CC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                `
            },
            {
                name: 'Создать',
                callback: (ev) => {
                    this.curDirPath = ev.target.dataset.path;
                    this.modalCreate.callback = () => this._createFolder(this.curDirPath);
                    this.modalCreate.open();
                },
                icon: `
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path
                    d="M13 7L11.8845 4.76892C11.5634 4.1268 11.4029 3.80573 11.1634 3.57116C10.9516 3.36373 10.6963 3.20597 10.4161 3.10931C10.0992 3 9.74021 3 9.02229 3H5.2C4.0799 3 3.51984 3 3.09202 3.21799C2.71569 3.40973 2.40973 3.71569 2.21799 4.09202C2 4.51984 2 5.0799 2 6.2V7M2 7H17.2C18.8802 7 19.7202 7 20.362 7.32698C20.9265 7.6146 21.3854 8.07354 21.673 8.63803C22 9.27976 22 10.1198 22 11.8V16.2C22 17.8802 22 18.7202 21.673 19.362C21.3854 19.9265 20.9265 20.3854 20.362 20.673C19.7202 21 18.8802 21 17.2 21H6.8C5.11984 21 4.27976 21 3.63803 20.673C3.07354 20.3854 2.6146 19.9265 2.32698 19.362C2 18.7202 2 17.8802 2 16.2V7ZM12 17V11M9 14H15"
                    stroke="#1461CC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                `
            },
            {
                name: 'Изменить',
                callback: (ev) => {
                    const path = this.curDirPath;
                    const name = path.split("/").at(-1);


                    this.modalRename.open({
                        callback: () => {
                            this.curDirPath = replaceLastPathElement(path, '');
                            this._renameFolder(path, this.modalRename.getName());

                        },
                        path: path,
                        prevName: name,
                    });
                },
                icon: `
                <svg xmlns="http://www.w3.org/2000/svg" width="25" height="24" viewBox="0 0 25 24" fill="none">
                    <path
                    d="M11.6001 4.00001H7.4001C5.71994 4.00001 4.87986 4.00001 4.23813 4.32699C3.67364 4.61461 3.2147 5.07356 2.92708 5.63804C2.6001 6.27978 2.6001 7.11986 2.6001 8.80001V17.2C2.6001 18.8802 2.6001 19.7203 2.92708 20.362C3.2147 20.9265 3.67364 21.3854 4.23813 21.673C4.87986 22 5.71994 22 7.4001 22H15.8001C17.4803 22 18.3203 22 18.9621 21.673C19.5266 21.3854 19.9855 20.9265 20.2731 20.362C20.6001 19.7203 20.6001 18.8802 20.6001 17.2V13M8.60007 16H10.2746C10.7638 16 11.0084 16 11.2386 15.9448C11.4426 15.8958 11.6377 15.815 11.8167 15.7053C12.0185 15.5816 12.1915 15.4087 12.5374 15.0628L22.1001 5.50001C22.9285 4.67159 22.9285 3.32844 22.1001 2.50001C21.2717 1.67159 19.9285 1.67159 19.1001 2.50001L9.53733 12.0628C9.19143 12.4087 9.01848 12.5816 8.89479 12.7834C8.78513 12.9624 8.70432 13.1575 8.65533 13.3616C8.60007 13.5917 8.60007 13.8363 8.60007 14.3255V16Z"
                    stroke="#1461CC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                `
            },
            {
                name: 'Удалить',
                callback: () => {
                    this.modalDelete.open({
                        title: 'Удалить папку',
                        callback: () => {
                            this._onFolderDelete(replaceLastPathElement(this.curDirPath, ''));
                        }
                    }); 1
                },
                icon: `
                <svg xmlns="http://www.w3.org/2000/svg" width="25" height="24" viewBox="0 0 25 24" fill="none">
                    <path
                    d="M9.19995 3H15.2M3.19995 6H21.2M19.2 6L18.4987 16.5193C18.3934 18.0975 18.3408 18.8867 18 19.485C17.6999 20.0118 17.2472 20.4353 16.7016 20.6997C16.0819 21 15.291 21 13.7093 21H10.6906C9.10886 21 8.31798 21 7.69829 20.6997C7.15271 20.4353 6.70004 20.0118 6.39993 19.485C6.05906 18.8867 6.00645 18.0975 5.90124 16.5193L5.19995 6"
                    stroke="#1461CC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                `
            },
        ]);
        this.toolbarFile = new Toolbar('#f-tapbar-file', [
            {
                name: 'Отмена',
                callback: () => { 
                    this.filesMobile.querySelectorAll('.file-card-mob').forEach((file) => {
                        file.classList.remove('file-card-mob_active');
                        this.curFilePath = '';
                        this._activateMobileTapbar(this.toolbarDefault);
                    });
                },
                icon: `
                <svg xmlns="http://www.w3.org/2000/svg" width="25" height="24" viewBox="0 0 25 24" fill="none">
                    <path d="M14.8 6L8.80005 12L14.8 18" stroke="#1461CC" stroke-width="2" stroke-linecap="round"
                    stroke-linejoin="round" />
                </svg>
                `
            },
            {
                name: 'Скачать',
                callback: () => { 
                    const filename = this.curFilePath.split("/").pop();
                    download(this.apiBase + `?method=download&path=${this.curFilePath}`, filename).then(() => {
                        this.notify.addNotification({
                            title: `Файл: ${filename} скачивается`,
                        })
                    });
                },
                icon: `
                <svg xmlns="http://www.w3.org/2000/svg" width="25" height="24" viewBox="0 0 25 24" fill="none">
                    <path d="M21.4001 15V16.2C21.4001 17.8802 21.4001 18.7202 21.0732 19.362C20.7855 19.9265 20.3266 20.3854 19.7621 20.673C19.1204 21 18.2803 21 16.6001 21H8.20015C6.51999 21 5.67991 21 5.03817 20.673C4.47369 20.3854 4.01475 19.9265 3.72713 19.362C3.40015 18.7202 3.40015 17.8802 3.40015 16.2V15M17.4001 10L12.4001 15M12.4001 15L7.40015 10M12.4001 15V3" stroke="#1461CC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                `
            },
            {
                name: 'Путь',
                callback: () => { 
                    copyToClipboard(this.curFilePath);

                    this.notify.addNotification({
                        title: 'Путь скопирован',
                    });
                 },
                icon: `
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M8 8V5.2C8 4.0799 8 3.51984 8.21799 3.09202C8.40973 2.71569 8.71569 2.40973 9.09202 2.21799C9.51984 2 10.0799 2 11.2 2H18.8C19.9201 2 20.4802 2 20.908 2.21799C21.2843 2.40973 21.5903 2.71569 21.782 3.09202C22 3.51984 22 4.0799 22 5.2V12.8C22 13.9201 22 14.4802 21.782 14.908C21.5903 15.2843 21.2843 15.5903 20.908 15.782C20.4802 16 19.9201 16 18.8 16H16M5.2 22H12.8C13.9201 22 14.4802 22 14.908 21.782C15.2843 21.5903 15.5903 21.2843 15.782 20.908C16 20.4802 16 19.9201 16 18.8V11.2C16 10.0799 16 9.51984 15.782 9.09202C15.5903 8.71569 15.2843 8.40973 14.908 8.21799C14.4802 8 13.9201 8 12.8 8H5.2C4.0799 8 3.51984 8 3.09202 8.21799C2.71569 8.40973 2.40973 8.71569 2.21799 9.09202C2 9.51984 2 10.0799 2 11.2V18.8C2 19.9201 2 20.4802 2.21799 20.908C2.40973 21.2843 2.71569 21.5903 3.09202 21.782C3.51984 22 4.07989 22 5.2 22Z" stroke="#1461CC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                `
            },
            {
                name: 'Изменить',
                callback: (ev) => { 
                    const filename = this.curFilePath.split("/").pop();
                    this.curDirPath = replaceLastPathElement(this.curFilePath, '');

                    this.modalRename.open({
                        path: this.curFilePath,
                        prevName: filename,
                        callback: () => this._renameFile(this.curFilePath, this.modalRename.getName()),
                    });
                },
                icon: `
                <svg xmlns="http://www.w3.org/2000/svg" width="25" height="24" viewBox="0 0 25 24" fill="none">
                    <path
                    d="M11.6001 4.00001H7.4001C5.71994 4.00001 4.87986 4.00001 4.23813 4.32699C3.67364 4.61461 3.2147 5.07356 2.92708 5.63804C2.6001 6.27978 2.6001 7.11986 2.6001 8.80001V17.2C2.6001 18.8802 2.6001 19.7203 2.92708 20.362C3.2147 20.9265 3.67364 21.3854 4.23813 21.673C4.87986 22 5.71994 22 7.4001 22H15.8001C17.4803 22 18.3203 22 18.9621 21.673C19.5266 21.3854 19.9855 20.9265 20.2731 20.362C20.6001 19.7203 20.6001 18.8802 20.6001 17.2V13M8.60007 16H10.2746C10.7638 16 11.0084 16 11.2386 15.9448C11.4426 15.8958 11.6377 15.815 11.8167 15.7053C12.0185 15.5816 12.1915 15.4087 12.5374 15.0628L22.1001 5.50001C22.9285 4.67159 22.9285 3.32844 22.1001 2.50001C21.2717 1.67159 19.9285 1.67159 19.1001 2.50001L9.53733 12.0628C9.19143 12.4087 9.01848 12.5816 8.89479 12.7834C8.78513 12.9624 8.70432 13.1575 8.65533 13.3616C8.60007 13.5917 8.60007 13.8363 8.60007 14.3255V16Z"
                    stroke="#1461CC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                `
            },
            {
                name: 'Удалить',
                callback: () => { 
                    this.modalDelete.open({
                        title: 'Удалить файл',
                        callback: () => {
                            this._onFileDelete();
                        }
                    });
                },
                icon: `
                <svg xmlns="http://www.w3.org/2000/svg" width="25" height="24" viewBox="0 0 25 24" fill="none">
                    <path
                    d="M9.19995 3H15.2M3.19995 6H21.2M19.2 6L18.4987 16.5193C18.3934 18.0975 18.3408 18.8867 18 19.485C17.6999 20.0118 17.2472 20.4353 16.7016 20.6997C16.0819 21 15.291 21 13.7093 21H10.6906C9.10886 21 8.31798 21 7.69829 20.6997C7.15271 20.4353 6.70004 20.0118 6.39993 19.485C6.05906 18.8867 6.00645 18.0975 5.90124 16.5193L5.19995 6"
                    stroke="#1461CC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                `
            },
        ]);

        this.modalFiles = new ModalFileUploader('#modal-files', '.js--fm-modal-files', () => {
            this._updateFiles(this.curDirPath);
        });
        this.modalCreate = new ModalCreateFolder('#modal-create', '.js--fm-modal-create', (path) => {
            this.onCreateDirSave(path);
        });
        this.modalRename = new ModalRename('#modal-rename', '.js--fm-modal-rename');
        this.modalDelete = new ModalDelete('#modal-delete');

        this.fileContextMenu = new ContextMenu(fileContext, [
            {
                name: 'Переименовать',
                callback: (ev) => {
                    const path = ev.target.getAttribute('path');
                    const name = ev.target.dataset.name;
                    
                    this.modalRename.open({
                        callback: (name) => {
                            this._renameFile(path, name);
                        },
                        path: path,
                        prevName: name,
                    });
                },
            },
            {
                name: 'Скачать',
                callback: (ev) => {
                    this._downloadFile(ev)
                },
            },
            {
                name: 'Копировать путь',
                callback: (ev) => {
                    this._copyFilePath(ev);
                },
            },
            {
                name: 'Удалить',
                callback: () => {
                    this.modalDelete.open({
                        title: 'Удалить файл',
                        callback: () => {
                            this._onFileDelete();
                        },
                    });
                },
            },
        ]);
        this.folderContextMenu = new ContextMenu(folderContext, [
            {
                name: 'Создать папку',
                callback: (ev) => {
                    this.curDirPath = ev.target.dataset.path;
                    this.modalCreate.open();
                },
            },
            {
                name: 'Переименовать',
                callback: (ev) => {
                    const path = ev.target.dataset.path;
                    const name = path.split("/").at(-1);

                    this.modalRename.open({
                        callback: () => {
                            this.curDirPath = replaceLastPathElement(path, this.modalRename.getName());
                            this._renameFolder(path, this.modalRename.getName());
                        },
                        path: path,
                        prevName: name,
                    });
                },
            },
            {
                name: 'Копировать путь',
                callback: (ev) => {
                    this._copyFolderPath(ev)
                },
            },
            {
                name: 'Загрузить файлы',
                callback: () => {
                    this.modalFiles.open()
                },
            },
            {
                name: 'Удалить',
                callback: () => {
                    this.modalDelete.open({
                        title: 'Удалить папку',
                        callback: () => {
                            this._onFolderDelete();
                        }
                    });
                },
            },
        ])

        this.notify = new NotificationStack(this.workspace);

        this.root.querySelectorAll('[data-tip]').forEach((el) => {
            tippy(el, {
                content: el.dataset.tip,
                arrow: false,
                placement: 'bottom',
                duration: 0,
            });
        });

        this._updateTree();
        this._updateFiles();
        this._updateBreadcrumbs('');
        this._events();
        this._updateFileInfo();

        iniitTextFields();
    },

    onCreateDirSave(path) {
        this._createFolder(this.curDirPath, path);
    },

    onMobileCreateDirSave() {

    },

    _mapErrorCodeToStr(code) {
        switch (code) {
            case 'network_error':
                return 'Ошибка сети';
            case 'unknown_error':
                return 'Неизвестная ошибка';
            case 'not_authenticated':
                return 'Нет доступа';
            case 'method_not_found':
                return 'Метод не найден';
            case 'invalid_path':
                return 'Неверный путь';
            case 'invalid_name':
                return 'Неверное имя';
            case 'no_permissions':
                return 'Недостаточно прав';
            case 'file_too_large':
                return 'Недостаточно прав';
            case 'nothing_uploaded':
                return 'Недостаточно прав';
            case 'does_not_exist':
                return 'Файл или папка не существует';
            case 'already_exists':
                return 'Такой файл или папка уже существует';
        }

        return 'Неизвестная ошибка';
    },

    _reportError(code) {
        this.notify.addNotification({
            title: this._mapErrorCodeToStr(code)
        });
    },

    _events() {
        this.tree.addEventListener('contextmenu', (ev) => {
            if (ev.target.closest('.link-menu')) {
                ev.preventDefault();
                this.folderContextMenu.show(ev);
                this.fileContextMenu.hide();
            } else {
                this.folderContextMenu.hide();
            }
        });

        this.fileGrid.addEventListener('contextmenu', (ev) => {
            if (ev.target.closest('.f-card')) {
                ev.preventDefault();
                this.curFilePath = '';
                this.fileContextMenu.show(ev);
                this.folderContextMenu.hide();
            } else {
                this.fileContextMenu.hide();
            }
        });

        this.root.querySelectorAll('.js--fm-delete-file').forEach(item => {
            item.addEventListener('click', () => {
                this.modalDelete.open({
                    title: 'Удалить файл',
                    callback: () => { this._onFileDelete(); }
                });
            });
        });

        this.root.querySelectorAll('.js--fm-delete-folder').forEach(item => {
            item.addEventListener('click', () => {
                this.modalDelete.open({
                    title: 'Удалить папку',
                    callback: () => { this._onFolderDelete(); }
                });
            });
        });

        this.root.querySelectorAll('.js--fm-refresh').forEach(item => {
            item.addEventListener('click', () => {
                this._updateTree();
                this._navigate(this.curDirPath);
            })
        });

        this.root.querySelectorAll('.js--fm-home').forEach(item => {
            item.addEventListener('click', () => {
                this.curDirPath = '';
                this.curFilePath = '';
                this._navigate('');
            });
        });

        this.root.querySelectorAll('.js--fm-close').forEach(item => {
            item.addEventListener('click', () => {
                this.close();
            });
        });

        this.root.querySelectorAll('.js--fm-save').forEach(item => {
            item.addEventListener('click', () => {
                this.onSave();
            });
        });


    },

    /**
     *
     * @returns The folder tree as JSON
     */
    async _getTree() {
        try {
            const res = await fetch(this.apiBase + '?method=getTree');

            if (!res.ok) {
                this._reportError('network_error');
                return [];
            }

            const data = await res.json();
            if (!data.success) {
                this._reportError(data.error);
                return [];
            }

            return data.data;

        } catch (error) {
            this._reportError('unknown_error');
            console.error("Something went wrong... \n\n", error);
        }

    },

    async _getFiles(path = '', includeDirs = false) {
        try {
            const res = await fetch(this.apiBase + `?method=getFileList&path=${path}&include_dirs=${includeDirs ? 1 : 0}`);

            if (!res.ok) {
                this._reportError('network_error');
                return [];
            }

            const data = await res.json();
            if (!data.success) {
                this._reportError(data.error);
                return [];
            }

            return data.data;

        } catch (error) {
            this._reportError('unknown_error');
            console.error("Something went wrong... \n\n", error);
        }
    },

    async _createDir(path, name) {
        try {
            const res = await fetch(this.apiBase + `?method=createDir&path=${path}&name=${name}`);
            if (!res.ok) {
                this._reportError('network_error');
                return false;
            }

            const data = await res.json();
            if (!data.success) {
                this._reportError(data.error);
                return false;
            }

            const ans = data.data;
            if (ans.error !== '') {
                this._reportError(ans.error);
                return false;
            }

            return true;
        } catch (error) {
            this._reportError('unknown_error');
            console.log(error);
        }
    },

    async _rename(path, name) {
        try {
            const res = await fetch(this.apiBase + `?method=rename&path=${path}&name=${name}`);
            if (!res.ok) {
                this._reportError('network_error');
                return false;
            }

            const data = await res.json();
            if (!data.success) {
                this._reportError(data.error);
                return false;
            }

            const ans = data.data;
            if (ans.error !== '') {
                this._reportError(ans.error);
                return false;
            }

            return true;
        } catch (error) {
            this._reportError('unknown_error');
            console.log(error);
        }
    },

    async _unlink(path) {
        try {
            const res = await fetch(this.apiBase + `?method=delete&path=${path}`);
            if (!res.ok) {
                this._reportError('network_error');
                return false;
            }

            const data = await res.json();
            if (!data.success) {
                this._reportError(data.error);
                return false;
            }

            const ans = data.data;
            if (ans.error !== '') {
                this._reportError(ans.error);
                return false;
            }

            return true;
        } catch (error) {
            this._reportError('unknown_error');
            console.log(error);
        }
    },

    _sortItemsByName(list) {
        return (list ?? []).sort(function (a, b) {
            return a.name.localeCompare(b.name);
        });
    },

    _sortItemsByType(list) {
        let a = [];
        let b = [];

        if (!list) {
            return [];
        }

        for (const i of list) {
            if (i.type === 'dir') {
                a.push(i);
            } else {
                b.push(i);
            }
        }

        a = this._sortItemsByName(a);
        b = this._sortItemsByName(b);

        return [...a, ...b];
    },

    _updateTree() {
        this._getTree().then((data) => {
            this.tree.innerHTML = '';

            // sort files by name recursively
            data = this._sortItemsByName(data);
            data.forEach((folder) => {
                const folderEl = this._createFolderHTML(folder);
                this.tree.appendChild(folderEl);

                const nestringItems = folderEl.querySelectorAll('[data-path]');
                let currIdx = 0;

                nestringItems.forEach(((item, i) => {
                    if (item.dataset.path === this.curDirPath) {
                        currIdx = i + 1;
                    }
                }));

                for (let i = 0; i < currIdx; i++) {

                    const parentEl = nestringItems[i].parentElement.parentElement;


                    // Open if it is details element
                    if (parentEl.tagName === 'DETAILS') {
                        parentEl.setAttribute('open', '');
                    }

                    // Set active state
                    if (i === currIdx - 1) {
                        nestringItems[i].classList.add('link-menu_active');
                    }

                }

            });
        });
    },
    _updateFiles(path = '') {
        this._getFiles(path, true).then((data) => {
            this.fileGrid.innerHTML = '';
            this.filesMobile.innerHTML = '';

            data = this._sortItemsByType(data);
            data.forEach((file) => {
                this.files[file.path] = file;
                if (file.type !== 'dir') {
                    this.fileGrid.appendChild(this._createFileHTML(file));
                    this.filesMobile.appendChild(this._createFileMobileHTML(file));
                } else {
                    this.filesMobile.appendChild(this._createFolderMobileHTML(file));
                }
            });

            // Hide delte control
            this.root.querySelectorAll('.js--fm-delete-file').forEach(item => {
                item.style.display = 'none';
            });
        });
    },
    _updateBreadcrumbs(path) {
        const paths = path.split('/');
        this.breadcrumbs.innerHTML = '';
        let breadcrumbPath = '';

        // For mobile versions
        this._activateMobileTapbar(this.toolbarDefault);

        paths.forEach((breacrumb, i) => {
            if (breacrumb) {
                breadcrumbPath += '/' + breacrumb;

                this.breadcrumbs.appendChild(this._createBreadcrumbHTML(breacrumb, breadcrumbPath, i === paths.length - 1));
            }
        })
    },
    _navigate(path) {
        this.curPath = path;
        this._updateBreadcrumbs(path);
        this._updateFiles(path);
    },

    // _createFolderMobile(path, name) {
    //     this._createDir(!path ? this.curPath : path, name).then((res) => {
    //         if (!res) {
    //             return;
    //         }

    //         this._updateTree();
    //         this._updateFiles(this.curPath);

    //         this.notify.addNotification({
    //             title: `Папка ${name} создана`
    //         });
    //     })
    // },

    _createFolder(path, name) {
        this._createDir(!path ? this.curPath : path, name).then((res) => {
            if (!res) {
                return;
            }

            this._updateTree();
            this._updateFiles(path);

            this.notify.addNotification({
                title: `Папка ${name} создана`
            });
        });
    },

    _renameFolder(path, name) {
        this._rename(path, name).then((res) => {
            if (!res) {
                return;
            }

            this._updateTree();
            this._updateFiles(this.curDirPath);

            this.notify.addNotification({
                title: `Папка переименована`
            });
        });
    },

    _copyFolderPath(ev) {
        const path = '' + ev.target.dataset.path;
        // copy(path);

        this.notify.addNotification({
            title: 'Путь скопирован',
        });
    },
    _uploadFiles(path) {
    },

    _renameFile(path, name) {
        this._rename(path, name).then((res) => {
            if (!res) {
                return;
            }

            this._updateTree();
            this._updateFiles(this.curPath);
            this.notify.addNotification({
                title: `Файл переименована`
            });
        });
    },
    _copyFilePath(ev) {
        const path = '' + ev.target.getAttribute('path');
        copy(path);

        this.notify.addNotification({
            title: 'Путь скопирован',
        });
    },

    _downloadFile(ev) {
        const path = ev.target.getAttribute('path');
        const filename = ev.target.dataset.name;
        download(this.apiBase + `?method=download&path=${path}`, filename).then(() => {
            this.notify.addNotification({
                title: `Файл: ${filename} скачивается`,
            })
        });
    },

    _delete() {
    },


    _updateFileInfo(data) {
        const info = this.root.querySelector('.f-manager__info');

        if (data) {
            const infoTitle = info.querySelector('.f-manager__info-title');
            const infoSizeParam = info.querySelector('.f-manager__info-param_size span');
            const infoDimensionsParam = info.querySelector('.f-manager__info-param_dimensions span');
            const infoEditedParam = info.querySelector('.f-manager__info-param_edited span');

            infoTitle.textContent = data.title;
            infoSizeParam.textContent = `${data.size} ${data.size_ext}`;
            infoDimensionsParam.textContent = data.dimensions;
            infoEditedParam.textContent = data.edited;

            info.style.display = 'flex';
            infoTitle.style.display = data.title ? 'inline' : 'none';
            infoSizeParam.parentElement.style.display = data.size ? 'flex' : 'none';
            infoDimensionsParam.parentElement.style.display = data.dimensions ? 'flex' : 'none';
            infoEditedParam.parentElement.style.display = data.edited ? 'flex' : 'none';
        } else {
            info.style.display = 'none';
        }

    },

    _createFolderHTML(folder, nesting = 2) {
        // Создать элементы для папки
        let li = document.createElement('li');
        if (folder.data && folder.data.length > 0) {
            let details = document.createElement('details');
            let summary = document.createElement('summary');
            summary.innerHTML = `
                <div path="${folder.path}" class="link-menu link-menu_has-children">
                    <button class="link-menu__tree btn-tree">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path fill-rule="evenodd" clip-rule="evenodd" d="M6.86193 10.4714C6.60158 10.211 6.60158 9.78893 6.86193 9.52859L8.39052 7.99999L6.86193 6.47139C6.60158 6.21104 6.60158 5.78893 6.86193 5.52859C7.12228 5.26824 7.54439 5.26824 7.80474 5.52859L9.80474 7.52858C10.0651 7.78893 10.0651 8.21104 9.80474 8.47139L7.80474 10.4714C7.54439 10.7317 7.12228 10.7317 6.86193 10.4714Z" fill="#1975F7"></path>
                        </svg>
                    </button>
                    <button class="link-menu__control">
                        <svg class="link-menu__icon link-menu__icon_folder" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M8.66667 4.66667L7.92297 3.17928C7.70894 2.7512 7.60191 2.53715 7.44225 2.38078C7.30105 2.24249 7.13088 2.13732 6.94405 2.07287C6.73278 2 6.49347 2 6.01486 2H3.46667C2.71993 2 2.34656 2 2.06135 2.14532C1.81047 2.27316 1.60649 2.47713 1.47866 2.72801C1.33334 3.01323 1.33334 3.3866 1.33334 4.13333V4.66667M1.33334 4.66667H11.4667C12.5868 4.66667 13.1468 4.66667 13.5746 4.88465C13.951 5.0764 14.2569 5.38236 14.4487 5.75869C14.6667 6.18651 14.6667 6.74656 14.6667 7.86667V10.8C14.6667 11.9201 14.6667 12.4802 14.4487 12.908C14.2569 13.2843 13.951 13.5903 13.5746 13.782C13.1468 14 12.5868 14 11.4667 14H4.53334C3.41323 14 2.85318 14 2.42535 13.782C2.04903 13.5903 1.74307 13.2843 1.55132 12.908C1.33334 12.4802 1.33334 11.9201 1.33334 10.8V4.66667Z" stroke="#63A1F7" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
                        </svg>
                        <span class="link-menu__text">
                          ${folder.name}
                        </span>
                    </button>
                </div>
            `;

            let ul = document.createElement('ul');
            ul.style = `--nesting: ${nesting}`;

            folder.data.forEach((childFolder) => {
                ul.appendChild(this._createFolderHTML(childFolder, nesting + 1));
            });

            details.appendChild(summary);
            details.appendChild(ul);
            new Accordion(details);

            li.appendChild(details);
        } else {
            li.innerHTML = `
                <div path="${folder.path}" class="link-menu">
                    <button class="link-menu__tree btn-tree">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path fill-rule="evenodd" clip-rule="evenodd" d="M6.86193 10.4714C6.60158 10.211 6.60158 9.78893 6.86193 9.52859L8.39052 7.99999L6.86193 6.47139C6.60158 6.21104 6.60158 5.78893 6.86193 5.52859C7.12228 5.26824 7.54439 5.26824 7.80474 5.52859L9.80474 7.52858C10.0651 7.78893 10.0651 8.21104 9.80474 8.47139L7.80474 10.4714C7.54439 10.7317 7.12228 10.7317 6.86193 10.4714Z" fill="#1975F7"></path>
                    </svg>
                    </button>
                    <button class="link-menu__control">
                        <svg class="link-menu__icon link-menu__icon_folder" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M8.66667 4.66667L7.92297 3.17928C7.70894 2.7512 7.60191 2.53715 7.44225 2.38078C7.30105 2.24249 7.13088 2.13732 6.94405 2.07287C6.73278 2 6.49347 2 6.01486 2H3.46667C2.71993 2 2.34656 2 2.06135 2.14532C1.81047 2.27316 1.60649 2.47713 1.47866 2.72801C1.33334 3.01323 1.33334 3.3866 1.33334 4.13333V4.66667M1.33334 4.66667H11.4667C12.5868 4.66667 13.1468 4.66667 13.5746 4.88465C13.951 5.0764 14.2569 5.38236 14.4487 5.75869C14.6667 6.18651 14.6667 6.74656 14.6667 7.86667V10.8C14.6667 11.9201 14.6667 12.4802 14.4487 12.908C14.2569 13.2843 13.951 13.5903 13.5746 13.782C13.1468 14 12.5868 14 11.4667 14H4.53334C3.41323 14 2.85318 14 2.42535 13.782C2.04903 13.5903 1.74307 13.2843 1.55132 12.908C1.33334 12.4802 1.33334 11.9201 1.33334 10.8V4.66667Z" stroke="#63A1F7" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
                        </svg>
                        <span class="link-menu__text">
                        ${folder.name}
                        </span>
                    </button>
                </div>
            `;
        }

        const linkMenu = li.querySelector('.link-menu');

        linkMenu.querySelector('.link-menu__tree').addEventListener('click', (ev) => {
            ev.stopPropagation();

            if (folder.data.length > 0) {
                // Summary element disaptch click event
                linkMenu.parentElement.dispatchEvent(new Event('click'));
            }
        });

        // Set active state to folder
        linkMenu.dataset.path = folder.path;
        this._onFolderSelect(linkMenu, folder);

        return li;
    },

    _onFolderSelect(folder, data) {

        folder.addEventListener('click', (ev) => {
            this.curFilePath = '';
            this.curDirPath = data.path

            // if (updateFiles) {
            this._navigate(data.path);
            // }

            const details = folder.parentElement.parentElement;
            this._updateFileInfo();
            this.modalFiles.setPath(data.path);


            this.root.querySelectorAll('.js--fm-delete-folder').forEach(item => {
                item.style.display = 'flex';
            });

            this.tree.querySelectorAll('.link-menu').forEach(item => {
                item.classList.remove('link-menu_active');
            });

            folder.classList.add('link-menu_active');

            if (details) {
                if (details.hasAttribute('open')) {
                    details.setAttribute('open', '');
                    ev.stopPropagation();
                }
            }
        });
    },

    _onFolderDelete(pathForUpdate = '') {
        this._unlink(this.curDirPath);
        this._updateFiles(pathForUpdate);
        this.curDirPath = replaceLastPathElement(this.curDirPath, '');
        this._updateTree();
        this._updateBreadcrumbs(this.curDirPath.split("/").at(-2));


        this.notify.addNotification({
            title: 'Папка удалена',
        });

        // Hide delte control
        this.root.querySelectorAll('.js--fm-delete-folder').forEach(item => {
            item.style.display = 'none';
        });
    },

    _onFileDelete() {
        this._unlink(this.curFilePath);
        this._updateFiles(this.curDirPath);

        this.notify.addNotification({
            title: 'Файл удален',
        });

        // Hide delte control
        this.root.querySelectorAll('.js--fm-delete-file').forEach(item => {
            item.style.display = 'none';
        });
    },

    _onFileSelect(file, data) {
        this.currFileName = data.name;

        this.fileGrid.querySelectorAll('.f-card').forEach(item => {
            item.classList.remove('f-card_active');
        });

        // 
        this.root.querySelectorAll('.js--fm-delete-file').forEach(item => {
            item.style.display = 'flex';
        });

        this.curFilePath = data.path;

        file.classList.add('f-card_active');

        this._updateFileInfo({
            title: data.name,
            size: data.size,
            dimensions: data.dimensions,
            edited: data.edited,
            size_ext: data.size_ext,
        });
    },

    _onMobileFileSelect(file) {

    },

    _onMobileFolderSelect(folder) {

    },

    _createFileHTML(file) {
        const div = document.createElement('div');
        div.classList.add('f-card');
        div.setAttribute('path', file.path);
        div.setAttribute('data-name', file.name);
        const extension = file.name.split('.');
        const filename = file.name.replace(/\.[^/.]+$/, "");


        div.innerHTML = `
            <a href="${file.path}" class="f-card__link f-card__link_download" download></a>
            <div class="f-card__image-wrapper">
              <div class="f-card__size">${file.size} ${file.size_ext}</div>
              <img src="${file.is_pic ? this.rootDir + file.path : this.assetsDir + "/img/file-img-placeholder.jpg"}" alt="" class="f-card__img">
            </div>
            <span class="f-card__title">
              <span class="f-card__filename">${filename}${extension.length > 1 ? '.' : ''}</span>
              <span class="f-card__ext">${extension.length > 1 ? extension.pop() : ''}</span>
            </span>
        `;


        div.addEventListener('click', () => this._onFileSelect(div, file))

        const onClickOutside = (e) => {
            try {
                if (e.target && !e.target.className.includes('f-card')) {
                    div.classList.remove('f-card_active');
                    this._updateFileInfo();
                }
            } catch( err ) {
                window.removeEventListener("click", onClickOutside);
            }
        };

        window.addEventListener("click", onClickOutside);

        return div;
    },

    _createFolderMobileHTML(folder) {
        const div = document.createElement('div');
        div.classList.add('folder-card-mob');
        div.setAttribute('data-path', folder.path);

        div.innerHTML = `
            <i class="folder-card-mob__icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M13 7L11.8845 4.76892C11.5634 4.1268 11.4029 3.80573 11.1634 3.57116C10.9516 3.36373 10.6963 3.20597 10.4161 3.10931C10.0992 3 9.74021 3 9.02229 3H5.2C4.0799 3 3.51984 3 3.09202 3.21799C2.71569 3.40973 2.40973 3.71569 2.21799 4.09202C2 4.51984 2 5.0799 2 6.2V7M2 7H17.2C18.8802 7 19.7202 7 20.362 7.32698C20.9265 7.6146 21.3854 8.07354 21.673 8.63803C22 9.27976 22 10.1198 22 11.8V16.2C22 17.8802 22 18.7202 21.673 19.362C21.3854 19.9265 20.9265 20.3854 20.362 20.673C19.7202 21 18.8802 21 17.2 21H6.8C5.11984 21 4.27976 21 3.63803 20.673C3.07354 20.3854 2.6146 19.9265 2.32698 19.362C2 18.7202 2 17.8802 2 16.2V7Z" stroke="#63A1F7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
            </i>
            <div class="folder-card-mob__info">
              <span class="folder-card-mob__title">${folder.name}</span>
              <div class="folder-card-mob__params">
                ${folder.count ?
                `
                    <span class="folder-card-mob__params-item folder-card-mob__params-item_date">${folder.edited}</span>
                    <span class="folder-card-mob__params-item folder-card-mob__params-item_size"> ${formatEnding(folder.count, ['файл', 'файла', 'файлов'])}</span>
                    ` : ''
            }
              </div>
            </div>
        `;

        div.addEventListener('click', () => {
            this.curDirPath = folder.path;
            this.modalFiles.setPath(this.curDirPath);
            this._navigate(folder.path);
            this.curFilePath = '';
        });

        div.addEventListener('contextmenu', (ev) => {
            ev.preventDefault();

            this.filesMobile.querySelectorAll('.file-card-mob').forEach(item => {
                item.classList.remove('file-card-mob_active');
            });

            this.filesMobile.querySelectorAll('.folder-card-mob').forEach(item => {
                item.classList.remove('folder-card-mob_active');
            });

            this.curDirPath = folder.path;

            div.classList.add('folder-card-mob_active');
            this._activateMobileTapbar(this.toolbarFolder);



        });

        return div;
    },

    _createFileMobileHTML(file) {
        const div = document.createElement('div');
        div.classList.add('file-card-mob');
        div.setAttribute('data-path', file.path);
        const extension = file.name.split('.');

        div.innerHTML = `
            <img src="${file.is_pic ? this.rootDir + file.path : this.assetsDir + "/img/file-img-placeholder-mob.webp"}" alt="" class="file-card-mob__img">
            <div class="file-card-mob__info">
              <div class="file-card-mob__title">
                <span class="file-card-mob__title_text">${removeFileExtenstion(file.name)}${extension.length > 1 ? '.' : ''}</span>
                <span class="file-card-mob__title_ext">  ${extension.length > 1 ? extension.pop() : ''}</span>
              </div>
              <div class="file-card-mob__params">
                <span class="file-card-mob__params-item file-card-mob__params-item_date">${file.edited}</span>
                <span class="file-card-mob__params-item file-card-mob__params-item_size">${file.size} ${file.size_ext}</span>
              </div>
            </div>
        `;

        div.addEventListener('click', (ev) => {
            this.filesMobile.querySelectorAll('.folder-card-mob').forEach(item => {
                item.classList.remove('folder-card-mob_active');
            });

            this.filesMobile.querySelectorAll('.file-card-mob').forEach(item => {
                item.classList.remove('file-card-mob_active');
            });

            this.curFilePath = file.path;
            div.classList.add('file-card-mob_active');
        })


        div.addEventListener('contextmenu', (ev) => {
            ev.preventDefault();

            this.filesMobile.querySelectorAll('.folder-card-mob').forEach(item => {
                item.classList.remove('folder-card-mob_active');
            });

            this.filesMobile.querySelectorAll('.file-card-mob').forEach(item => {
                item.classList.remove('file-card-mob_active');
            });

            this.curFilePath = file.path;
            this._activateMobileTapbar(this.toolbarFile);
            div.classList.add('file-card-mob_active');
        });

        return div;
    },

    _createBreadcrumbHTML(breadcrumb, path, isLast) {
        const span = document.createElement('span');
        span.setAttribute('path', path);
        span.classList.add('link-nav');

        if (!isLast) {
            span.innerHTML = `
                ${breadcrumb}
                <i class="link-nav__icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path fill-rule="evenodd" clip-rule="evenodd" d="M6.86192 10.4714C6.60157 10.211 6.60157 9.78893 6.86192 9.52859L8.39051 7.99999L6.86192 6.47139C6.60157 6.21104 6.60157 5.78893 6.86192 5.52859C7.12227 5.26824 7.54438 5.26824 7.80473 5.52859L9.80473 7.52858C10.0651 7.78893 10.0651 8.21104 9.80473 8.47139L7.80473 10.4714C7.54438 10.7317 7.12227 10.7317 6.86192 10.4714Z" fill="#1461CC"></path>
                  </svg>
                </i>
            `;
        } else {
            span.textContent = breadcrumb;
        }

        if (!isLast) {
            span.addEventListener('click', () => {
                this.curDirPath = path;
                this._navigate(path)
            });
        }


        return span;
    },

    _activateMobileTapbar(tapbar) {
        this.toolbarDefault.close();
        this.toolbarFolder.close();
        this.toolbarFile.close();

        tapbar.open();
    },

    onSave() {
        this.callback(this.curFilePath);
        this.root.remove();
    },

    close() {
        this.root.remove();
    },
};

window.fileManager = FileManager;

const dropArea = (area, handleDrop) => {
    const dropArea = area.querySelector('.drop-area');
    // Prevent default drag behaviors

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false)
        document.body.addEventListener(eventName, preventDefaults, false)
    });

    // Highlight drop area when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, highlight, false)
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight, false)
    });

    // Handle dropped files
    dropArea.addEventListener('drop', handleDrop, false)

    function preventDefaults(e) {
        e.preventDefault()
        e.stopPropagation()
    }

    function highlight(e) {
        dropArea.classList.add('drop-area--highlight')
    }

    function unhighlight(e) {
        dropArea.classList.remove('drop-area--highlight')
    }
}

(function () {

    const uploaders = document.querySelectorAll('.file-uploader-block');

    function formatFileName(filename) {
        if (filename.length > 16) {
            const extension = filename.slice(((filename.lastIndexOf(".") - 1) >>> 0) + 2);
            const shortenedName = filename.slice(0, 9) + '...';
            return shortenedName + extension;
        } else {
            return filename;
        }
    }

    function formatFileSize(size) {
        const kb = 1024;
        const mb = kb * 1024;
        const gb = mb * 1024;

        if (size >= gb) {
            return (size / gb).toFixed(2) + ' гб';
        } else if (size >= mb) {
            return (size / mb).toFixed(2) + ' мб';
        } else if (size >= kb) {
            return (size / kb).toFixed(2) + ' кб';
        } else {
            return size + ' bytes';
        }
    }

    uploaders.forEach((uploader) => {
        const fileUploader = uploader.querySelector('.file-uploader');
        const fileInput = uploader.querySelector('.file-uploader__input');
        const fileList = uploader.querySelector('.file-uploader__files');
        const fileDropArea = uploader.querySelector('.drop-area');
        const fileProgressTotal = uploader.querySelector('.progressbar__progress');
        const btnCancelUploads = uploader.querySelector('.file-uploader__btn-cancel');
        const btnUpload = uploader.querySelector('.file-uploader__btn-upload');
        // const fileMessage = uploader.querySelector('.file-uploader__btn-text');
        // const pathToLoad = fileInput.dataset.path;
        let requests = [];
        let selectedFiles = [];

        const FILE_DEFAULT_MESSAGE = 'до 10 фотографий по 10 мб';
        const FILE_ERROR_MESSAGE = 'загружаемых фотографий больше 10';

        let totalProgress = 0;

        btnUpload.addEventListener('click', (ev) => {
            fileInput.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        })

        btnCancelUploads.addEventListener('click', (ev) => {
            ev.stopPropagation();
            cancelUploads();
        })

        fileInput.addEventListener('change', (event) => {
            const files = event.target.files;

            if (!files.length) return;

            if (selectedFiles.length + files.length <= 10) {
                uploader.classList.remove('file-uploader--error');
                // fileMessage.innerHTML = FILE_DEFAULT_MESSAGE;
                handleFiles(files);
            } else {
                uploader.classList.add('file-uploader--error');
                // fileMessage.innerHTML = FILE_ERROR_MESSAGE;
                fileInput.files = [];
            }

        });

        dropArea(fileUploader, (ev) => {
            const files = ev.dataTransfer.files;

            if (selectedFiles.length + files.length <= 10) {
                handleFiles(files);
            } else {
                fileInput.files = [];
            }
        });

        function cancelUploads() {
            selectedFiles = [];
            requests.forEach((xhr) => {
                xhr.abort(); // Отменяем все активные загрузки
            });
            requests = []; // Очищаем массив активных запросов
            fileUploader.classList.remove('file-uploader--loading');
            fileList.innerHTML = '';
            fileList.style.display = 'none';
        }

        function removeXHR(req) {
            const index = requests.indexOf(req);
            if (index !== -1) {
                requests.splice(index, 1);
            }
        }

        function handleFiles(files) {
            fileList.style.display = 'flex';
            fileUploader.classList.add('file-uploader--loading');
            fileProgressTotal.style.width = `0%`;
            totalProgress = 0;
            // fileList.innerHTML = ''; // Очищаем список файлов перед обновлением


            if (selectedFiles.length) {
                addFile(files);
            } else {
                // Перебираем выбранные файлы и отображаем их в списке
                for (const file of files) {
                    if (file.type.startsWith('image/')) {
                        selectedFiles.push(file);

                        fileProgressTotal.style.width = `${totalProgress}%`;
                    }
                }



                updateFileList();
            }
        }

        function addFile(files) {

            for (const file of files) {
                selectedFiles.push(file);
                fileList.appendChild(renderFile(file));
            }
        }

        function updateFileList() {
            fileList.innerHTML = '';

            for (let i = 0; i < selectedFiles.length; i++) {
                let file = selectedFiles[i];

                fileList.appendChild(renderFile(file));
            }
        }

        function updateOverallProgress() {
            const items = fileList.querySelectorAll('.file-uploader-file');
            let totalProgress = 0;

            items.forEach((item) => {
                totalProgress += parseFloat(item.dataset.progress);
            });

            fileProgressTotal.style.width = `${totalProgress / items.length}%`;
        }

        function deleteFile(fileName, path) {
            const listItem = fileList.querySelector(`.file-uploader__file[data-file="${fileName}"]`);

            fetch("http://fmtest.master.et9.ru:10580/bootstrap.php?method=delete&path=" + path);


            if (listItem) {
                fileList.removeChild(listItem);

                // Удаляем файл из инпута
                const updatedFiles = selectedFiles.filter(f => f.name !== fileName);
                const dataTransfer = new DataTransfer();

                updatedFiles.forEach(file => {
                    dataTransfer.items.add(file);
                });

                selectedFiles = updatedFiles;
                fileInput.files = dataTransfer.files;
            }

            fetch('')

            fileList.style.display = selectedFiles.length ? 'flex' : 'none';
        }

        function renderFile(file) {
            const { name, size } = file;

            const formData = new FormData();
            formData.append('file[]', file);


            const fileUploaderFile = document.createElement('div');
            fileUploaderFile.classList.add('file-uploader__file', 'file-uploader-file', 'file-uploader-file--loading');
            fileUploaderFile.setAttribute('data-file', name);

            const fileUploaderFileImg = document.createElement('div');
            fileUploaderFileImg.classList.add('file-uploader-file__img');
            const imgElement = document.createElement('img');
            imgElement.src = './file-img-uploader-placehlder.png';
            imgElement.alt = '';
            fileUploaderFileImg.appendChild(imgElement);

            const fileUploaderFileInfo = document.createElement('div');
            fileUploaderFileInfo.classList.add('file-uploader-file__info');

            const fileUploaderFileInfoTop = document.createElement('div');
            fileUploaderFileInfoTop.classList.add('file-uploader-file__info-top');

            const fileUploaderFileTitle = document.createElement('div');
            fileUploaderFileTitle.classList.add('file-uploader-file__title');
            fileUploaderFileTitle.textContent = formatFileName(name);

            const fileSizeSpan = document.createElement('span');
            fileSizeSpan.classList.add('file-uploader-file__size');
            fileSizeSpan.textContent = formatFileSize(size);

            const fileProgress = document.createElement('div');
            fileProgress.classList.add('file-uploader-file__progress');

            const progressBar = document.createElement('div');
            progressBar.classList.add('progressbar');

            const progressBarBg = document.createElement('div');
            progressBarBg.classList.add('progressbar__bg');

            const progressBarProgress = document.createElement('div');
            progressBarProgress.classList.add('progressbar__progress');

            progressBar.appendChild(progressBarBg);
            progressBar.appendChild(progressBarProgress);
            fileProgress.appendChild(progressBar);

            fileUploaderFileInfoTop.appendChild(fileUploaderFileTitle);
            fileUploaderFileInfoTop.appendChild(fileSizeSpan);
            fileUploaderFileInfoTop.appendChild(fileProgress);

            const fileUploaderFileInfoBtns = document.createElement('div');
            fileUploaderFileInfoBtns.classList.add('file-uploader-file__info-btns');

            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.classList.add('file-uploader-file__btn-delete', 'BtnIconLeft', 'BtnSecondarySm');
            // Create SVG element
            const deleteIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            deleteIcon.setAttribute("xmlns", "http://www.w3.org/2000/svg");
            deleteIcon.setAttribute("width", "24");
            deleteIcon.setAttribute("height", "24");
            deleteIcon.setAttribute("viewBox", "0 0 24 24");
            deleteIcon.setAttribute("fill", "none");

            // Create path element
            const pathElementDel = document.createElementNS("http://www.w3.org/2000/svg", "path");
            pathElementDel.setAttribute("fill-rule", "evenodd");
            pathElementDel.setAttribute("clip-rule", "evenodd");
            pathElementDel.setAttribute("d", "M5.29289 5.29289C5.68342 4.90237 6.31658 4.90237 6.70711 5.29289L12 10.5858L17.2929 5.29289C17.6834 4.90237 18.3166 4.90237 18.7071 5.29289C19.0976 5.68342 19.0976 6.31658 18.7071 6.70711L13.4142 12L18.7071 17.2929C19.0976 17.6834 19.0976 18.3166 18.7071 18.7071C18.3166 19.0976 17.6834 19.0976 17.2929 18.7071L12 13.4142L6.70711 18.7071C6.31658 19.0976 5.68342 19.0976 5.29289 18.7071C4.90237 18.3166 4.90237 17.6834 5.29289 17.2929L10.5858 12L5.29289 6.70711C4.90237 6.31658 4.90237 5.68342 5.29289 5.29289Z");
            pathElementDel.setAttribute("fill", "white");

            // Append path element to SVG element
            deleteIcon.appendChild(pathElementDel);


            deleteButton.appendChild(deleteIcon);
            deleteButton.appendChild(document.createTextNode('Удалить'));

            const cancelButton = document.createElement('button');
            cancelButton.type = 'button';
            cancelButton.classList.add('file-uploader-file__btn-cancel', 'BtnIconLeft', 'BtnSecondarySm');

            // Create SVG element
            const cancelIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            cancelIcon.setAttribute("xmlns", "http://www.w3.org/2000/svg");
            cancelIcon.setAttribute("width", "24");
            cancelIcon.setAttribute("height", "24");
            cancelIcon.setAttribute("viewBox", "0 0 24 24");
            cancelIcon.setAttribute("fill", "none");

            // Create path element
            const pathElement = document.createElementNS("http://www.w3.org/2000/svg", "path");
            pathElement.setAttribute("fill-rule", "evenodd");
            pathElement.setAttribute("clip-rule", "evenodd");
            pathElement.setAttribute("d", "M5.29289 5.29289C5.68342 4.90237 6.31658 4.90237 6.70711 5.29289L12 10.5858L17.2929 5.29289C17.6834 4.90237 18.3166 4.90237 18.7071 5.29289C19.0976 5.68342 19.0976 6.31658 18.7071 6.70711L13.4142 12L18.7071 17.2929C19.0976 17.6834 19.0976 18.3166 18.7071 18.7071C18.3166 19.0976 17.6834 19.0976 17.2929 18.7071L12 13.4142L6.70711 18.7071C6.31658 19.0976 5.68342 19.0976 5.29289 18.7071C4.90237 18.3166 4.90237 17.6834 5.29289 17.2929L10.5858 12L5.29289 6.70711C4.90237 6.31658 4.90237 5.68342 5.29289 5.29289Z");
            pathElement.setAttribute("fill", "white");

            // Append path element to SVG element
            cancelIcon.appendChild(pathElement);


            cancelButton.appendChild(cancelIcon);
            cancelButton.appendChild(document.createTextNode('Отмена'));
            cancelButton.addEventListener('click', () => deleteFile(name));

            fileUploaderFileInfoBtns.appendChild(deleteButton);
            fileUploaderFileInfoBtns.appendChild(cancelButton);

            fileUploaderFileInfo.appendChild(fileUploaderFileInfoTop);
            fileUploaderFileInfo.appendChild(fileUploaderFileInfoBtns);

            fileUploaderFile.appendChild(fileUploaderFileImg);
            fileUploaderFile.appendChild(fileUploaderFileInfo);


            const reader = new FileReader();

            reader.onload = function (ev) {
                imgElement.src = ev.target.result;
            }

            const req = new XMLHttpRequest();
            requests.push(req);

            req.upload.addEventListener('progress', function (ev) {
                if (ev.loaded <= size) {
                    const percentage = Math.round((ev.loaded / size) * 100);
                    progressBarProgress.style.width = `${percentage}%`;
                    fileUploaderFile.setAttribute('data-progress', percentage.toString());

                    totalProgress += percentage;
                    updateOverallProgress();
                }
                if (ev.loaded === ev.total) {
                    progressBarProgress.style.width = '100%';
                    totalProgress = 100;
                }
            });

            req.addEventListener('load', function (ev) {
                if (ev.target.status === 200) {
                    const { data } = JSON.parse(ev.target.response);

                    fileUploaderFile.classList.remove('file-uploader-file--loading');

                    fileUploaderFile.setAttribute('data-progress', '100');

                    reader.readAsDataURL(file);

                    updateOverallProgress();

                    // Проверить, все ли изображения загружены
                    if (fileList.querySelectorAll('.file-uploader-file--loading').length === 0) {
                        // Удалить класс "loading" с основного прогресса
                        fileUploader.classList.remove('file-uploader--loading');
                    }

                    // console.log(ev.target.response)

                    deleteButton.addEventListener('click', () => deleteFile(name, data[0]));

                    removeXHR(req);

                }
            });

            // req.

            req.open('POST', 'http://fmtest.master.et9.ru:10580/bootstrap.php?method=upload&path=' + fileInput.dataset.path);
            // formData.append('path', fileInput.dataset.path);
            // formData.append('method', 'upload');

            

            req.timeout = 45000;
            req.send(formData);

            return fileUploaderFile;
        }
    });
})();