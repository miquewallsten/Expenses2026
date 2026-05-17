from apps.api.main import app
for route in app.routes:
    methods = getattr(route, "methods", None)
    path = getattr(route, "path", None)
    print(f"{methods} {path}")
