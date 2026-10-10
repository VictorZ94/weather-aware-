from rest_framework import serializers


class SuggestQuerySerializer(serializers.Serializer):
    q = serializers.CharField(
        required=False,
        allow_blank=True,
        default='',
        max_length=100,
        error_messages={'max_length': 'Search text is too long.'},
    )


class PlaceSerializer(serializers.Serializer):
    """One suggestion. Must match placeSchema in the frontend's api/schemas.ts."""

    id = serializers.CharField()
    label = serializers.CharField()
    lat = serializers.FloatField()
    lon = serializers.FloatField()
    timezone = serializers.CharField()
