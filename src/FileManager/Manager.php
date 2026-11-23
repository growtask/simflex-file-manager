<?php

namespace Simflex\FileManager;

use JetBrains\PhpStorm\NoReturn;
use Simflex\Core\Http\Api\ApiException;
use Simflex\Core\Http\Api\JsonEnvelopeResponse;

class Manager
{
    /**
     * Расширения файлов, которые можно загрузить и дать при переименовании (в нижнем регистре): изображения,
     * документы, архивы, аудио и видео, шрифты. Всё, что веб-сервер может выполнить или отдать как страницу
     * (php*, phtml, phar, html, htm, xhtml, shtml, svg, js, htaccess и т.п.), не допускается
     */
    public const ALLOWED_EXTENSIONS = [
        // изображения
        'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'ico', 'tif', 'tiff', 'heic',
        // документы
        'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'txt', 'csv',
        // архивы
        'zip', 'rar', '7z', 'gz', 'tgz', 'tar', 'bz2',
        // аудио и видео
        'mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'mp4', 'm4v', 'webm', 'ogv', 'mov', 'avi', 'mkv',
        // шрифты
        'woff', 'woff2', 'ttf', 'otf', 'eot',
    ];

    /** Картинки, которые при загрузке можно сжать в WebP (как в редакторе texted): JPEG, PNG, WebP */
    public const COMPRESSED_IMAGES = ['jpg', 'jpeg', 'png', 'webp'];

    /** Видео, которые при загрузке можно сжать в MP4 (H.264) через ffmpeg; аудио не сжимается */
    public const COMPRESSED_VIDEOS = ['mp4', 'm4v', 'mov', 'avi', 'mkv', 'webm', 'ogv'];

    /** Большая сторона видео после сжатия, px */
    public const VIDEO_MAX_SIDE = 1920;

    /** Качество видео: CRF x264 (меньше — лучше и тяжелее; 23 — по умолчанию ffmpeg) */
    public const VIDEO_CRF = 28;

    /** Картинки, которые сохраняются как есть: проверяются на посторонний код (файл — и картинка, и страница) */
    public const RAW_IMAGES = ['gif', 'avif', 'bmp', 'ico', 'tif', 'tiff', 'heic'];

    /** Большая сторона картинки после сжатия, px */
    public const IMAGE_MAX_SIDE = 2560;

    /** Качество WebP (0–100) */
    public const IMAGE_QUALITY = 82;

    /** Больше стольких пикселей картинка не открывается (защита памяти сервера) */
    public const IMAGE_MAX_PIXELS = 24_000_000;

    /**
     * Части имени, которые веб-сервер может принять за исполняемое расширение и в середине имени
     * (file.php.jpg при AddHandler)
     */
    protected const EXECUTABLE_NAME_PART = '/^(php\d*|pht|phtml|phar|phps|cgi|pl|py|asp|aspx|jsp|sh|shtml)$/i';

    /** Методы, доступные через параметр запроса method */
    protected const API_METHODS = ['getTree', 'getFileList', 'download', 'usage', 'compression', 'delete', 'createDir',
        'rename', 'move', 'upload'];

    /** Больше стольких элементов за один запрос move не перемещается */
    public const MOVE_MAX_ITEMS = 500;

    /** @var string|false|null Путь к ffmpeg: null — ещё не искали, false — нет */
    protected static string|false|null $ffmpeg = null;

    /** Методы API, которые меняют файлы */
    protected const MODIFYING_METHODS = ['delete', 'createDir', 'rename', 'move', 'upload'];

    /** Кириллица → латиница для имён загруженных файлов (как в редакторе texted) */
    protected const TRANSLIT = [
        'а' => 'a', 'б' => 'b', 'в' => 'v', 'г' => 'g', 'д' => 'd', 'е' => 'e', 'ё' => 'yo', 'ж' => 'zh', 'з' => 'z',
        'и' => 'i', 'й' => 'y', 'к' => 'k', 'л' => 'l', 'м' => 'm', 'н' => 'n', 'о' => 'o', 'п' => 'p', 'р' => 'r',
        'с' => 's', 'т' => 't', 'у' => 'u', 'ф' => 'f', 'х' => 'kh', 'ц' => 'ts', 'ч' => 'ch', 'ш' => 'sh',
        'щ' => 'shch', 'ъ' => '', 'ы' => 'y', 'ь' => '', 'э' => 'e', 'ю' => 'yu', 'я' => 'ya', 'і' => 'i', 'ї' => 'yi',
        'є' => 'ye', 'ґ' => 'g', 'ў' => 'u',
    ];

