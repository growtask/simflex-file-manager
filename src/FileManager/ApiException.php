<?php

namespace Simflex\FileManager;

/**
 * Ошибка API, текст которой показывается в окне менеджера: HTTP-статус и сообщение попадают в ответ
 * {"error": {"code": статус, "message": текст}}. Прочие исключения клиенту не показываются: ответ 500 с общим текстом
 */
class ApiException extends \RuntimeException
{
    /**
     * @param string $message Текст для пользователя
     * @param int $httpStatus HTTP-статус ответа (он же код ошибки в ответе)
     */
    public function __construct(string $message, protected int $httpStatus = 400, ?\Throwable $previous = null)
    {
        parent::__construct($message, $httpStatus, $previous);
    }

    public function getHttpStatus(): int
    {
        return $this->httpStatus;
    }

    public static function badRequest(string $message = 'Неверный запрос'): self
    {
        return new self($message, 400);
    }

    public static function unauthorized(string $message = 'Требуется авторизация'): self
    {
        return new self($message, 401);
    }

    public static function forbidden(string $message = 'Доступ запрещён'): self
    {
        return new self($message, 403);
    }

    public static function notFound(string $message = 'Не найдено'): self
    {
        return new self($message, 404);
    }

    public static function unprocessable(string $message): self
    {
        return new self($message, 422);
    }
}
