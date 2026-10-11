from django.urls import path

from .views import PlanTripView, WeatherScenariosView

urlpatterns = [
    path('plan/', PlanTripView.as_view(), name='trips-plan'),
    path('weather-scenarios/', WeatherScenariosView.as_view(), name='trips-weather-scenarios'),
]
