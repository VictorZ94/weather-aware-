from rest_framework import status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from django.conf import settings

from .planner import plan_trip
from .serializers import TripPlanRequestSerializer, field_errors
from .simulated_weather import SCENARIOS


class PlanTripView(APIView):
    """POST /api/trips/plan/ -> routes, checkpoints, risk, recommendation and heatmap."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'plan'

    def post(self, request):
        serializer = TripPlanRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {
                    'detail': 'Some trip details need fixing.',
                    'field_errors': field_errors(serializer.errors),
                    'retryable': False,
                },
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        return Response(plan_trip(serializer.validated_data))


class WeatherScenariosView(APIView):
    """GET /api/trips/weather-scenarios/ -> the simulated-weather choices.

    Empty unless simulation is allowed, which is how the frontend knows
    whether to offer the selector at all.
    """

    def get(self, request):
        return Response({'scenarios': SCENARIOS if settings.ALLOW_WEATHER_SIMULATION else []})
