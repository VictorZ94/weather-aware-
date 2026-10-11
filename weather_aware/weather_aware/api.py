from rest_framework.views import exception_handler as drf_exception_handler


def exception_handler(exc, context):
    """DRF's handler, plus `retryable` so the frontend knows whether to offer Retry."""
    response = drf_exception_handler(exc, context)
    retryable = getattr(exc, 'retryable', None)
    if response is not None and retryable is not None and isinstance(response.data, dict):
        response.data['retryable'] = retryable
    return response
