#!/usr/bin/env python3
"""Builds public/data/bd-postcodes.json from the Bangladesh-geocode dataset
(https://github.com/bayeziddev/Bangladesh-geocode, MIT).
Output: { "1900": [district_id, upazila_id_or_0, "Post office name"], ... }
Usage: python3 scripts/build-postcodes.py /path/to/Bangladesh-geocode"""
import json, re, sys
src = sys.argv[1] if len(sys.argv) > 1 else "../Bangladesh-geocode"
g = json.load(open("public/data/bd-geo.json"))
pc = json.load(open(f"{src}/src/bangladesh_geo_data/data/postcodes.json"))
norm = lambda s: re.sub(r"[^a-z]", "", (s or "").lower())
alias = {"chittagong": "chattogram", "chattagram": "chattogram", "comilla": "cumilla", "bogra": "bogura", "barisal": "barishal",
         "jessore": "jashore", "chapainawabganj": "chapainababganj", "nawabganj": "chapainababganj", "jhalokathi": "jhalakathi",
         "jhalokati": "jhalakathi", "netrokona": "netrakona", "moulvibazar": "maulvibazar", "bandarbansadar": "bandarban",
         "khagrachari": "khagrachhari"}
A = lambda s: alias.get(norm(s), norm(s))
dist = {A(d[2]): d for d in g["districts"]}
out, matched_d, matched_u = {}, 0, 0
for code, rec in pc.items():
    e = rec.get("en") or {}
    d = dist.get(A(e.get("district")))
    if not d:
        continue
    matched_d += 1
    ups = [u for u in g["upazilas"] if u[1] == d[0]]
    t = norm(e.get("thana"))
    u = next((u for u in ups if norm(u[2]) == t), None) or next((u for u in ups if t and (norm(u[2]) in t or t in norm(u[2]))), None)
    matched_u += bool(u)
    office = re.sub(r"\s*-*\s*TSO\s*", "", e.get("suboffice") or "").replace("--", " ").strip()
    out[code.strip()] = [d[0], u[0] if u else 0, office]
json.dump(out, open("public/data/bd-postcodes.json", "w"), separators=(",", ":"), ensure_ascii=False)
print(f"{len(pc)} postcodes · district matched {matched_d} · upazila matched {matched_u}")
