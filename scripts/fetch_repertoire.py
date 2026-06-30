#!/usr/bin/env python3
"""
Pobiera repertuar Cinema City dla kin w Poznaniu (Plaza, Kinepolis)
i dopisuje filmy do data/films.json, pogrupowane po miesiącach.

Uruchamiane cyklicznie przez GitHub Actions (np. co tydzień),
dzięki czemu każdy miesiąc "zbiera" wszystkie filmy, które w nim leciały.
API Cinema City zwraca tylko przyszłe seanse, więc dane historyczne
budują się wyłącznie poprzez regularne uruchamianie skryptu.

UWAGA: ten plik dotyczy WYŁĄCZNIE repertuaru kina (co leci, kiedy).
Oceny, status obejrzane/do obejrzenia, ręcznie dodane filmy, sagi,
seriale i losowanie żyją teraz w Firebase (patrz app.js) i NIE są
ruszane przez ten skrypt.
"""

import json
import sys
import urllib.request
from datetime import date, timedelta
from pathlib import Path

BASE = "https://www.cinema-city.pl/pl/data-api-service/v1/quickbook/10103"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
    "Referer": "https://www.cinema-city.pl/",
}
DAYS_AHEAD = 14

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "films.json"

CINEMA_NAME_FILTERS = ["plaza", "kinepolis"]
CITY_FILTER = "pozna"


def get_json(url: str):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def find_poznan_cinemas(until: str):
    url = f"{BASE}/cinemas/with-event/until/{until}?attr=&lang=pl_PL"
    data = get_json(url)
    cinemas = data.get("body", {}).get("cinemas", [])
    result = []
    for c in cinemas:
        name = (c.get("displayName") or "").lower()
        addr = (c.get("address") or "").lower()
        if CITY_FILTER in name or CITY_FILTER in addr:
            if any(f in name for f in CINEMA_NAME_FILTERS):
                result.append({"id": str(c["id"]), "name": c["displayName"]})
    return result


def fetch_day(cinema_id: str, day: str):
    url = f"{BASE}/film-events/in-cinema/{cinema_id}/at-date/{day}?attr=&lang=pl_PL"
    data = get_json(url)
    body = data.get("body", {})
    return body.get("films", []), body.get("events", [])


def load_db():
    if DATA_FILE.exists():
        with open(DATA_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {"months": {}, "showtimes": {}, "updated": None}


def save_db(db):
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=1, sort_keys=True)


def main():
    today = date.today()
    until = (today + timedelta(days=DAYS_AHEAD)).isoformat()

    cinemas = find_poznan_cinemas(until)
    if not cinemas:
        print("Nie znaleziono kin w Poznaniu — API mogło się zmienić.", file=sys.stderr)
        sys.exit(1)
    print("Kina:", ", ".join(f'{c["name"]} ({c["id"]})' for c in cinemas))

    db = load_db()
    current_month = today.strftime("%Y-%m")
    db["showtimes"] = {}

    films_seen = 0
    for offset in range(DAYS_AHEAD + 1):
        day = today + timedelta(days=offset)
        day_str = day.isoformat()
        month_key = day.strftime("%Y-%m")

        for cinema in cinemas:
            try:
                films, events = fetch_day(cinema["id"], day_str)
            except Exception as e:
                print(f"  ! {cinema['name']} {day_str}: {e}", file=sys.stderr)
                continue

            month = db["months"].setdefault(month_key, {"films": {}})
            film_names = {f["id"]: f for f in films}

            for f in films:
                fid = str(f["id"])
                entry = month["films"].setdefault(fid, {
                    "id": fid,
                    "title": f.get("name", "?"),
                    "poster": f.get("posterLink"),
                    "link": f.get("link"),
                    "length": f.get("length"),
                    "year": f.get("releaseYear"),
                    "cinemas": [],
                    "firstSeen": day_str,
                })
                if not entry.get("poster") and f.get("posterLink"):
                    entry["poster"] = f["posterLink"]
                if cinema["name"] not in entry["cinemas"]:
                    entry["cinemas"].append(cinema["name"])
                films_seen += 1

            if month_key == current_month:
                for ev in events:
                    fid = str(ev.get("filmId"))
                    if fid not in film_names and fid not in month["films"]:
                        continue
                    slot = {
                        "dt": ev.get("eventDateTime"),
                        "cinema": cinema["name"],
                        "attrs": [a for a in (ev.get("attributeIds") or [])
                                  if a in ("imax", "4dx", "vip", "screenx", "3d", "dubbed", "subbed")],
                    }
                    db["showtimes"].setdefault(fid, [])
                    if len(db["showtimes"][fid]) < 6:
                        db["showtimes"][fid].append(slot)

    db["updated"] = today.isoformat()
    save_db(db)
    print(f"OK — zapisano. Rekordów filmowych przetworzono: {films_seen}")
    print(f"Miesiące w bazie: {', '.join(sorted(db['months'].keys()))}")


if __name__ == "__main__":
    main()
