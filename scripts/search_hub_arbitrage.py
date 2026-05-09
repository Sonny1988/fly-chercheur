#!/usr/bin/env python3
"""
Hub Price Arbitrage Engine
Finds cheaper Business/First travel via: positioning flight (economy) + hub long-haul (business).

Example: AMS→IST Ryanair €40 + IST→BKK Turkish Business €900 = €940 vs AMS→BKK direct €3500

Usage:
  python search_hub_arbitrage.py --origin AMS --destination BKK \
    --start-date 2026-09-01 --end-date 2026-09-30 --seat business
"""

import argparse
import json
import sys
import os
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent

# Ryanair serves secondary airports — map hub IATA to the one Ryanair actually uses
RYANAIR_HUB_ALIAS = {
    "IST": "SAW",  # Istanbul: Ryanair → Sabiha Gökçen
    "BRU": "CRL",  # Brussels: Ryanair → Charleroi
    "CDG": "BVA",  # Paris: Ryanair → Beauvais
}

# ── Hub database ────────────────────────────────────────────────────────────
# Hubs where the main airline prices business class far below European carriers.
# positioning_airports: best airports to FLY FROM (LCCs depart here)
# main_airline: who you'll fly long-haul from this hub

HUBS = [
    {
        "iata": "IST",
        "name": "Istanbul",
        "main_airline": "Turkish Airlines (TK)",
        "positioning_airports": ["EIN", "STN", "BRU", "CRL", "AMS"],
        "priority_for_ryanair": ["EIN", "STN", "BRU", "CRL"],
        "note": "TK business 25-30% of European carriers. Ryanair/Pegasus from EIN/STN ~€30-60.",
        "regions": ["asia", "africa", "middle-east", "americas"],
        "typical_saving_pct": 65,
    },
    {
        "iata": "DOH",
        "name": "Doha",
        "main_airline": "Qatar Airways (QR)",
        "positioning_airports": ["AMS", "EIN"],
        "priority_for_ryanair": [],
        "note": "QR business from DOH often 30-45% cheaper than from AMS. World's best airline.",
        "regions": ["asia", "africa", "americas", "australia"],
        "typical_saving_pct": 40,
    },
    {
        "iata": "DXB",
        "name": "Dubai",
        "main_airline": "Emirates (EK)",
        "positioning_airports": ["AMS", "EIN"],
        "priority_for_ryanair": [],
        "note": "EK from DXB hub — local market pricing. FlyDubai connects some EU cities.",
        "regions": ["asia", "africa", "americas", "australia"],
        "typical_saving_pct": 30,
    },
    {
        "iata": "ADD",
        "name": "Addis Ababa",
        "main_airline": "Ethiopian Airlines (ET)",
        "positioning_airports": ["AMS"],
        "priority_for_ryanair": [],
        "note": "ET business to all Africa & some Asia 40-55% cheaper. Best for African destinations.",
        "regions": ["africa", "asia"],
        "typical_saving_pct": 50,
    },
    {
        "iata": "CMN",
        "name": "Casablanca",
        "main_airline": "Royal Air Maroc (AT)",
        "positioning_airports": ["AMS", "BRU", "STN", "ORY"],
        "priority_for_ryanair": ["STN", "BRU"],
        "note": "AT business to West & Central Africa very competitive. Ryanair to CMN from STN.",
        "regions": ["africa"],
        "typical_saving_pct": 45,
    },
    {
        "iata": "KUL",
        "name": "Kuala Lumpur",
        "main_airline": "Malaysia Airlines (MH)",
        "positioning_airports": ["AMS"],
        "priority_for_ryanair": [],
        "note": "MH business at hub prices for SE Asia & Australia. Underrated carrier.",
        "regions": ["asia", "australia"],
        "typical_saving_pct": 35,
    },
    {
        "iata": "SIN",
        "name": "Singapour",
        "main_airline": "Singapore Airlines (SQ)",
        "positioning_airports": ["AMS"],
        "priority_for_ryanair": [],
        "note": "SQ sometimes cheaper from SIN for Australia & Japan. Premium product.",
        "regions": ["asia", "australia"],
        "typical_saving_pct": 25,
    },
    {
        "iata": "BOM",
        "name": "Mumbai",
        "main_airline": "Air India (AI)",
        "positioning_airports": ["AMS", "LHR"],
        "priority_for_ryanair": [],
        "note": "AI business to Asia often 50-60% cheaper than European carriers.",
        "regions": ["asia", "australia"],
        "typical_saving_pct": 55,
    },
    {
        "iata": "MCT",
        "name": "Muscat",
        "main_airline": "Oman Air (WY)",
        "positioning_airports": ["AMS"],
        "priority_for_ryanair": [],
        "note": "WY business to Asia/Africa — massively underrated, often cheapest J fare.",
        "regions": ["asia", "africa"],
        "typical_saving_pct": 50,
    },
    {
        "iata": "CMB",
        "name": "Colombo",
        "main_airline": "SriLankan Airlines (UL)",
        "positioning_airports": ["AMS"],
        "priority_for_ryanair": [],
        "note": "UL business to SE Asia & Maldives, very competitive.",
        "regions": ["asia"],
        "typical_saving_pct": 40,
    },
]

