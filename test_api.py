import urllib.request
import json

base_url = "http://3.25.230.225"
endpoints = [
    "/",
    "/health",
    "/api/infrastructure/nodes",
    "/api/infrastructure/dashboard",
    "/api/infrastructure/metrics/history",
    "/api/incidents/",
    "/api/agents/",
    "/api/agents/runbooks",
    "/api/datasources/",
    "/api/simulators/",
    "/api/settings/",
    "/api/settings/ollama-models",
    "/api/settings/gemini-models"
]

for ep in endpoints:
    url = base_url + ep
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            status = response.getcode()
            body = response.read().decode('utf-8')
            print(f"[OK] {ep} - {status} - Length: {len(body)}")
            if status == 500:
                print(f"BODY: {body[:200]}")
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        print(f"[ERROR] {ep} - {e.code}")
        print(f"BODY: {body[:500]}")
    except Exception as e:
        print(f"[FAIL] {ep} - {str(e)}")
