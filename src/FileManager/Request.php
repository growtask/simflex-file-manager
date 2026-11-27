<?php

namespace Simflex\FileManager;

/**
 * Запрос к API менеджера: параметры, файлы и данные сервера. Сайт без своего объекта запроса создаёт его
 * из суперглобальных массивов (fromGlobals()), CMS — из своего запроса (new Request($get, $post, $files, $server)),
 * тесты — из заданных массивов
 */
final class Request
{
    /**
     * @param array<string, mixed> $query Параметры строки запроса (GET)
     * @param array<string, mixed> $post Параметры тела запроса (POST)
     * @param array<string, mixed> $files Загруженные файлы в формате $_FILES
     * @param array<string, mixed> $server Данные сервера в формате $_SERVER: метод, заголовки HTTP_*
     */
    public function __construct(
        private readonly array $query = [],
        private readonly array $post = [],
        private readonly array $files = [],
        private readonly array $server = [],
    ) {
    }

    /** Текущий запрос PHP: $_GET, $_POST, $_FILES, $_SERVER */
    public static function fromGlobals(): self
    {
        return new self($_GET, $_POST, $_FILES, $_SERVER);
    }

    /** Параметр тела или строки запроса (тело важнее) */
    public function request(string $name, mixed $default = null): mixed
    {
        return $this->post[$name] ?? $this->query[$name] ?? $default;
    }

    /** Параметр тела запроса */
    public function post(string $name, mixed $default = null): mixed
    {
        return $this->post[$name] ?? $default;
    }

    /** Загруженный файл (поле file[] — массивы по ключам, как в $_FILES) */
    public function file(string $name): mixed
    {
        return $this->files[$name] ?? null;
    }

    /** Данные сервера: server('CONTENT_LENGTH') */
    public function server(string $name, mixed $default = null): mixed
    {
        return $this->server[$name] ?? $default;
    }

    /** Заголовок запроса без учёта регистра: header('Sec-Fetch-Site'); нет — null */
    public function header(string $name): ?string
    {
        $value = $this->server['HTTP_' . strtoupper(str_replace('-', '_', $name))] ?? null;

        return $value === null ? null : (string)$value;
    }

    /** Метод запроса: GET, POST */
    public function getRequestMethod(): string
    {
        return strtoupper((string)($this->server['REQUEST_METHOD'] ?? 'GET'));
    }

    /** Хост запроса с портом, если он не стандартный: example.com, localhost:8080 */
    public function getHost(): string
    {
        return (string)($this->server['HTTP_HOST'] ?? '');
    }
}
