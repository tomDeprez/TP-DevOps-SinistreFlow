#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
RECETTE OFFICIELLE - réservée au formateur (ne pas distribuer aux étudiants)
=============================================================================
Lancée par le formateur sur la VM de chaque groupe, après leur déclaration de "fin de déploiement".
Elle rejoue le connecteur ExpertAuto PUIS ajoute des contrôles que les étudiants ne connaissent pas :
un groupe qui a "bricolé pour faire passer le connecteur" sans corriger les causes est détecté.

Usage (sur la VM, dans le dossier du projet) :
  SINISTREFLOW_URL=http://127.0.0.1:3000 \
  EXPERTAUTO_API_KEY=ea_live_7f3c9a1e5b2d4f60 \
  BO_USER=gestionnaire BO_PASSWORD=<mdp du groupe> \
  PUBLIC_URL=http://<ip-publique-de-la-vm> \
  python3 recette_officielle.py [chemin/vers/partner-client/expertauto_sync.py]

Code retour : 0 si tout est conforme. Le score /100 est affiché à la fin.
"""
import base64
import datetime
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("SINISTREFLOW_URL", "http://127.0.0.1:3000").rstrip("/")
PUBLIC = os.environ.get("PUBLIC_URL", "").rstrip("/")
KEY = os.environ.get("EXPERTAUTO_API_KEY", "ea_live_7f3c9a1e5b2d4f60")
BO = (os.environ.get("BO_USER"), os.environ.get("BO_PASSWORD"))
CONNECTOR = sys.argv[1] if len(sys.argv) > 1 else "partner-client/expertauto_sync.py"

results = []


def call(method, url, body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            raw, status, hdrs = r.read().decode(), r.status, dict(r.headers)
    except urllib.error.HTTPError as e:
        raw, status, hdrs = e.read().decode(errors="replace"), e.code, dict(e.headers)
    except Exception as e:  # noqa: BLE001
        return 0, str(e), {}
    try:
        return status, json.loads(raw), hdrs
    except ValueError:
        return status, raw, hdrs


def partner(method, path, body=None):
    return call(method, BASE + path, body, {"X-API-Key": KEY})


def bo(method, path, body=None):
    token = base64.b64encode(f"{BO[0]}:{BO[1]}".encode()).decode()
    return call(method, BASE + path, body, {"Authorization": f"Basic {token}"})


def check(points, ticket, label, ok, detail=""):
    results.append((points, ticket, label, bool(ok), detail))
    print(f"  {'OK ' if ok else 'KO '} [{ticket:7}] {label}" + ("" if ok else f"  -> {detail}"))


def days_ago(n):
    return (datetime.date.today() - datetime.timedelta(days=n)).isoformat()


def section(title):
    print(f"\n== {title}")


# ---------------------------------------------------------------------------
section("1. Connecteur ExpertAuto (version distribuée aux étudiants)")
env = dict(os.environ, SINISTREFLOW_URL=BASE, EXPERTAUTO_API_KEY=KEY, NO_COLOR="1")
proc = subprocess.run([sys.executable, CONNECTOR], env=env, capture_output=True, text=True)
check(25, "PARTNER", "connecteur ExpertAuto conforme (code retour 0)", proc.returncode == 0,
      (proc.stdout.strip().splitlines() or ["?"])[-1])

# ---------------------------------------------------------------------------
section("2. API partenaires : contrôles complémentaires")
s, b, _ = call("GET", BASE + "/api/v1/claims")
check(3, "SF-101", "sans clé API -> 401", s == 401, f"HTTP {s}")
check(3, "SF-114", "erreur sans stack trace", isinstance(b, dict) and "stack" not in b, str(b)[:80])
s, b, _ = partner("GET", "/api/v2/claims/SIN-1999-000000")
check(2, "SF-114", "dossier inconnu -> 404", s == 404, f"HTTP {s}")
s, b, _ = call("GET", BASE + "/api/v1/claims?limit=1", headers={"x-api-key": KEY})
check(2, "SF-101", "en-tête x-api-key en minuscules accepté", s == 200, f"HTTP {s}")

s1, p1, _ = partner("GET", "/api/v1/claims?page=1&limit=5")
s2, p2, _ = partner("GET", "/api/v1/claims?page=2&limit=5")
ok = s1 == s2 == 200 and len(p1.get("data", [])) == 5 and not (
    {c["reference"] for c in p1["data"]} & {c["reference"] for c in p2.get("data", [])})
check(3, "SF-107", "pagination v1 : pages 1 et 2 disjointes, 5 éléments", ok, f"{s1}/{s2}")

for version in (1, 2, 3):
    s, _, _ = partner("GET", f"/api/v{version}/claims/{p1['data'][0]['reference']}" if s1 == 200 else "/api/v1/claims")
    check(2, "SF-109", f"API v{version} toujours servie", s == 200, f"HTTP {s}")

s, b, _ = partner("GET", "/api/v3/claims?status=ASSESSMENT_PENDING&limit=100")
auto = []
if s == 200:
    for item in b.get("items", []):
        if item["contract"]["product"] == "AUTO":
            auto.append(item["reference"])
if auto:
    ref = auto[-1]
    _, v1, _ = partner("GET", f"/api/v1/claims/{ref}")
    _, v2, _ = partner("GET", f"/api/v2/claims/{ref}")
    _, v3, _ = partner("GET", f"/api/v3/claims/{ref}")
    check(3, "SF-109", "immatriculation identique v1/v2/v3 sur un autre dossier",
          v1.get("immatriculation") and v1.get("immatriculation") == v2.get("vehiclePlate") == (v3.get("vehicle") or {}).get("plate"),
          f"{v1.get('immatriculation')} / {v2.get('vehiclePlate')}")
    check(2, "SF-110", "indemnityCents/estimatedAmountCents entiers en v2",
          isinstance(v2.get("estimatedAmountCents"), int), type(v2.get("estimatedAmountCents")).__name__)
else:
    check(3, "SF-109", "dossier AUTO en attente disponible pour contrôle", False, "base épuisée : restaurer le dump")

# ---------------------------------------------------------------------------
section("3. Parcours assuré (API publique)")
s, b, _ = call("POST", BASE + "/api/public/contracts/verify",
               {"contractNumber": "MA-AUTO-001001", "email": "CAMILLE.durand@example.TEST"})
check(3, "SF-112", "email insensible à la casse", s == 200, f"HTTP {s}")

decl = {"contractNumber": "MA-HAB-002001", "email": "lucas.bernard@example.test", "type": "DEGAT_DES_EAUX",
        "incidentDate": days_ago(1), "description": "Recette formateur : fuite du lave-linge, parquet abîmé",
        "estimatedAmount": "2 019,99"}
s, a, _ = call("POST", BASE + "/api/public/claims", decl)
check(3, "SF-102", "sinistre de la veille accepté", s == 201, f"HTTP {s} {str(a)[:100]}")
s2, b2, _ = call("POST", BASE + "/api/public/claims", decl)
check(3, "SF-104", "deux déclarations -> deux références distinctes",
      s == s2 == 201 and a.get("reference") != b2.get("reference"), f"{a.get('reference')} / {b2.get('reference')}")
check(3, "SF-113", "montant \"2 019,99\" -> 201999 centimes", s == 201 and a.get("estimatedAmountCents") == 201999,
      repr(a.get("estimatedAmountCents")) if isinstance(a, dict) else "")
check(3, "SF-111", "date renvoyée = date saisie", s == 201 and a.get("incidentDate") == decl["incidentDate"],
      f"{a.get('incidentDate') if isinstance(a, dict) else '?'} vs {decl['incidentDate']}")
check(2, "SF-103", "déclaration à J+1 non tardive", s == 201 and a.get("lateDeclaration") is False,
      repr(a.get("lateDeclaration")) if isinstance(a, dict) else "")
late = dict(decl, incidentDate=days_ago(9))
s, b, _ = call("POST", BASE + "/api/public/claims", late)
check(2, "SF-103", "déclaration à J+9 tardive", s == 201 and b.get("lateDeclaration") is True, str(b)[:80])
theft = dict(decl, type="CAMBRIOLAGE", complaintNumber="PV-RECETTE-001")
s, b, _ = call("POST", BASE + "/api/public/claims", theft)
check(2, "SF-301", "cambriolage avec numéro de plainte accepté (API)", s == 201, f"HTTP {s}")
s, b, _ = call("POST", BASE + "/api/public/claims", dict(decl, type="CAMBRIOLAGE"))
check(2, "SF-114", "déclaration invalide -> 400 (pas 500)", s == 400, f"HTTP {s}")

# ---------------------------------------------------------------------------
section("4. Back-office")
if BO[0] and BO[1]:
    s, b, _ = bo("GET", "/api/internal/claims?q=" + urllib.request.quote("D'Almeida"))
    check(3, "SF-108", "recherche \"D'Almeida\"", s == 200 and len(b.get("items", [])) > 0, f"HTTP {s}")
    s, b, _ = bo("GET", "/api/internal/claims?q=" + urllib.request.quote("%' OR 1=1 --"))
    check(4, "SF-108", "injection SQL sans effet", s == 200 and b.get("items") == [], f"HTTP {s}, {len(b.get('items', [])) if isinstance(b, dict) else '?'} résultats")
    s, b, _ = bo("GET", "/api/internal/claims?status=REFUSE")
    if s == 200 and b.get("items"):
        ref = b["items"][0]["reference"]
        s, r, _ = bo("POST", f"/api/internal/claims/{ref}/transition", {"to": "INDEMNISE"})
        check(3, "SF-105", "REFUSE -> INDEMNISE interdit (409)", s == 409, f"HTTP {s}")
    else:
        check(3, "SF-105", "dossier refusé trouvé", False, f"HTTP {s}")
else:
    print("  (BO_USER / BO_PASSWORD non fournis : section ignorée)")

# ---------------------------------------------------------------------------
section("5. Exploitation & sécurité")
s, b, _ = call("GET", BASE + "/health")
check(3, "SF-115", "/health renvoie un détail de dépendances (base)", s == 200 and isinstance(b, dict) and "database" in json.dumps(b).lower(), str(b)[:100])
s, b, _ = call("GET", BASE + "/metrics")
check(4, "MONITOR", "/metrics expose des métriques Prometheus", s in (200, 401) and (s == 401 or "# TYPE" in str(b)), f"HTTP {s}")
if PUBLIC:
    s, _, _ = call("GET", PUBLIC + "/metrics")
    check(3, "MONITOR", "/metrics NON accessible depuis Internet", s in (0, 401, 403, 404), f"HTTP {s}")
    host = re.sub(r"^https?://", "", PUBLIC).split(":")[0].split("/")[0]
    import socket
    sock = socket.socket()
    sock.settimeout(3)
    exposed = sock.connect_ex((host, 5432)) == 0
    sock.close()
    check(4, "SF-202", "PostgreSQL NON exposé sur Internet (port 5432)", not exposed, "port 5432 ouvert !")
    s, b, _ = call("GET", PUBLIC + "/health")
    check(2, "DEPLOY", "application joignable via l'IP publique (reverse proxy)", s == 200, f"HTTP {s}")
else:
    print("  (PUBLIC_URL non fourni : contrôles réseau ignorés)")

# ---------------------------------------------------------------------------
total = sum(p for p, *_ in results)
score = sum(p for p, _, _, ok, _ in results if ok)
print(f"\nSCORE RECETTE : {score}/{total} -> {round(score * 100 / total)}/100")
fails = [(t, l) for _, t, l, ok, _ in results if not ok]
if fails:
    print("Tickets à revoir :", ", ".join(sorted({t for t, _ in fails})))
sys.exit(0 if not fails else 1)
