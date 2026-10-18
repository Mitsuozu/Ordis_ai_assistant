from django.urls import path

from . import views

urlpatterns = [
    path("", views.index, name="index"),
    path("offline/", views.offline, name="offline"),
    path("api/chat/", views.chat, name="chat"),
    path("manifest.json", views.manifest, name="manifest"),
    path("service-worker.js", views.service_worker, name="service_worker"),
]
