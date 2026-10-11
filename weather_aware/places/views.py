import hashlib

from django.conf import settings
from django.core.cache import cache
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from here.autosuggest import AutosuggestClient
from .serializers import PlaceSerializer, SuggestQuerySerializer

MIN_QUERY_LENGTH = 2
CACHE_SECONDS = 24 * 60 * 60


class SuggestPlacesView(APIView):
    """GET /api/places/suggest/?q=<text> -> {"suggestions": [...]}"""

    def get(self, request):
        query = SuggestQuerySerializer(data=request.query_params)
        if not query.is_valid():
            return Response({'detail': query.errors['q'][0]}, status=status.HTTP_400_BAD_REQUEST)

        text = query.validated_data['q']
        print(text)
        if len(text) < MIN_QUERY_LENGTH:
            return Response({'suggestions': []})

        # Hashed so any text is a valid cache key.
        cache_key = 'places:suggest:' + hashlib.sha256(text.lower().encode()).hexdigest()
        suggestions = cache.get(cache_key)
        if suggestions is None:
            suggestions = AutosuggestClient(settings.HERE_API_KEY).autosuggest(text)
            cache.set(cache_key, suggestions, CACHE_SECONDS)

        return Response({'suggestions': PlaceSerializer(suggestions, many=True).data})