    /** @var callable|null */
    protected $testAuthFn;
    /** @var callable|null */
    protected $csrfFn;
    /** Корень файлов: путь как задан, без / в конце */
    protected string $rootDir;
    /** Корень файлов после realpath(); пусто — корня нет */
    protected string $realRoot;
    /** @var callable|null Где стоит ссылка на файл: fn(string $url): array<string, int> (таблица => записей) */
    protected $usageFn = null;
    /** Адрес корня файлов на сайте (для поиска ссылок): /uf */
    protected string $rootUrl = '/uf';

    /**
     * @param string $root Каталог файлов (public/uf)
     * @param callable|null $authFn Доступ к файлам: fn(): bool
     * @param callable|null $csrfFn Проверка CSRF-токена изменяющего запроса: fn(): bool (ядро - Csrf::isValid())
     */
    public function __construct(string $root, $authFn, $csrfFn = null)
    {
        $this->rootDir = rtrim($root, '/\\');
        $this->realRoot = (string)realpath($this->rootDir);
        $this->testAuthFn = $authFn;
        $this->csrfFn = $csrfFn;
    }

    /**
     * Поиск ссылок на файл для метода usage: окно предупреждает перед удалением и переименованием, что файл стоит
     * на страницах (ядро — System\FileUsage)
     * @param callable $fn fn(string $url): array<string, int> — таблица => сколько записей содержат адрес
     * @param string $rootUrl Адрес корня файлов на сайте
     */
    public function setUsageFinder(callable $fn, string $rootUrl = '/uf'): static
    {
        $this->usageFn = $fn;
        $this->rootUrl = rtrim($rootUrl, '/');
        return $this;
    }

    /**
     * Где на сайте стоит ссылка на файл или на что-то в папке: [{table, count}], пусто — нигде (или поиск не задан)
     * @return array<int, array{table: string, count: int}>
     */
    protected function usage(): array
    {
        $path = $this->resolvePath(allowRoot: false);
        if (!$this->usageFn) {
            return [];
        }
        $url = $this->rootUrl . $this->relative($path) . (is_dir($path) ? '/' : '');
        $out = [];
        foreach (($this->usageFn)($url) as $table => $count) {
            $out[] = ['table' => (string)$table, 'count' => (int)$count];
        }

        return $out;
    }

    /**
     * Выполняет метод API и отправляет ответ: JSON-конверт (JsonEnvelopeResponse) или, для download, файл.
     * Ошибка - HTTP-статус 4xx/5xx и error.message
     */
    #[NoReturn]
    public function handleRequest(): void
    {
        $response = new JsonEnvelopeResponse();
        header('Cache-Control: no-store');
        try {
            if (!$this->testAuth()) {
                throw ApiException::unauthorized('Нет доступа к файлам');
            }

            // вызываются только методы API, а не любые методы класса
            $method = (string)($_REQUEST['method'] ?? '');
            if (!in_array($method, self::API_METHODS, true)) {
                throw ApiException::notFound('Неизвестное действие');
            }

            if (in_array($method, self::MODIFYING_METHODS, true)) {
                $this->checkModifyingRequest();
            }

            $response->setData($this->{$method}());
        } catch (\Throwable $ex) {
            $response->setError($ex);
        }

        $response->send();
    }

