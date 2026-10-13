"""Shared plumbing for HERE APIs: HTTP, retries, error translation.

HERE takes the API key as a query parameter, so request URLs are never logged.
"""

import logging

import httpx
from rest_framework import status
from rest_framework.exceptions import APIException
from tenacity import Retrying, retry_if_exception_type, stop_after_attempt, wait_exponential

logger = logging.getLogger(__name__)


class HereError(APIException):
    """A failure talking to HERE. DRF renders these as {"detail": ...}.

    `retryable` tells the frontend whether trying again could help.
    """

    status_code = status.HTTP_502_BAD_GATEWAY
    message = '{service} is unavailable.'
    retryable = True

    def __init__(self, service):
        super().__init__(detail=self.message.format(service=service))


class HereRejected(HereError):
    """HERE refused the request (bad key or bad parameters): our problem, not transient."""

    retryable = False


class HereNotConfigured(HereError):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    message = '{service} is not configured.'
    retryable = False


class HereBusy(HereError):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    message = '{service} is busy. Try again shortly.'


class HereTimeout(HereError):
    status_code = status.HTTP_504_GATEWAY_TIMEOUT
    message = '{service} took too long.'


class _ServerError(Exception):
    """HERE answered 5xx. Worth another try."""


class HereClient:
    service = 'The mapping service'
    timeout = 5.0
    attempts = 3
    wait = wait_exponential(multiplier=0.2, max=1)
    transport = None

    def __init__(self, api_key):
        self.api_key = api_key

    def get(self, url, params):
        """GET a HERE endpoint and return its JSON, adding the API key."""
        if not self.api_key:
            raise HereNotConfigured(self.service)

        params = {**params, 'apiKey': self.api_key}
        retrying = Retrying(
            stop=stop_after_attempt(self.attempts),
            wait=self.wait,
            retry=retry_if_exception_type((httpx.TransportError, _ServerError)),
            reraise=True,
        )
        try:
            with httpx.Client(timeout=self.timeout, transport=self.transport) as client:
                return retrying(self._get_once, client, url, params)
        except httpx.TimeoutException:
            logger.warning('HERE timed out after %s attempts', self.attempts)
            raise HereTimeout(self.service)
        except (httpx.TransportError, _ServerError) as error:
            logger.warning('HERE unavailable after %s attempts: %s', self.attempts, type(error).__name__)
            raise HereError(self.service)

    def _get_once(self, client, url, params):
        response = client.get(url, params=params)
        if response.status_code >= 500:
            raise _ServerError()
        if response.status_code == 429:
            logger.warning('HERE rate limit reached')
            raise HereBusy(self.service)
        if response.status_code >= 400:
            logger.error(
                'HERE rejected the request with status %s: %s',
                response.status_code,
                _describe_rejection(response),
            )
            raise HereRejected(self.service)
        return response.json()


def _describe_rejection(response):
    """HERE's own explanation of a 4xx. These fields never contain the API key."""
    try:
        body = response.json()
    except ValueError:
        return 'no details'
    if not isinstance(body, dict):
        return 'no details'
    parts = [str(body[field]) for field in ('title', 'cause', 'action') if body.get(field)]
    return ' | '.join(parts) or 'no details'
