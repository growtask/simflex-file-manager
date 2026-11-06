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

    /**
     * Части имени, которые веб-сервер может принять за исполняемое расширение и в середине имени
     * (file.php.jpg при AddHandler)
     */
    protected const EXECUTABLE_NAME_PART = '/^(php\d*|pht|phtml|phar|phps|cgi|pl|py|asp|aspx|jsp|sh|shtml)$/i';

    /** Методы, доступные через параметр запроса method */
    protected const API_METHODS = ['getTree', 'getFileList', 'download', 'delete', 'createDir', 'rename', 'upload'];

    /** Методы API, которые меняют файлы */
    protected const MODIFYING_METHODS = ['delete', 'createDir', 'rename', 'upload'];

    /** @var callable */
    protected $testAuthFn;
    protected string $rootDir;

    public function __construct(string $root, $authFn)
    {
        $this->rootDir = $root;
        $this->testAuthFn = $authFn;
    }

    /**
     * Выполняет метод API и отправляет ответ: JSON-конверт (JsonEnvelopeResponse) или, для download, файл.
     * Ошибка - HTTP-статус 4xx/5xx и error.message
     */
    #[NoReturn]
    public function handleRequest(): void
    {
        $response = new JsonEnvelopeResponse();
        try {
            if (!$this->testAuth()) {
                throw ApiException::unauthorized('Нет доступа к файлам');
            }

            // вызываются только методы API, а не любые методы класса
            $method = (string)($_REQUEST['method'] ?? '');
            if (!in_array($method, self::API_METHODS, true)) {
                throw ApiException::notFound('Неизвестное действие');
            }

            // изменяющий запрос принимается только со страниц этого же сайта (защита от CSRF)
            if (in_array($method, self::MODIFYING_METHODS, true) && !$this->isSameOriginRequest()) {
                throw ApiException::forbidden('Действие запрещено');
            }

            $response->setData($this->{$method}());
        } catch (\Throwable $ex) {
            $response->setError($ex);
        }

        $response->send();
    }

    /**
     * Returns empty string if requested path tries to go up in tree
     * @return string
     */
    protected function getPathSafe(): string
    {
        $path = $this->rootDir . ($_REQUEST['path'] ?? '');
        return str_contains($path, '..') ? '' : $path;
    }

    /**
     * Returns a tree of directories by the path
     * @param string $parent Parent directory
     * @return array
     */
    protected function getTree(string $parent = ''): array
    {
        if (!($path = $parent ?: $this->getPathSafe())) {
            return [];
        }

        $out = [];
        foreach (new \DirectoryIterator($path) as $dir) {
            // скрытые (.git, .gitkeep) не показываются: менеджер не даёт создавать имена с точки
            if (!$dir->isDir() || str_starts_with($dir->getFilename(), '.')) {
                continue;
            }

            $dirPath = $dir->getPath() . '/' . $dir->getFilename();
            $out[] = [
                'name' => $dir->getFilename(),
                'path' => str_replace($this->rootDir, '', $dirPath),
                'data' => $this->getTree($dirPath)
            ];
        }

        return $out;
    }

    /**
     * Returns a file list within a directory
     * @return array
     */
    protected function getFileList(): array
    {
        if (!($path = $this->getPathSafe())) {
            return [];
        }

        if (!is_dir($path)) {
            throw ApiException::notFound('Файл или папка не найдены');
        }

        $includeDirs = $_REQUEST['include_dirs'] ?? 0;

        $out = [];
        foreach (new \DirectoryIterator($path) as $dir) {
            if (str_starts_with($dir->getFilename(), '.')) {
                continue;
            }
            $filePath = str_replace($this->rootDir, '', $dir->getPath() . '/' . $dir->getFilename());
            if ($dir->isDir()) {
                if (!$includeDirs) {
                    continue;
                }

                // loop through insides and find out element count and last change date
                $elCnt = 0;
                $lastDate = 0;
                foreach (new \DirectoryIterator($dir->getPath() . '/' . $dir->getFilename()) as $d2) {
                    if (in_array($d2->getFilename(), ['..', '.'])) {
                        continue;
                    }

                    ++$elCnt;
                    if (!$d2->isDir() && $lastDate < $d2->getMTime()) {
                        $lastDate = $d2->getMTime();
                    }
                }

                $out[] = [
                    'type' => 'dir',
                    'name' => $dir->getFilename(),
                    'path' => $filePath,
                    'count' => $elCnt,
                    'edited' => $lastDate ? date('d.m.Y H:i', $lastDate) : '',
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
        $ext = explode('.', $it->getFilename());
        if (count($ext) > 1) {
            $ext = $ext[count($ext) - 1];
        } else {
            $ext = $ext[0];
        }

        // test if this file is an image
        $isPic = false;
        switch (strtolower($ext)) {
            case 'jpg':
            case 'jpeg':
            case 'png':
            case 'gif':
            case 'webp':
            case 'avif':
            case 'svg':
                $isPic = true;
                break;
        }

        // fetch image dimensions
        $imgDimensions = '';
        if ($isPic && strtolower($ext) != 'svg') {
            $dimRaw = @getimagesize($it->getRealPath());
            $imgDimensions = $dimRaw ? $dimRaw[0] . 'x' . $dimRaw[1] . 'px' : '';
        }

        // fetch last edit date
        $changeDate = date('d.m.Y H:i', $it->getMTime());

        // fetch file size
        $size = filesize($it->getRealPath());
        // размер в байтах и время изменения — для сортировки
        $bytes = $size;
        $sizeExt = 'б';

        // convert to KiB
        if ($size > 1024) {
            $size /= 1024;
            $sizeExt = 'кб';
        }

        // convert to MiB
        if ($size > 1024) {
            $size /= 1024;
            $sizeExt = 'мб';
        }

        // convert to GiB
        if ($size > 1024) {
            $size /= 1024;
            $sizeExt = 'гб';
        }

        return [
            'is_pic' => $isPic,
            'size' => (int)$size,
            'size_ext' => $sizeExt,
            'dimensions' => $imgDimensions,
            'edited' => $changeDate,
            'bytes' => $bytes,
            'mtime' => $it->getMTime(),
        ];
    }

    protected function rm(string $path)
    {
        // Очищаем пути от лишних слэшей для точного сравнения
        $realPath = realpath($path);
        $realRoot = realpath($this->rootDir);

        // Защита: если путь не существует или он находится ВНЕ корневой папки
        if (!$realPath || !$realRoot || strpos($realPath, $realRoot) !== 0) {
            return false;
        }

        if ($realPath === $realRoot) {
            return false;
        }

        if (is_dir($path)) {
            foreach (scandir($path) as $f) {
                if ($f != '.' && $f != '..') {
                    if (!$this->rm($path . '/' . $f)) {
                        return false;
                    }
                }
            }

            return rmdir($path);
        }

        return unlink($path);
    }

    /**
     * Deletes the file by path
     * @return array{}
     */
    protected function delete(): array
    {
        if (!($path = $this->getPathSafe())) {
            throw ApiException::badRequest('Неверный путь');
        }

        if (!is_file($path) && !is_dir($path)) {
            throw ApiException::notFound('Файл или папка не найдены');
        }

        // корень каталога загрузок не удаляется
        if (rtrim($path, '/') === rtrim($this->rootDir, '/')) {
            throw ApiException::badRequest('Неверный путь');
        }

        if (!$this->rm($path)) {
            throw ApiException::forbidden('Нет прав на запись');
        }

        return [];
    }

    /**
     * Creates a directory in path
     * @return array{}
     */
    protected function createDir(): array
    {
        if (!($path = $this->getPathSafe())) {
            throw ApiException::badRequest('Неверный путь');
        }

        if (!is_file($path) && !is_dir($path)) {
            throw ApiException::notFound('Файл или папка не найдены');
        }

        $dirName = (string)($_REQUEST['name'] ?? '');
        if ($dirName === '' || str_starts_with($dirName, '.') || strpbrk($dirName, "/\\\0") !== false) {
            throw ApiException::unprocessable('Недопустимое имя');
        }

        if (!mkdir($path . '/' . $dirName)) {
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
        if (!($path = $this->getPathSafe())) {
            throw ApiException::badRequest('Неверный путь');
        }

        if (!is_file($path) && !is_dir($path)) {
            throw ApiException::notFound('Файл или папка не найдены');
        }

        $newName = (string)($_REQUEST['name'] ?? '');
        if ($newName === '' || str_contains($newName, '..') || strpbrk($newName, "/\\\0") !== false) {
            throw ApiException::unprocessable('Недопустимое имя');
        }
        // файлу - только безопасное расширение, папке - имя не с точки (.htaccess и т.п.); код ошибки - тот, что
        // фронтенд показывает как «Неверное имя»
        if (is_file($path) ? !static::isAllowedFileName($newName) : str_starts_with($newName, '.')) {
            throw ApiException::unprocessable('Недопустимое имя');
        }

        // extract the directory of the path
        $parentPath = dirname($path);
        if (is_file($parentPath . '/' . $newName) || is_dir($parentPath . '/' . $newName)) {
            throw new ApiException('Файл или папка с таким именем уже есть', 409);
        }

        if (!rename($path, $parentPath . '/' . $newName)) {
            throw ApiException::forbidden('Нет прав на запись');
        }

        return [];
    }

    /**
     * Nice up $_FILES array
     * @return array
     */
    protected function fixFilesArray(): array
    {
        $out = [];

        for ($i = 0; $i < count($_FILES['file']['name']); ++$i) {
            foreach (array_keys($_FILES['file']) as $k) {
                $out[$i][$k] = $_FILES['file'][$k][$i];
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

    #[NoReturn]
    protected function download()
    {
        if (!($path = $this->getPathSafe())) {
            throw ApiException::badRequest('Неверный путь');
        }

        if (!is_file($path) && !is_dir($path)) {
            throw ApiException::notFound('Файл или папка не найдены');
        }

        $name = explode('/', $path);
        $name = $name[count($name) - 1];

        $data = file_get_contents($path);
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename=' . $name);
        echo $data;
        exit;
    }

    /**
     * Handle uploaded files
     * @return array|string[]
     */
    protected function upload(): array
    {
        // test post size
        if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > $this->convertToBytes(ini_get('post_max_size'))) {
            throw new ApiException('Файл слишком большой', 413);
        }

        if (!($path = $this->getPathSafe())) {
            throw ApiException::badRequest('Неверный путь');
        }

        if (!isset($_FILES['file'])) {
            throw ApiException::badRequest('Файлы не выбраны');
        }

        $fileStatus = [];
        $files = $this->fixFilesArray();
        foreach ($files as $file) {
            // error failed
            if ($file['error']) {
                $fileStatus[] = 'error';
                continue;
            }

            // только безопасные типы файлов
            if (!static::isAllowedFileName((string)$file['name'])) {
                $fileStatus[] = 'forbidden';
                continue;
            }

            $fileStatus[] = move_uploaded_file($file['tmp_name'], $path . '/' . $file['name']) ? str_replace($this->rootDir, '', $path . '/' . $file['name']) : 'error_save';
        }

        return $fileStatus;
    }

    /**
     * Можно ли хранить файл с таким именем: расширение из ALLOWED_EXTENSIONS (без учёта регистра), имя не начинается
     * с точки и не содержит исполняемых частей (file.php.jpg)
     */
    public static function isAllowedFileName(string $name): bool
    {
        if ($name === '' || str_starts_with($name, '.')) {
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
