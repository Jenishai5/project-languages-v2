class AppError(Exception):
    status_code = 400


class InvalidRequest(AppError):
    status_code = 400


class NotFound(AppError):
    status_code = 404


class ServiceUnavailable(AppError):
    status_code = 503


class ExternalSourceError(AppError):
    status_code = 502


class Conflict(AppError):
    status_code = 409


class RateLimited(AppError):
    status_code = 429


class UpstreamRateLimited(ExternalSourceError):
    status_code = 429
