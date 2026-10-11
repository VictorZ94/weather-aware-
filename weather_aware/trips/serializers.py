from datetime import datetime, timedelta

from django.utils import timezone
from rest_framework import serializers

MAX_DAYS_AHEAD = 7
MAX_CARGO_KG = 50_000
INTERVALS = (10, 25, 50)
# A form filled in a moment ago should not fail for being seconds in the past.
PAST_GRACE = timedelta(minutes=5)


class PlaceInputSerializer(serializers.Serializer):
    id = serializers.CharField()
    label = serializers.CharField()
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lon = serializers.FloatField(min_value=-180, max_value=180)
    timezone = serializers.CharField()


class TripPlanRequestSerializer(serializers.Serializer):
    """The plan-trip request. Must match TripPlanRequest in the frontend's api/schemas.ts."""

    origin = PlaceInputSerializer(error_messages={'required': 'Choose an origin.', 'null': 'Choose an origin.'})
    destination = PlaceInputSerializer(
        error_messages={'required': 'Choose a destination.', 'null': 'Choose a destination.'}
    )
    departure_time = serializers.CharField(error_messages={'required': 'Enter a departure date and time.'})
    load_weight_kg = serializers.FloatField(error_messages={'required': 'Enter the cargo weight.'})
    checkpoint_interval_miles = serializers.IntegerField(
        error_messages={'required': 'Choose a checkpoint interval.'}
    )

    def validate_departure_time(self, value):
        try:
            departure = datetime.fromisoformat(value)
        except ValueError:
            raise serializers.ValidationError('Enter a valid departure date and time.')
        if departure.tzinfo is None:
            raise serializers.ValidationError('Departure time must include a time zone offset.')
        now = timezone.now()
        if departure < now - PAST_GRACE:
            raise serializers.ValidationError('Departure cannot be in the past.')
        if departure > now + timedelta(days=MAX_DAYS_AHEAD):
            raise serializers.ValidationError(
                f'Departure can be at most {MAX_DAYS_AHEAD} days ahead; forecasts do not reach further.'
            )
        return departure

    def validate_load_weight_kg(self, value):
        if value <= 0:
            raise serializers.ValidationError('Cargo weight must be greater than 0.')
        if value > MAX_CARGO_KG:
            raise serializers.ValidationError('Cargo weight is more than a truck can carry.')
        return value

    def validate_checkpoint_interval_miles(self, value):
        if value not in INTERVALS:
            raise serializers.ValidationError('Checkpoint interval must be 10, 25 or 50 miles.')
        return value

    def validate(self, data):
        origin, destination = data['origin'], data['destination']
        same_spot = abs(origin['lat'] - destination['lat']) < 1e-4 and abs(origin['lon'] - destination['lon']) < 1e-4
        if same_spot:
            raise serializers.ValidationError({'destination': 'Destination must be different from the origin.'})
        return data


def field_errors(errors):
    """Flatten DRF's nested errors to one message per request field."""
    flat = {}
    for field, problem in errors.items():
        while isinstance(problem, dict):
            problem = next(iter(problem.values()))
        if isinstance(problem, (list, tuple)):
            problem = problem[0]
        flat[field] = str(problem)
    return flat
