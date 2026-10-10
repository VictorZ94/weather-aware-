from django.urls import path

from .views import SuggestPlacesView

urlpatterns = [
    path('suggest/', SuggestPlacesView.as_view(), name='places-suggest'),
]