    /**
     * Изменяющий запрос: только POST (картинка или ссылка на странице шлёт GET), со страницы этого же сайта
     * и с CSRF-токеном сессии (если задана проверка)
     *
     * @throws ApiException 405 - не POST, 403 - чужой сайт или нет токена
     */
    protected function checkModifyingRequest(): void
    {
        if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
            throw new ApiException('Действие выполняется только запросом POST', 405);
        }
        if (!$this->isSameOriginRequest()) {
            throw ApiException::forbidden('Действие запрещено');
        }
        $fn = $this->csrfFn;
        if ($fn && !$fn()) {
            throw ApiException::forbidden('Запрос отклонён: обновите страницу и повторите действие');
        }
    }

    /**
     * Путь на диске по параметру path (от корня файлов: '', '/', '/images/a.png'). Сегменты - без '.', '..',
     * обратной косой черты и нулевого байта; путь не проходит через символические ссылки и не выходит из корня
     *
     * @param bool $allowRoot Можно ли сам корень (удалить и переименовать корень нельзя)
     * @param bool $mustExist Путь должен существовать
     * @param string|null $relative Путь от корня; null - параметр запроса path
     * @throws ApiException 400 - неверный путь, 404 - не найден
     */
    protected function resolvePath(bool $allowRoot = true, bool $mustExist = true, ?string $relative = null): string
    {
        if ($this->realRoot === '' || !is_dir($this->realRoot)) {
            throw new ApiException('Каталог файлов не найден', 500);
        }

        $relative ??= (string)($_REQUEST['path'] ?? '');
        if ($relative !== '' && $relative[0] !== '/') {
            throw ApiException::badRequest('Неверный путь');
        }
        $segments = array_values(array_filter(explode('/', $relative), fn(string $part) => $part !== ''));
        foreach ($segments as $segment) {
            if ($segment === '.' || $segment === '..' || strpbrk($segment, "\\\0") !== false) {
                throw ApiException::badRequest('Неверный путь');
            }
        }
        if (!$segments && !$allowRoot) {
            throw ApiException::badRequest('Неверный путь');
        }

        $path = $this->realRoot;
        foreach ($segments as $segment) {
            $path .= '/' . $segment;
            if (is_link($path)) {
                throw ApiException::badRequest('Неверный путь');
            }
        }

        if (!file_exists($path)) {
            if ($mustExist) {
                throw ApiException::notFound('Файл или папка не найдены');
            }
            return $path;
        }

        // на случай подмены каталога между проверками: итог внутри корня
        $real = realpath($path);
        if ($real === false || ($real !== $this->realRoot && !str_starts_with($real, $this->realRoot . '/'))) {
            throw ApiException::badRequest('Неверный путь');
        }

        return $path;
    }

    /** Путь от корня файлов для ответа: /images/a.png */
    protected function relative(string $path): string
    {
        return substr($path, strlen($this->realRoot));
    }

    /**
     * Дерево папок от path. depth (параметр запроса) - сколько уровней вернуть: 1 - только вложенные папки
     * (окно подгружает дерево по уровням), 0 или нет - всё дерево. Узел: name, path, has_children, data
     * (вложенные узлы или null, если уровень не загружен)
     * @param string $parent Parent directory
     * @param int|null $depth Уровней ниже $parent; null - из запроса
     * @return array
     */
    protected function getTree(string $parent = '', ?int $depth = null): array
    {
        $path = $parent ?: $this->resolvePath();
        if (!is_dir($path)) {
            throw ApiException::notFound('Файл или папка не найдены');
        }
        $depth ??= max(0, (int)($_REQUEST['depth'] ?? 0));

        $out = [];
        foreach ($this->subdirectories($path) as $name) {
            $dirPath = $path . '/' . $name;
            $out[] = [
                'name' => $name,
                'path' => $this->relative($dirPath),
                'has_children' => (bool)$this->subdirectories($dirPath, 1),
                'data' => $depth === 1 ? null : $this->getTree($dirPath, $depth ? $depth - 1 : 0),
            ];
        }
        usort($out, fn(array $a, array $b) => strnatcasecmp($a['name'], $b['name']));

        return $out;
    }

    /**
     * Имена видимых вложенных папок: скрытые (.git, с точки — менеджер такие не создаёт) и ссылки не показываются
     * @param int $limit Сколько найти (0 - все): для has_children хватает одной
     * @return string[]
     */
    protected function subdirectories(string $path, int $limit = 0): array
    {
        $names = [];
        foreach (new \DirectoryIterator($path) as $dir) {
            if ($dir->isDot() || !$dir->isDir() || $dir->isLink() || str_starts_with($dir->getFilename(), '.')) {
                continue;
            }
            $names[] = $dir->getFilename();
            if ($limit && count($names) >= $limit) {
                break;
            }
        }

        return $names;
    }

    /**
     * Returns a file list within a directory
     * @return array
     */
    protected function getFileList(): array
    {
        $path = $this->resolvePath();
        if (!is_dir($path)) {
            throw ApiException::notFound('Файл или папка не найдены');
        }

        $includeDirs = $_REQUEST['include_dirs'] ?? 0;

        $out = [];
        foreach (new \DirectoryIterator($path) as $dir) {
            if (str_starts_with($dir->getFilename(), '.') || $dir->isLink()) {
                continue;
            }
            $itemPath = $path . '/' . $dir->getFilename();
            $filePath = $this->relative($itemPath);
            if ($dir->isDir()) {
                if (!$includeDirs) {
                    continue;
                }

                // loop through insides and find out element count and last change date
                $elCnt = 0;
                $lastDate = 0;
                foreach (new \DirectoryIterator($itemPath) as $d2) {
                    if ($d2->isDot() || str_starts_with($d2->getFilename(), '.')) {
                        continue;
                    }

                    ++$elCnt;
                    if (!$d2->isDir() && $lastDate < $d2->getMTime()) {
                        $lastDate = $d2->getMTime();
                    }
                }

                // пустая папка — дата самой папки
                $lastDate = $lastDate ?: $dir->getMTime();
                $out[] = [
                    'type' => 'dir',
                    'name' => $dir->getFilename(),
                    'path' => $filePath,
                    'count' => $elCnt,
                    'edited' => $lastDate ? date('d.m.y H:i', $lastDate) : '',
                    'mtime' => $lastDate,
                ];
            } else {
                $out[] = [
                        'type' => 'file',
                        'name' => $dir->getFilename(),
                        'path' => $filePath,
                    ] + $this->getFileInfo($dir);
            }
        }

        return $out;
    }

    /**
     * Returns file information
     * @param \DirectoryIterator $it
     * @return array
     */
    protected function getFileInfo(\DirectoryIterator $it): array
    {
        $ext = strtolower($it->getExtension());

        // test if this file is an image
        $isPic = in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg'], true);

        // fetch image dimensions
        $imgDimensions = '';
        if ($isPic && $ext !== 'svg') {
            $dimRaw = @getimagesize($it->getPathname());
            $imgDimensions = $dimRaw ? $dimRaw[0] . 'x' . $dimRaw[1] . 'px' : '';
        }

        $bytes = (int)$it->getSize();
        [$size, $sizeExt] = static::formatSize($bytes);

        return [
            'is_pic' => $isPic,
            'size' => $size,
            'size_ext' => $sizeExt,
            'dimensions' => $imgDimensions,
            'edited' => date('d.m.y H:i', $it->getMTime()),
            // размер в байтах и время изменения — для сортировки
            'bytes' => $bytes,
            'mtime' => $it->getMTime(),
        ];
    }

    /**
     * Размер для показа: [число, единица]; до 10 — с одним знаком после запятой (1.5 мб)
     * @return array{0: int|float, 1: string}
     */
    public static function formatSize(int $bytes): array
    {
        $units = ['б', 'кб', 'мб', 'гб'];
        $size = (float)$bytes;
        $unit = 0;
        while ($size >= 1024 && $unit < count($units) - 1) {
            $size /= 1024;
            ++$unit;
        }
        $size = $unit === 0 || $size >= 10 ? (int)round($size) : round($size, 1);
        return [$size, $units[$unit]];
    }

    /**
     * Удаляет файл или папку со всем содержимым. Символическая ссылка удаляется сама, без того, на что указывает
     */
    protected function rm(string $path): bool
    {
        if (is_link($path) || !is_dir($path)) {
            return unlink($path);
        }

        foreach (scandir($path) ?: [] as $f) {
            if ($f !== '.' && $f !== '..' && !$this->rm($path . '/' . $f)) {
                return false;
            }
        }

        return rmdir($path);
    }

    /**
     * Deletes the file by path
     * @return array{}
     */
    protected function delete(): array
    {
        // корень каталога загрузок не удаляется
        $path = $this->resolvePath(allowRoot: false);

        if (!$this->rm($path)) {
            throw ApiException::forbidden('Не удалось удалить: нет прав на запись');
        }

        return [];
    }

    /**
     * Creates a directory in path
     * @return array{}
     */
    protected function createDir(): array
    {
        $path = $this->resolvePath();
        if (!is_dir($path)) {
            throw ApiException::badRequest('Неверный путь');
        }

        $dirName = (string)($_REQUEST['name'] ?? '');
        if (!static::isAllowedDirName($dirName)) {
            throw ApiException::unprocessable('Недопустимое имя');
        }

        if (file_exists($path . '/' . $dirName)) {
            throw new ApiException('Файл или папка с таким именем уже есть', 409);
        }

        if (!@mkdir($path . '/' . $dirName)) {
            throw ApiException::forbidden('Нет прав на запись');
        }

        return [];
    }

    /**
     * Renames a directory or a file
     * @return array{}
     */
    protected function rename(): array
    {
        // корень каталога загрузок не переименовывается
        $path = $this->resolvePath(allowRoot: false);

        $newName = (string)($_REQUEST['name'] ?? '');
        // файлу - только безопасное расширение, папке - имя не с точки (.htaccess и т.п.)
        if (is_file($path) ? !static::isAllowedFileName($newName) : !static::isAllowedDirName($newName)) {
            throw ApiException::unprocessable('Недопустимое имя');
        }

        $target = dirname($path) . '/' . $newName;
        if (file_exists($target)) {
            throw new ApiException('Файл или папка с таким именем уже есть', 409);
        }

        if (!@rename($path, $target)) {
            throw ApiException::forbidden('Нет прав на запись');
        }

        return [];
    }

    /**
     * Перемещает файлы и папки items[] (пути от корня, из одной или разных папок) в папку path. Сначала
     * проверяется всё: корень не перемещается, папка - не в саму себя и не во вложенную, имя в папке назначения
     * свободно; потом элементы переносятся по одному
     *
     * @return string[] Новые пути перемещённых
     * @throws ApiException 400 - неверный путь, 409 - имя занято, 422 - нельзя переместить, 403 - нет прав
     */
    protected function move(): array
    {
        $target = $this->resolvePath();
        if (!is_dir($target)) {
            throw ApiException::badRequest('Переместить можно только в папку');
        }

        $items = $_POST['items'] ?? null;
        if (!is_array($items) || !$items || count($items) > self::MOVE_MAX_ITEMS) {
            throw ApiException::badRequest('Не выбрано, что перемещать');
        }

        /** @var array<string, string> $plan Новый путь => прежний */
        $plan = [];
        foreach ($items as $relative) {
            if (!is_string($relative)) {
                throw ApiException::badRequest('Неверный путь');
            }
            $path = $this->resolvePath(allowRoot: false, relative: $relative);
            $name = basename($path);
            if (dirname($path) === $target) {
                throw ApiException::unprocessable("«{$name}» уже в этой папке");
            }
            if (is_dir($path) && str_starts_with($target . '/', $path . '/')) {
                throw ApiException::unprocessable("Папку «{$name}» нельзя переместить в неё саму");
            }
            $destination = $target . '/' . $name;
            if (file_exists($destination) || isset($plan[$destination])) {
                throw new ApiException("В папке уже есть «{$name}»", 409);
            }
            $plan[$destination] = $path;
        }

        $moved = [];
        foreach ($plan as $destination => $path) {
            if (!@rename($path, $destination)) {
                $done = $moved ? sprintf('Перемещено %d из %d. ', count($moved), count($plan)) : '';
                throw ApiException::forbidden($done . '«' . basename($path) . '»: нет прав на запись');
            }
            $moved[] = $this->relative($destination);
        }

        return $moved;
    }

    /**
     * Nice up $_FILES array
     * @return array
     */
    protected function fixFilesArray(): array
    {
        $out = [];
        $names = (array)($_FILES['file']['name'] ?? []);

        for ($i = 0; $i < count($names); ++$i) {
            foreach (array_keys($_FILES['file']) as $k) {
                $out[$i][$k] = ((array)$_FILES['file'][$k])[$i] ?? null;
            }
        }

        return $out;
    }

    /**
     * Converts PHP ini byte parameter to int representation
     * @param string $ini
     * @return int
     */
    protected function convertToBytes(string $ini): int
    {
        // test if it doesn't end with anything
        if ((string)(int)$ini == $ini) {
            return (int)$ini;
        }

        $num = (int)substr($ini, 0, strlen($ini) - 1);
        $cnt = substr($ini, strlen($ini) - 1);

        // convert
        return match (strtoupper($cnt)) {
            'K' => $num * 1024,
            'M' => $num * 1024 * 1024,
            'G' => $num * 1024 * 1024 * 1024,
            default => $num,
        };
    }

    /**
     * Отдаёт файл на скачивание потоком (без чтения в память)
     */
    #[NoReturn]
    protected function download()
    {
        $path = $this->resolvePath(allowRoot: false);
        if (!is_file($path)) {
            throw ApiException::notFound('Файл не найден');
        }

        $name = basename($path);
        // имя по RFC 6266: латинский запасной вариант и UTF-8 (кириллица, пробелы)
        $fallback = preg_replace('/[^A-Za-z0-9._-]+/', '_', $name) ?: 'file';
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        header('Content-Type: application/octet-stream');
        header('Content-Length: ' . filesize($path));
        header('Content-Disposition: attachment; filename="' . $fallback . '"; filename*=UTF-8\'\'' . rawurlencode($name));
        header('X-Content-Type-Options: nosniff');
        readfile($path);
        exit;
    }

    /**
     * Handle uploaded files: имя - латиницей (как в редакторе texted), занятое не перезаписывается (photo-2.webp).
     * Сжатие — только если пользователь согласился (compress=1): JPEG, PNG и WebP — в WebP до IMAGE_MAX_SIDE,
     * видео — в MP4 до VIDEO_MAX_SIDE (нужен ffmpeg); сжатый файл остаётся, только если он легче или уменьшен.
     * Статус каждого файла - путь сохранённого файла от корня или код ошибки: error, forbidden, error_save,
     * too_large, bad_image
     * @return array|string[]
     */
    protected function upload(): array
    {
        // test post size
        if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > $this->convertToBytes((string)ini_get('post_max_size'))) {
            throw new ApiException('Файл слишком большой', 413);
        }

        $path = $this->resolvePath();
        if (!is_dir($path)) {
            throw ApiException::badRequest('Неверный путь');
        }

        if (!isset($_FILES['file'])) {
            throw ApiException::badRequest('Файлы не выбраны');
        }

        $compress = (string)($_REQUEST['compress'] ?? '0') === '1';
        $fileStatus = [];
        foreach ($this->fixFilesArray() as $file) {
            $fileStatus[] = $this->storeUploaded($file, $path, $compress);
        }

        return $fileStatus;
    }

    /**
     * Сохраняет один загруженный файл в каталог $dir
     * @param array{name?: string, tmp_name?: string, error?: int} $file
     * @return string Путь от корня или код ошибки
     */
    protected function storeUploaded(array $file, string $dir, bool $compress = false): string
    {
        $error = (int)($file['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($error === UPLOAD_ERR_INI_SIZE || $error === UPLOAD_ERR_FORM_SIZE) {
            return 'too_large';
        }
        $tmp = (string)($file['tmp_name'] ?? '');
        if ($error !== UPLOAD_ERR_OK || $tmp === '' || !is_uploaded_file($tmp)) {
            return 'error';
        }

        // только безопасные типы файлов
        $name = basename(str_replace('\\', '/', (string)($file['name'] ?? '')));
        if (!static::isAllowedFileName($name)) {
            return 'forbidden';
        }

        $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        if (in_array($extension, static::RAW_IMAGES, true) && static::hasCode($tmp)) {
            return 'bad_image';
        }

        $target = null;
        $staged = @tempnam($dir, '.fm-');
        try {
            if ($staged === false || !move_uploaded_file($tmp, $staged)) {
                return 'error_save';
            }
            // сжатие — только с согласия пользователя (окно спрашивает перед загрузкой)
            if ($compress) {
                $compressed = $this->compress($staged, $extension, $dir);
                if ($compressed !== false) {
                    [$compressedFile, $extension] = $compressed;
                    rename($compressedFile, $staged);
                }
            }
            @chmod($staged, 0644);

            $target = static::reserve($dir, static::slugify($name), $extension);
            if (DIRECTORY_SEPARATOR === '\\') {
                @unlink($target);
            }
            if (!rename($staged, $target)) {
                return 'error_save';
            }
            $saved = $target;
            $target = null;
            return $this->relative($saved);
        } catch (\InvalidArgumentException) {
            return 'bad_image';
        } catch (\Throwable) {
            return 'error_save';
        } finally {
            if ($staged !== false && is_file($staged)) {
                @unlink($staged);
            }
            // занятое под имя, но не сохранённое
            if ($target !== null && is_file($target) && filesize($target) === 0) {
                @unlink($target);
            }
        }
    }

    /**
     * Какое сжатие доступно на сервере: 'image' (GD с WebP), 'video' (есть ffmpeg). Окно спрашивает о сжатии только
     * того, что можно сжать
     * @return string[]
     */
    protected function compression(): array
    {
        return array_values(array_filter([
            static::canWriteWebp() ? 'image' : null,
            static::findFfmpeg() ? 'video' : null,
        ]));
    }

    /**
     * Сжатая копия файла рядом с ним: [путь, расширение] — только если она легче исходного или картинка уменьшена;
     * false — сжимать нечего, нельзя или не стоит (остаётся исходный)
     * @return array{0: string, 1: string}|false
     * @throws \InvalidArgumentException картинка повреждена или слишком большая
     */
    protected function compress(string $source, string $extension, string $dir): array|false
    {
        $isImage = in_array($extension, static::COMPRESSED_IMAGES, true) && static::canWriteWebp();
        $isVideo = in_array($extension, static::COMPRESSED_VIDEOS, true) && static::findFfmpeg();
        if (!$isImage && !$isVideo) {
            return false;
        }

        $out = @tempnam($dir, '.fm-');
        if ($out === false) {
            return false;
        }
        try {
            $isResized = false;
            if ($isImage) {
                $before = @getimagesize($source);
                $size = static::writeWebp($source, $out);
                $isResized = $before && max($size['width'], $size['height']) < max($before[0], $before[1]);
                $result = [$out, 'webp'];
            } elseif (static::writeMp4($source, $out)) {
                $result = [$out, 'mp4'];
            } else {
                @unlink($out);
                return false;
            }
            // сжатый не легче исходного (файл уже был сжат) — остаётся исходный
            if (!$isResized && filesize($out) >= filesize($source)) {
                @unlink($out);
                return false;
            }

            return $result;
        } catch (\Throwable $e) {
            @unlink($out);
            throw $e;
        }
    }

    /** ffmpeg на сервере: FM_FFMPEG или ffmpeg в PATH; false — нет */
    public static function findFfmpeg(): string|false
    {
        if (static::$ffmpeg !== null) {
            return static::$ffmpeg;
        }
        static::$ffmpeg = false;
        if (!function_exists('exec')) {
            return false;
        }
        foreach (array_filter([getenv('FM_FFMPEG') ?: null, 'ffmpeg']) as $bin) {
            $output = [];
            $code = 1;
            @exec(escapeshellarg($bin) . ' -version 2>&1', $output, $code);
            if ($code === 0) {
                return static::$ffmpeg = $bin;
            }
        }

        return false;
    }

    /**
     * Сжимает видео в MP4: H.264 (CRF VIDEO_CRF), звук AAC 128 кбит/с, большая сторона — не больше VIDEO_MAX_SIDE,
     * быстрый старт в браузере (faststart). Логика — как конвертация видео в редакторе texted (ffmpeg)
     */
    public static function writeMp4(string $source, string $destination): bool
    {
        $ffmpeg = static::findFfmpeg();
        if (!$ffmpeg) {
            return false;
        }
        $side = (int)static::VIDEO_MAX_SIDE;
        $scale = "scale='if(gt(iw,ih),min($side,iw),-2)':'if(gt(iw,ih),-2,min($side,ih))'";
        $command = escapeshellarg($ffmpeg) . ' -y -v error -i ' . escapeshellarg($source)
            . ' -vf ' . escapeshellarg($scale)
            . ' -c:v libx264 -preset veryfast -crf ' . (int)static::VIDEO_CRF . ' -pix_fmt yuv420p'
            . ' -c:a aac -b:a 128k -movflags +faststart -f mp4 ' . escapeshellarg($destination) . ' 2>&1';
        @set_time_limit(0);
        $output = [];
        $code = 1;
        exec($command, $output, $code);

        return $code === 0 && is_file($destination) && filesize($destination) > 0;
    }

    /** GD умеет писать WebP: иначе картинки сохраняются как есть */
    public static function canWriteWebp(): bool
    {
        return function_exists('imagewebp') && (imagetypes() & IMG_WEBP);
    }

    /**
     * Сжимает JPEG, PNG или WebP в WebP (качество IMAGE_QUALITY), большая сторона - не больше IMAGE_MAX_SIDE;
     * прозрачность сохраняется. Логика - как в редакторе texted (TedMediaStorage::writeWebp)
     *
     * @return array{width: int, height: int}
     * @throws \InvalidArgumentException не картинка, повреждена или слишком большая
     * @throws \RuntimeException не удалось записать
     */
    public static function writeWebp(string $source, string $destination): array
    {
        $size = @getimagesize($source);
        if (!$size || $size[0] < 1 || $size[1] < 1 || $size[0] * $size[1] > static::IMAGE_MAX_PIXELS) {
            throw new \InvalidArgumentException('Недопустимые размеры изображения');
        }
        // GD держит в памяти исходник и уменьшенную копию (4 байта на пиксель и запас)
        $k = min(1, static::IMAGE_MAX_SIDE / max($size[0], $size[1]));
        static::ensureMemory((int)(($size[0] * $size[1] + $size[0] * $size[1] * $k * $k) * 5) + 32 * 1048576);
        $image = match ($size[2]) {
            IMAGETYPE_JPEG => @imagecreatefromjpeg($source),
            IMAGETYPE_PNG => @imagecreatefrompng($source),
            IMAGETYPE_WEBP => @imagecreatefromwebp($source),
            default => false,
        };
        if (!$image) {
            throw new \InvalidArgumentException('Изображение повреждено');
        }
        if (!imageistruecolor($image)) {
            imagepalettetotruecolor($image);
        }
        imagealphablending($image, false);
        imagesavealpha($image, true);
        $width = imagesx($image);
        $height = imagesy($image);
        if (max($width, $height) > static::IMAGE_MAX_SIDE) {
            $k = static::IMAGE_MAX_SIDE / max($width, $height);
            $scaled = imagescale($image, max(1, (int)round($width * $k)), max(1, (int)round($height * $k)));
            if ($scaled) {
                // исходник освобождается присваиванием (imagedestroy() с PHP 8 ничего не делает)
                $image = $scaled;
                imagealphablending($image, false);
                imagesavealpha($image, true);
                $width = imagesx($image);
                $height = imagesy($image);
            }
        }
        if (!@imagewebp($image, $destination, static::IMAGE_QUALITY) || !filesize($destination)) {
            throw new \RuntimeException('Не удалось преобразовать изображение в WebP');
        }

        return ['width' => $width, 'height' => $height];
    }

    /**
     * Поднимает memory_limit до $bytes сверх уже занятого, если он меньше (только поднимает; -1 - без ограничения)
     */
    protected static function ensureMemory(int $bytes): void
    {
        $limit = (string)ini_get('memory_limit');
        if ($limit === '-1') {
            return;
        }
        $need = memory_get_usage() + $bytes;
        $current = (int)$limit * match (strtoupper(substr($limit, -1))) {
            'G' => 1073741824,
            'M' => 1048576,
            'K' => 1024,
            default => 1,
        };
        if ($current < $need) {
            @ini_set('memory_limit', (string)$need);
        }
    }

    /**
     * Есть ли в файле HTML, скрипт или PHP (файл одновременно картинка и страница). Как в редакторе texted
     */
    public static function hasCode(string $path): bool
    {
        $fh = @fopen($path, 'rb');
        if (!$fh) {
            return true;
        }
        $tail = '';
        try {
            while (!feof($fh)) {
                $chunk = $tail . (string)fread($fh, 1 << 20);
                // только длинные признаки: короткие случайно встречаются в сжатых данных большой картинки
                if (preg_match('~<(?:script|html|body|iframe|frame|frameset|svg|math|object|embed|applet|meta|link|base|style|img|details|form|input|button|select|textarea|template|video|audio|marquee)[\s/>]|[\s/"\']on[a-z]{4,}\s*=|<\?php|<!doctype|javascript:~i', $chunk) === 1) {
                    return true;
                }
                $tail = substr($chunk, -64);
            }
        } finally {
            fclose($fh);
        }

        return false;
    }

    /**
     * Имя файла латиницей: «Фото отпуска 1.JPG» → foto-otpuska-1 (без расширения). Как в редакторе texted
     */
    public static function slugify(string $original): string
    {
        $base = pathinfo(str_replace('\\', '/', $original), PATHINFO_FILENAME);
        if (class_exists('Normalizer')) {
            $base = (string)(\Normalizer::normalize($base) ?: $base);
        }
        $base = function_exists('mb_strtolower') ? mb_strtolower($base, 'UTF-8') : strtolower($base);
        $base = strtr($base, static::TRANSLIT);
        if (function_exists('transliterator_transliterate')) {
            $base = (string)transliterator_transliterate('Any-Latin; Latin-ASCII; Lower()', $base);
        }
        $slug = trim((string)preg_replace('/[^a-z0-9]+/', '-', $base), '-');
        $slug = rtrim(substr($slug, 0, 60), '-');
        if ($slug === '') {
            $slug = 'file';
        }
        if (preg_match('/\A(?:con|prn|aux|nul|com[1-9]|lpt[1-9])\z/', $slug)) {
            $slug = 'file-' . $slug;
        }

        return $slug;
    }

    /**
     * Занимает свободное имя в каталоге: slug.ext, при совпадении slug-2.ext, slug-3.ext… Атомарно (fopen 'x'):
     * два одновременных файла не получат одно имя, существующий файл не перезаписывается
     */
    protected static function reserve(string $dir, string $slug, string $extension): string
    {
        for ($n = 1; $n < 10000; $n++) {
            $path = $dir . '/' . ($n === 1 ? $slug : $slug . '-' . $n) . '.' . $extension;
            $handle = @fopen($path, 'xb');
            if ($handle !== false) {
                fclose($handle);
                return $path;
            }
        }

        throw new \RuntimeException('Не удалось подобрать имя файла');
    }

    /**
     * Можно ли хранить файл с таким именем: расширение из ALLOWED_EXTENSIONS (без учёта регистра), имя не начинается
     * с точки и не содержит исполняемых частей (file.php.jpg), разделителей пути и управляющих символов
     */
    public static function isAllowedFileName(string $name): bool
    {
        if (!static::isAllowedDirName($name)) {
            return false;
        }

        $parts = explode('.', $name);
        if (count($parts) < 2) {
            return false;
        }

        $extension = strtolower(array_pop($parts));
        if (!in_array($extension, static::ALLOWED_EXTENSIONS, true)) {
            return false;
        }

        // первая часть - само имя, остальные - возможные расширения
        foreach (array_slice($parts, 1) as $part) {
            if (preg_match(static::EXECUTABLE_NAME_PART, trim($part))) {
                return false;
            }
        }

        return true;
    }

    /**
     * Имя папки (и основа имени файла): не пустое, не с точки, без / \ и управляющих символов, до 255 байт
     */
    public static function isAllowedDirName(string $name): bool
    {
        return $name !== '' && strlen($name) <= 255 && !str_starts_with($name, '.')
            && trim($name) === $name && preg_match('/[\/\\\\\x00-\x1F\x7F]/', $name) !== 1;
    }

    /**
     * Tests whether the user is authenticated
     * @return bool
     */
    protected function testAuth(): bool
    {
        $fn = $this->testAuthFn;
        return !$fn || $fn();
    }

    /**
     * Запрос отправлен страницей этого же сайта: по Sec-Fetch-Site, иначе по хосту Origin или Referer.
     * Запрос без этих заголовков (не из браузера) не принимается
     */
    protected function isSameOriginRequest(): bool
    {
        $fetchSite = $_SERVER['HTTP_SEC_FETCH_SITE'] ?? '';
        if ($fetchSite !== '') {
            return $fetchSite === 'same-origin';
        }

        $source = $_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? '');
        $sourceHost = (string)parse_url($source, PHP_URL_HOST);
        $sourcePort = parse_url($source, PHP_URL_PORT);
        $host = (string)($_SERVER['HTTP_HOST'] ?? '');
        if ($sourceHost === '' || $host === '') {
            return false;
        }

        return strcasecmp($sourceHost . ($sourcePort ? ':' . $sourcePort : ''), $host) === 0;
    }
}
