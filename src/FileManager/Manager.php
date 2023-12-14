<?php
namespace Simflex\FileManager;

use JetBrains\PhpStorm\NoReturn;

class Manager
{
    public $testAuthFn;

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
        $method = $_REQUEST['method'];
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
        $path = $_SERVER['DOCUMENT_ROOT'] . $_REQUEST['path'];
        return str_contains($path, '..') ? '' : $path;
    }

    /**
     * Returns a tree of directories by the path
     * @param $parent Parent directory
     * @return array
     */
    protected function getTree($parent = ''): array
    {
        if (!($path = $parent ?: $this->getPathSafe())) {
            return [];
        }

        $out = [];
        foreach (new \DirectoryIterator($path) as $dir)
        {
            if (!$dir->isDir()) {
                continue;
            }

            $out[] = [
                'name' => $dir->getFilename(),
                'path' => $dir->getPath(),
                'data' => $this->getTree($dir->getPath())
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

        $includeDirs = $_REQUEST['include_dirs'];

        $out = [];
        foreach (new \DirectoryIterator($path) as $dir)
        {
            if ($dir->isDir()) {
                if (!$includeDirs) {
                    continue;
                }

                $out[] = [
                    'type' => 'dir',
                    'name' => $dir->getFilename(),
                    'path' => $dir->getPath()
                ];
            } else {
                $out[] = [
                    'type' => 'file',
                    'name' => $dir->getFilename(),
                    'path' => $dir->getPath(),
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
        }

        // test if this file is an image
        $isPic = false;
        switch (strtolower($ext))
        {
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
            'size' => $size,
            'size_ext' => $sizeExt,
            'dimensions' => $imgDimensions,
            'edited' => $changeDate
        ];
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

        unlink($path);
        return ['error' => ''];
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

        $dirName = $_REQUEST['name'];
        if (str_contains($dirName, '..')) {
            return ['error' => 'invalid_name'];
        }

        mkdir($path . '/' . $dirName);
        return ['error' => ''];
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

        $newName = $_REQUEST['name'];
        if (str_contains($newName, '..')) {
            return ['error' => 'invalid_name'];
        }

        // extract the directory of the path
        $parentPath = dirname($path);

        rename($path, $parentPath . '/' . $newName);
        return ['error' => ''];
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
     * Handle uploaded files
     * @return array|string[]
     */
    protected function upload(): array
    {
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

            move_uploaded_file($file['tmp_name'], $path . '/' . $file['name']);
            $fileStatus[] = 'ok';
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
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
        exit;
    }
}