# Transport cost to get from AMS city to positioning airports
POSITIONING_TRANSPORT = {
    "EIN": {"cost": 25, "time_min": 45, "method": "Train/bus depuis AMS"},
    "RTM": {"cost": 15, "time_min": 60, "method": "Train depuis AMS"},
    "BRU": {"cost": 33, "time_min": 120, "method": "Thalys/Eurostar"},
    "CRL": {"cost": 40, "time_min": 150, "method": "Bus/train vers Charleroi"},
    "STN": {"cost": 130, "time_min": 240, "method": "Vol/ferry vers Londres Stansted"},
    "LGW": {"cost": 130, "time_min": 240, "method": "Vol/ferry vers Londres Gatwick"},
    "CDG": {"cost": 35, "time_min": 150, "method": "Thalys/Eurostar vers Paris"},
    "ORY": {"cost": 40, "time_min": 180, "method": "Thalys + RER vers Orly"},
    "AMS": {"cost": 0, "time_min": 0, "method": "Aéroport principal"},
    "LHR": {"cost": 130, "time_min": 240, "method": "Vol/Eurostar vers Londres"},
}


def run_google_flights(origin, destination, start_date, end_date, seat, adults,
                       currency="EUR", sample_mode=3):
    """Call search_flights.py and return (flights_list, error_str)."""
    script = str(SCRIPT_DIR / "search_flights.py")
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode='w') as f:
        tmp_path = f.name
    try:
        cmd = [
            sys.executable, script,
            "--origin", origin,
            "--destination", destination,
            "--start-date", start_date,
            "--end-date", end_date,
            "--trip-type", "one-way",
            "--seat", seat,
            "--adults", str(adults),
            "--currency", currency,
            "--sample-mode", str(sample_mode),
            "--delay", "1.5",
            "--output", tmp_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', timeout=120)
        if result.returncode != 0:
            return None, result.stderr[:200]
        with open(tmp_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        flights = data.get("all_flights_sorted_by_price", [])
        flights = [fl for fl in flights if fl.get("price_numeric") is not None]
        return flights, None
    except Exception as e:
        return None, str(e)
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


def run_ryanair(origin, destination, date_from, date_to, currency="EUR", limit=15):
    """Call search_ryanair.py and return (flights_list, error_str)."""
    script = str(SCRIPT_DIR / "search_ryanair.py")
    try:
        cmd = [
            sys.executable, script,
            "--origin", origin,
            "--destination", destination,
            "--date-from", date_from,
            "--date-to", date_to,
            "--currency", currency,
            "--limit", str(limit),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', timeout=60)
        if result.returncode != 0:
            return None, result.stderr[:200]
        data = json.loads(result.stdout)
        flights = data.get("all_flights_sorted_by_price", [])
        return flights, None
    except Exception as e:
        return None, str(e)


def run_tequila(origin, destination, date_from, date_to, adults, currency="EUR",
                api_key=None, limit=20):
    """Call search_tequila.py and return (flights_list, error_str)."""
    script = str(SCRIPT_DIR / "search_tequila.py")
    key = api_key or os.environ.get("TEQUILA_API_KEY", "")
    if not key:
        return None, "No TEQUILA_API_KEY"
    try:
        cmd = [
            sys.executable, script,
            "--origin", origin,
            "--destination", destination,
            "--date-from", date_from,
            "--date-to", date_to,
            "--adults", str(adults),
            "--currency", currency,
            "--limit", str(limit),
            "--api-key", key,
            "--max-stops", "0",  # positioning = direct only
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', timeout=30)
        if result.returncode != 0:
            return None, result.stderr[:200]
        data = json.loads(result.stdout)
        flights = data.get("all_flights_sorted_by_price", [])
        return flights, None
    except Exception as e:
        return None, str(e)


def cheapest(flights):
    """Return cheapest flight object from list, or None."""
    if not flights:
        return None
    valid = [f for f in flights if f.get("price_numeric") is not None]
    return min(valid, key=lambda x: x["price_numeric"]) if valid else None


def find_cheapest_positioning(hub_iata, hub_def, start_date, end_date, adults,
                              currency, origin_iata, api_key):
    """
    Find the cheapest way to get from origin_iata to hub_iata in economy.
    Tries: Ryanair from LCC airports, Tequila, then Google Flights.
    Returns (cheapest_flight_dict, source_description).
    """
    candidates = []

    # 1. Try Ryanair from LCC airports (often cheapest for IST, CMN, etc.)
    ryanair_hub = RYANAIR_HUB_ALIAS.get(hub_iata, hub_iata)  # e.g. IST → SAW
    for apt in hub_def.get("priority_for_ryanair", []):
        if apt == origin_iata:
            continue  # skip if same as main origin (handled by Google)
        flights, _ = run_ryanair(apt, ryanair_hub, start_date, end_date, currency)
        if flights:
            best = cheapest(flights)
            if best:
                transport = POSITIONING_TRANSPORT.get(apt, {"cost": 50, "time_min": 120, "method": "?"})
                total_positioning = best["price_numeric"] + transport["cost"]
                candidates.append({
                    **best,
                    "positioning_from_airport": apt,
                    "transport_cost": transport["cost"],
                    "transport_method": transport["method"],
                    "total_positioning_cost": total_positioning,
                    "source": f"Ryanair depuis {apt}",
                })

    # 2. Try Tequila for LCC aggregated results (direct flights to hub)
    tequila_airports = hub_def.get("positioning_airports", [origin_iata])
    for apt in tequila_airports[:2]:  # limit to avoid too many calls
        flights, _ = run_tequila(apt, hub_iata, start_date, end_date, adults,
                                  currency, api_key)
        if flights:
            best = cheapest(flights)
            if best:
                transport = POSITIONING_TRANSPORT.get(apt, {"cost": 0, "time_min": 0, "method": "?"})
                total_positioning = best["price_numeric"] + transport["cost"]
                candidates.append({
                    **best,
                    "positioning_from_airport": apt,
                    "transport_cost": transport["cost"],
                    "transport_method": transport["method"],
                    "total_positioning_cost": total_positioning,
                    "source": f"Kiwi/Tequila depuis {apt}",
                })

    # 3. Google Flights from main origin
    gf_flights, _ = run_google_flights(origin_iata, hub_iata, start_date, end_date,
                                        "economy", adults, currency, sample_mode=3)
    if gf_flights:
        best = cheapest(gf_flights)
        if best:
            candidates.append({
                **best,
                "positioning_from_airport": origin_iata,
                "transport_cost": 0,
                "transport_method": "Aéroport principal",
                "total_positioning_cost": best["price_numeric"],
                "source": f"Google Flights depuis {origin_iata}",
            })

    if not candidates:
        return None, "Aucun vol de positionnement trouvé"

    # Return cheapest by total positioning cost
    best = min(candidates, key=lambda x: x["total_positioning_cost"])
    return best, best["source"]


def search_hub(hub_def, args, api_key, direct_price):
    """Search one hub: positioning + long-haul business. Returns combo dict or None."""
    hub_iata = hub_def["iata"]

    print(f"  [{hub_iata}] Positionnement + {hub_def['main_airline']} business...",
          file=sys.stderr)

    # --- Positioning flight ---
    pos_flight, pos_source = find_cheapest_positioning(
        hub_iata, hub_def,
        args.start_date, args.end_date,
        args.adults, args.currency, args.origin, api_key
    )

    if pos_flight is None:
        print(f"  [{hub_iata}] Pas de vol de positionnement", file=sys.stderr)
        return None

    pos_price = pos_flight["total_positioning_cost"]
    if pos_price > args.max_positioning:
        print(f"  [{hub_iata}] Positionnement trop cher: {pos_price:.0f}€ > max {args.max_positioning}€",
              file=sys.stderr)
        return None

    # --- Long-haul business from hub ---
    lh_flights, lh_err = run_google_flights(
        hub_iata, args.destination,
        args.start_date, args.end_date,
        args.seat, args.adults, args.currency, sample_mode=3
    )

    if not lh_flights:
        print(f"  [{hub_iata}] Pas de vol long-courrier {args.seat}: {lh_err}",
              file=sys.stderr)
        return None

    lh_best = cheapest(lh_flights)
    if not lh_best:
        return None

    lh_price = lh_best["price_numeric"]
    total = pos_price + lh_price
    saving = (direct_price - total) if direct_price else None
    saving_pct = (saving / direct_price * 100) if direct_price and saving else None

    print(f"  [{hub_iata}] Positionnement {pos_price:.0f}€ + {args.seat} {lh_price:.0f}€ = TOTAL {total:.0f}€"
          + (f" (économie {saving:.0f}€ / {saving_pct:.0f}%)" if saving else ""),
          file=sys.stderr)

    return {
        "hub_iata": hub_iata,
        "hub_name": hub_def["name"],
        "hub_airline": hub_def["main_airline"],
        "hub_note": hub_def["note"],
        "typical_saving_pct": hub_def.get("typical_saving_pct"),
        "positioning": {
            "from_airport": pos_flight.get("positioning_from_airport", args.origin),
            "to_hub": hub_iata,
            "airline": pos_flight.get("airline", "?"),
            "flight_price": pos_flight["price_numeric"],
            "transport_cost": pos_flight.get("transport_cost", 0),
            "transport_method": pos_flight.get("transport_method", ""),
            "total_cost": pos_price,
            "source": pos_source,
            "sample_date": pos_flight.get("search_date") or pos_flight.get("departure", "")[:10],
        },
        "long_haul": {
            "from_hub": hub_iata,
            "to_destination": args.destination,
            "airline": lh_best.get("airline", "?"),
            "price": lh_price,
            "class": args.seat,
            "duration": lh_best.get("duration", "?"),
            "stops": lh_best.get("stops", "?"),
            "sample_date": lh_best.get("search_date", "?"),
        },
        "total_price": total,
        "saving_vs_direct": saving,
        "saving_pct": round(saving_pct, 1) if saving_pct else None,
        "verdict": (
            f"Économie de {saving:.0f}€ ({saving_pct:.0f}%) vs direct {args.seat}"
            if saving and saving > 0
            else "Pas d'économie vs direct"
        ) if direct_price else "Prix direct non disponible",
    }


def main():
    parser = argparse.ArgumentParser(
        description="Hub Price Arbitrage — trouve positioning + business class pas cher"
    )
    parser.add_argument("--origin", required=True, help="Aéroport de départ IATA (ex: AMS)")
    parser.add_argument("--destination", required=True, help="Destination IATA (ex: BKK)")
    parser.add_argument("--start-date", required=True, help="Date début YYYY-MM-DD")
    parser.add_argument("--end-date", required=True, help="Date fin YYYY-MM-DD")
    parser.add_argument("--seat", default="business",
                        choices=["business", "first"],
                        help="Classe cible pour le long-courrier (default: business)")
    parser.add_argument("--adults", type=int, default=1)
    parser.add_argument("--currency", default="EUR")
    parser.add_argument("--hubs", default=None,
                        help="Hubs à vérifier, virgule-séparés (ex: IST,DOH). Défaut: tous")
    parser.add_argument("--max-positioning", type=float, default=350.0,
                        help="Prix max positionnement EUR (inclus transport, défaut: 350)")
    parser.add_argument("--workers", type=int, default=4,
                        help="Recherches hubs en parallèle (défaut: 4)")
    parser.add_argument("--output", default=None, help="Fichier JSON de sortie (défaut: stdout)")
    args = parser.parse_args()

    api_key = os.environ.get("TEQUILA_API_KEY", "")

    print(f"Hub Arbitrage: {args.origin} → {args.destination} [{args.seat.upper()}]",
          file=sys.stderr)
    print(f"Période: {args.start_date} → {args.end_date}", file=sys.stderr)
    print("=" * 60, file=sys.stderr)

    # --- Filter hubs ---
    hubs_to_check = HUBS
    if args.hubs:
        wanted = {h.strip().upper() for h in args.hubs.split(",")}
        hubs_to_check = [h for h in HUBS if h["iata"] in wanted]
        if not hubs_to_check:
            print(f"Aucun hub valide parmi: {args.hubs}", file=sys.stderr)
            sys.exit(1)

    # --- Step 1: Direct baseline ---
    print(f"\n[BASELINE] {args.origin} → {args.destination} {args.seat} direct...",
          file=sys.stderr)
    direct_flights, direct_err = run_google_flights(
        args.origin, args.destination,
        args.start_date, args.end_date,
        args.seat, args.adults, args.currency, sample_mode=3
    )
    direct_best = cheapest(direct_flights) if direct_flights else None
    direct_price = direct_best["price_numeric"] if direct_best else None

    if direct_price:
        print(f"  Direct {args.seat}: {direct_price:.0f} {args.currency} "
              f"({direct_best.get('airline', '?')})", file=sys.stderr)
    else:
        print(f"  Direct {args.seat}: non disponible ({direct_err})", file=sys.stderr)

    # --- Step 2: Search all hubs in parallel ---
    print(f"\n[HUBS] Recherche sur {len(hubs_to_check)} hubs en parallèle ({args.workers} workers)...",
          file=sys.stderr)

    combos = []
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {
            executor.submit(search_hub, hub, args, api_key, direct_price): hub
            for hub in hubs_to_check
        }
        for future in as_completed(futures):
            try:
                result = future.result()
                if result:
                    combos.append(result)
            except Exception as e:
                hub = futures[future]
                print(f"  [{hub['iata']}] Erreur: {e}", file=sys.stderr)

    # Sort by total price
    combos.sort(key=lambda x: x["total_price"])

    # --- Build output ---
    winner = combos[0] if combos else None
    print("\n" + "=" * 60, file=sys.stderr)
    if winner:
        print(f"GAGNANT: {winner['hub_iata']} — Total {winner['total_price']:.0f}€"
              + (f" (économie {winner['saving_vs_direct']:.0f}€)" if winner.get('saving_vs_direct') else ""),
              file=sys.stderr)
    else:
        print("Aucune combinaison trouvée.", file=sys.stderr)

    output = {
        "query": {
            "origin": args.origin,
            "destination": args.destination,
            "start_date": args.start_date,
            "end_date": args.end_date,
            "seat": args.seat,
            "adults": args.adults,
            "currency": args.currency,
        },
        "direct_baseline": {
            "price": direct_price,
            "airline": direct_best.get("airline", "?") if direct_best else None,
            "currency": args.currency,
        } if direct_best else None,
        "arbitrage_combos": combos,
        "summary": {
            "hubs_checked": len(hubs_to_check),
            "combos_found": len(combos),
            "best_total": winner["total_price"] if winner else None,
            "best_hub": winner["hub_iata"] if winner else None,
            "best_saving_eur": winner["saving_vs_direct"] if winner else None,
            "best_saving_pct": winner["saving_pct"] if winner else None,
        },
    }

    json_str = json.dumps(output, ensure_ascii=False, indent=2)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(json_str)
        print(f"Résultats sauvegardés: {args.output}", file=sys.stderr)
    else:
        sys.stdout.buffer.write(json_str.encode("utf-8"))
        sys.stdout.buffer.write(b"\n")


if __name__ == "__main__":
    main()
