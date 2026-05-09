#!/usr/bin/env python3
"""
Ryanair Price Calendar
Scans a date range and returns cheapest Ryanair price per day.
Works from multiple nearby airports simultaneously.

Usage:
  python ryanair_calendar.py --origin AMS --destination AGP \
    --date-from 2026-09-01 --date-to 2026-11-30
"""

import argparse
import json
import sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta

from ryanair import Ryanair


NEARBY_AIRPORTS = {
    "AMS": ["AMS", "EIN", "RTM"],
    "EIN": ["EIN", "AMS", "RTM"],
    "BRU": ["BRU", "CRL"],
    "CDG": ["CDG", "ORY"],
    "LHR": ["LHR", "LGW", "STN", "LTN"],
    "FRA": ["FRA"],
    "MUC": ["MUC"],
    "BCN": ["BCN"],
    "MAD": ["MAD"],
}


def parse_args():
    p = argparse.ArgumentParser(description="Ryanair price calendar over a date range")
    p.add_argument("--origin", required=True, help="Main origin IATA (e.g. AMS)")
    p.add_argument("--destination", required=True, help="Destination IATA")
    p.add_argument("--date-from", required=True, help="Start date YYYY-MM-DD")
    p.add_argument("--date-to", required=True, help="End date YYYY-MM-DD")
    p.add_argument("--currency", default="EUR")
    p.add_argument("--extra-airports", default="",
                   help="Extra origin airports to check, comma-separated (e.g. EIN,STN)")
    p.add_argument("--round-trip-nights", type=int, default=None,
                   help="If set, also search return flights N nights later")
    return p.parse_args()


def search_one_airport(api: Ryanair, origin: str, destination: str,
                       date_from: datetime, date_to: datetime,
                       currency: str) -> list[dict]:
    """Fetch all cheapest flights from one airport and return normalised list."""
    try:
        flights = api.get_cheapest_flights(
            airport=origin,
            date_from=date_from,
            date_to=date_to,
            destination_airport=destination,
        )
        results = []
        for f in (flights or []):
            try:
                dep = f.departureTime
                date_str = dep.strftime("%Y-%m-%d") if hasattr(dep, "strftime") else str(dep)[:10]
                results.append({
                    "date": date_str,
                    "origin": origin,
                    "destination": getattr(f, "destination", destination),
                    "airline": "Ryanair",
                    "departure": str(dep),
                    "price": float(f.price),
                    "currency": f.currency,
                    "flight_number": getattr(f, "flightNumber", None),
                })
            except Exception:
                continue
        return results
    except Exception as e:
        print(f"  [{origin}→{destination}] Error: {e}", file=sys.stderr)
        return []


