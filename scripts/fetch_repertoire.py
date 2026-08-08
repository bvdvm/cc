#!/usr/bin/env python3
"""Pobiera repertuar Cinema City Poznań (Plaza + Kinepolis) do data/films.json."""

import json, sys, urllib.request
from datetime import date, timedelta
from pathlib import Path

BASE    = "https://www.cinema-city.pl/pl/data-api-service/v1/quickbook/10103"
HEADERS = {"User-Agent":"Mozilla/5.0","Accept":"application/json","Referer":"https://www.cinema-city.pl/"}
DAYS    = 14
DATA    = Path(__file__).resolve().parent.parent / "data" / "films.json"
FILTERS = ["plaza","kinepolis"]
CITY    = "pozna"

def get_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())

def find_cinemas(until):
    data = get_json(f"{BASE}/cinemas/with-event/until/{until}?attr=&lang=pl_PL")
    out  = []
    for c in data.get("body",{}).get("cinemas",[]):
        name = (c.get("displayName") or "").lower()
        addr = (c.get("address")     or "").lower()
        if (CITY in name or CITY in addr) and any(f in name for f in FILTERS):
            out.append({"id":str(c["id"]),"name":c["displayName"]})
    return out

def fetch_day(cid, day):
    data = get_json(f"{BASE}/film-events/in-cinema/{cid}/at-date/{day}?attr=&lang=pl_PL")
    body = data.get("body",{})
    return body.get("films",[]), body.get("events",[])

def load():
    if DATA.exists():
        with open(DATA,encoding="utf-8") as f: return json.load(f)
    return {"months":{},"showtimes":{},"updated":None}

def save(db):
    DATA.parent.mkdir(parents=True,exist_ok=True)
    with open(DATA,"w",encoding="utf-8") as f:
        json.dump(db,f,ensure_ascii=False,indent=1,sort_keys=True)

def main():
    today = date.today()
    until = (today + timedelta(days=DAYS)).isoformat()
    cinemas = find_cinemas(until)
    if not cinemas:
        print("Nie znaleziono kin.", file=sys.stderr); sys.exit(1)
    print("Kina:", ", ".join(f'{c["name"]}({c["id"]})' for c in cinemas))

    db = load()
    now_key = today.strftime("%Y-%m")
    db["showtimes"] = {}

    for offset in range(DAYS+1):
        day = today + timedelta(days=offset)
        day_str = day.isoformat()
        mk = day.strftime("%Y-%m")
        for cinema in cinemas:
            try: films, events = fetch_day(cinema["id"], day_str)
            except Exception as e: print(f"  ! {cinema['name']} {day_str}: {e}", file=sys.stderr); continue

            month = db["months"].setdefault(mk, {"films":{}})
            for f in films:
                fid = str(f["id"])
                entry = month["films"].setdefault(fid, {
                    "id":fid,"title":f.get("name","?"),"poster":f.get("posterLink"),
                    "link":f.get("link"),"length":f.get("length"),"year":f.get("releaseYear"),
                    "cinemas":[],"firstSeen":day_str
                })
                if not entry.get("poster") and f.get("posterLink"): entry["poster"] = f["posterLink"]
                if cinema["name"] not in entry["cinemas"]: entry["cinemas"].append(cinema["name"])

            if mk == now_key:
                for ev in events:
                    fid = str(ev.get("filmId"))
                    slot = {"dt":ev.get("eventDateTime"),"cinema":cinema["name"],
                            "attrs":[a for a in (ev.get("attributeIds") or []) if a in ("imax","4dx","vip","screenx","3d")]}
                    db["showtimes"].setdefault(fid,[])
                    if len(db["showtimes"][fid]) < 6: db["showtimes"][fid].append(slot)

    db["updated"] = today.isoformat()
    save(db)
    print(f"OK — miesiące: {', '.join(sorted(db['months'].keys()))}")

if __name__ == "__main__": main()
