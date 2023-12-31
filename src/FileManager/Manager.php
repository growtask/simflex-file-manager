<?php

namespace Simflex\FileManager;

use JetBrains\PhpStorm\NoReturn;

class Manager
{
    /** @var callable */
    protected $testAuthFn;
    protected string $rootDir;

    public function __construct(string $root, $authFn)
    {
        error_reporting(0);
        $this->rootDir = $root;
        $this->testAuthFn = $authFn;
    }

    #[NoReturn]
    public function handleRequest(): void
    {
        // make sure user is authenticated
        if (!$this->testAuth()) {
            $this->sendResponseAndQuit([
                'success' => false,
                'error' => 'not_authenticated'
            ]);
        }

        // check that the method exists
        $method = $_REQUEST['method'] ?? '';
        if (!method_exists($this, $method)) {
            $this->sendResponseAndQuit([
                'success' => false,
                'error' => 'method_not_found'
            ]);
        }

        // execute and send output
        $this->sendResponseAndQuit([
            'success' => true,
            'data' => $this->{$method}(),
        ]);
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
            if (!$dir->isDir() || in_array($dir->getFilename(), ['..', '.'])) {
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

        $includeDirs = $_REQUEST['include_dirs'] ?? 0;

        $out = [];
        foreach (new \DirectoryIterator($path) as $dir) {
            $filePath = str_replace($this->rootDir, '', $dir->getPath() . '/' . $dir->getFilename());
            if ($dir->isDir()) {
                if (!$includeDirs || in_array($dir->getFilename(), ['..', '.'])) {
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
                    'edited' => $lastDate ? date('d.m.Y H:i', $lastDate) : ''
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
            case 'png':
            case 'webp':
            case 'svg':
                $isPic = true;
                break;
        }

        // fetch image dimensions
        $imgDimensions = '';
        if ($isPic && strtolower($ext) != 'svg') {
            $dimRaw = getimagesize($it->getRealPath());
            $imgDimensions = $dimRaw[0] . 'x' . $dimRaw[1] . 'px';
        }

        // fetch last edit date
        $changeDate = date('d.m.Y H:i', $it->getMTime());

        // fetch file size
        $size = filesize($it->getRealPath());
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
            'edited' => $changeDate
        ];
    }

    protected function rm(string $path)
    {
        if (is_dir($path)) {
            foreach (scandir($path) as $f) {
                if ($f != '.' && $f != '..') {
                    if (!$this->rm($path . '/' . $f)) {
                        return false;
                    }
                }
            }

            return rmdir($path);
        } else {
            return unlink($path);
        }
    }

    /**
     * Deletes the file by path
     * @return string[]
     */
    protected function delete(): array
    {
        if (!($path = $this->getPathSafe())) {
            return ['error' => 'invalid_path'];
        }

        if (!is_file($path) && !is_dir($path)) {
            return ['error' => 'does_not_exist'];
        }

        return ['error' => $this->rm($path) ? '' : 'no_permissions'];
    }

    /**
     * Creates a directory in path
     * @return string[]
     */
    protected function createDir(): array
    {
        if (!($path = $this->getPathSafe())) {
            return ['error' => 'invalid_path'];
        }

        if (!is_file($path) && !is_dir($path)) {
            return ['error' => 'does_not_exist'];
        }

        $dirName = $_REQUEST['name'];
        if (str_contains($dirName, '..')) {
            return ['error' => 'invalid_name'];
        }

        return ['error' => mkdir($path . '/' . $dirName) ? '' : 'no_permissions'];
    }

    /**
     * Renames a directory or a file
     * @return string[]
     */
    protected function rename(): array
    {
        if (!($path = $this->getPathSafe())) {
            return ['error' => 'invalid_path'];
        }

        if (!is_file($path) && !is_dir($path)) {
            return ['error' => 'does_not_exist'];
        }

        $newName = $_REQUEST['name'];
        if (str_contains($newName, '..')) {
            return ['error' => 'invalid_name'];
        }

        // extract the directory of the path
        $parentPath = dirname($path);
        if (is_file($parentPath . '/' . $newName) || is_dir($parentPath . '/' . $newName)) {
            return ['error' => 'already_exists'];
        }

        return ['error' => rename($path, $parentPath . '/' . $newName) ? '' : 'no_permissions'];
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
            return ['error' => 'invalid_path'];
        }

        if (!is_file($path) && !is_dir($path)) {
            return ['error' => 'does_not_exist'];
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
            return ['error' => 'file_too_large'];
        }

        if (!($path = $this->getPathSafe())) {
            return ['error' => 'invalid_path'];
        }

        if (!isset($_FILES['file'])) {
            return ['error' => 'nothing_uploaded'];
        }

        $fileStatus = [];
        $files = $this->fixFilesArray();
        foreach ($files as $file) {
            // error failed
            if ($file['error']) {
                $fileStatus[] = 'error';
                continue;
            }

            // don't upload possibly malicious files
            $ext = explode('.', $file['name']);
            $ext = $ext[count($ext) - 1];
            switch ($ext) {
                case 'php':
                case 'exe':
                case 'sh':
                    $fileStatus[] = 'forbidden';
                    continue 2;
            }

            $fileStatus[] = move_uploaded_file($file['tmp_name'], $path . '/' . $file['name']) ? str_replace($this->rootDir, '', $path . '/' . $file['name']) : 'error_save';
        }

        return $fileStatus;
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
     * Sends response back and stops execution
     * @param array $data
     * @return void
     */
    #[NoReturn]
    protected function sendResponseAndQuit(array $data): void
    {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
        exit;
    }
}