def main():
    args = parse_args()

    date_from = datetime.strptime(args.date_from, "%Y-%m-%d")
    date_to = datetime.strptime(args.date_to, "%Y-%m-%d")

    # Build list of airports to check
    nearby = NEARBY_AIRPORTS.get(args.origin, [args.origin])
    extra = [a.strip().upper() for a in args.extra_airports.split(",") if a.strip()]
    airports = list(dict.fromkeys(nearby + extra))  # deduplicate, preserve order

    print(f"Ryanair calendar: {args.origin} → {args.destination}", file=sys.stderr)
    print(f"Dates: {args.date_from} → {args.date_to} | Airports: {', '.join(airports)}", file=sys.stderr)
    print("---", file=sys.stderr)

    api = Ryanair(currency=args.currency)

    # Search all airports in parallel
    all_flights: list[dict] = []
    with ThreadPoolExecutor(max_workers=len(airports)) as executor:
        futures = {
            executor.submit(search_one_airport, api, apt, args.destination,
                            date_from, date_to, args.currency): apt
            for apt in airports
        }
        for future in as_completed(futures):
            apt = futures[future]
            try:
                results = future.result()
                all_flights.extend(results)
                if results:
                    cheapest = min(results, key=lambda x: x["price"])
                    print(f"  [{apt}] {len(results)} flights, cheapest: {cheapest['price']:.2f}€ on {cheapest['date']}", file=sys.stderr)
                else:
                    print(f"  [{apt}] No flights found", file=sys.stderr)
            except Exception as e:
                print(f"  [{apt}] Exception: {e}", file=sys.stderr)

    # Build price-by-date dict: cheapest price across all airports for each date
    by_date: dict[str, dict] = {}
    for f in all_flights:
        date = f["date"]
        if date not in by_date or f["price"] < by_date[date]["price"]:
            by_date[date] = f

    # Also build per-airport calendar
    by_airport_date: dict[str, dict[str, float]] = defaultdict(dict)
    for f in all_flights:
        apt = f["origin"]
        date = f["date"]
        if date not in by_airport_date[apt] or f["price"] < by_airport_date[apt][date]:
            by_airport_date[apt][date] = f["price"]

    # Summary stats
    prices = [v["price"] for v in by_date.values()]
    cheapest_day = min(by_date.values(), key=lambda x: x["price"]) if by_date else None
    priciest_day = max(by_date.values(), key=lambda x: x["price"]) if by_date else None

    # Weekly averages (Mon=0 … Sun=6)
    weekday_prices: dict[int, list[float]] = defaultdict(list)
    for date_str, f in by_date.items():
        try:
            wd = datetime.strptime(date_str, "%Y-%m-%d").weekday()
            weekday_prices[wd].append(f["price"])
        except Exception:
            pass
    weekday_avg = {
        wd: round(sum(ps) / len(ps), 2)
        for wd, ps in weekday_prices.items()
    }
    weekday_names = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
    cheapest_weekday = min(weekday_avg, key=weekday_avg.get) if weekday_avg else None

    # Monthly averages
    monthly: dict[str, list[float]] = defaultdict(list)
    for date_str, f in by_date.items():
        month = date_str[:7]
        monthly[month].append(f["price"])
    monthly_avg = {m: round(sum(ps) / len(ps), 2) for m, ps in monthly.items()}
    cheapest_month = min(monthly_avg, key=monthly_avg.get) if monthly_avg else None

    if cheapest_day:
        print(f"\nBest day: {cheapest_day['date']} — {cheapest_day['price']:.2f}€ from {cheapest_day['origin']}", file=sys.stderr)
    if cheapest_weekday is not None:
        print(f"Best weekday: {weekday_names[cheapest_weekday]} (avg {weekday_avg[cheapest_weekday]:.2f}€)", file=sys.stderr)
    if cheapest_month:
        print(f"Best month: {cheapest_month} (avg {monthly_avg[cheapest_month]:.2f}€)", file=sys.stderr)

    output = {
        "source": "ryanair_calendar",
        "query": {
            "origin": args.origin,
            "destination": args.destination,
            "date_from": args.date_from,
            "date_to": args.date_to,
            "airports_checked": airports,
            "currency": args.currency,
        },
        "search_summary": {
            "days_with_flights": len(by_date),
            "total_flights_scanned": len(all_flights),
            "cheapest_price": min(prices) if prices else None,
            "cheapest_day": cheapest_day,
            "priciest_day": priciest_day,
            "price_range": [min(prices), max(prices)] if prices else None,
            "cheapest_weekday": weekday_names[cheapest_weekday] if cheapest_weekday is not None else None,
            "cheapest_month": cheapest_month,
            "weekday_averages": {weekday_names[k]: v for k, v in weekday_avg.items()},
            "monthly_averages": monthly_avg,
        },
        "price_by_date": {
            date: {
                "price": f["price"],
                "origin": f["origin"],
                "flight_number": f.get("flight_number"),
            }
            for date, f in sorted(by_date.items())
        },
        "per_airport": {
            apt: dict(sorted(dates.items()))
            for apt, dates in by_airport_date.items()
        },
    }

    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
