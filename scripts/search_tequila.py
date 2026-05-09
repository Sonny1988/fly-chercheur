#!/usr/bin/env python3
"""Search flights via Kiwi Tequila API v2. Outputs structured JSON."""

import argparse
import json
import os
import sys
from datetime import datetime

import requests


BASE_URL = "https://api.tequila.kiwi.com/v2/search"


def parse_args():
    p = argparse.ArgumentParser(description="Search flights via Kiwi Tequila API")
    p.add_argument("--origin", required=True, help="Origin IATA code(s), comma-separated (e.g. AMS,EIN)")
    p.add_argument("--destination", required=True, help="Destination IATA code (e.g. BKK)")
    p.add_argument("--date-from", required=True, help="Outbound start date YYYY-MM-DD")
    p.add_argument("--date-to", required=True, help="Outbound end date YYYY-MM-DD")
    p.add_argument("--return-from", default=None, help="Return start date YYYY-MM-DD (round-trip)")
    p.add_argument("--return-to", default=None, help="Return end date YYYY-MM-DD (round-trip)")
    p.add_argument("--adults", type=int, default=1)
    p.add_argument("--children", type=int, default=0)
    p.add_argument("--infants", type=int, default=0)
    p.add_argument("--max-stops", type=int, default=None, help="Max stopovers (0=direct)")
    p.add_argument("--currency", default="EUR")
    p.add_argument("--limit", type=int, default=30)
    p.add_argument("--api-key", default=None, help="Tequila API key (or set TEQUILA_API_KEY env var)")
    return p.parse_args()


def to_tequila_date(date_str: str) -> str:
    """Convert YYYY-MM-DD to DD/MM/YYYY as required by Tequila."""
    d = datetime.strptime(date_str, "%Y-%m-%d")
    return d.strftime("%d/%m/%Y")


def flight_to_dict(flight: dict) -> dict:
    """Normalize a Tequila flight object to a common format."""
    try:
        # Extract airline from first route segment
        route = flight.get("route", [])
        airlines = []
        for seg in route:
            al = seg.get("airline", "")
            if al and al not in airlines:
                airlines.append(al)
        airline_str = " + ".join(airlines) if airlines else "?"

        # Origin / destination from route
        origin = route[0]["flyFrom"] if route else flight.get("flyFrom", "?")
        destination = route[-1]["flyTo"] if route else flight.get("flyTo", "?")

        # Departure / arrival times
        departure = flight.get("local_departure", "")[:16] if flight.get("local_departure") else ""
        arrival = flight.get("local_arrival", "")[:16] if flight.get("local_arrival") else ""

        # Stops = number of segments - 1
        stops = max(0, len(route) - 1)

        # Price
        price = float(flight.get("price", 0))

        # Duration in minutes
        duration_mins = flight.get("duration", {}).get("total", 0) // 60

        # Deep link
        deep_link = flight.get("deep_link", "")

        # Return info (round-trip)
        return_departure = ""
        return_arrival = ""
        return_stops = 0
        return_route = flight.get("return_route", [])
        if return_route:
            return_departure = return_route[0].get("local_departure", "")[:16] if return_route[0].get("local_departure") else ""
            return_arrival = return_route[-1].get("local_arrival", "")[:16] if return_route[-1].get("local_arrival") else ""
            return_stops = max(0, len(return_route) - 1)

        result = {
            "type": "round-trip" if return_route else "one-way",
            "source": "kiwi_tequila",
            "airline": airline_str,
            "origin": origin,
            "origin_full": flight.get("cityFrom", origin),
            "destination": destination,
            "destination_full": flight.get("cityTo", destination),
            "departure": departure,
            "arrival": arrival,
            "stops": stops,
            "duration_mins": duration_mins,
            "price": f"{price:.2f}",
            "price_numeric": price,
            "currency": flight.get("currency", "EUR"),
            "search_date": departure[:10] if departure else "",
            "deep_link": deep_link,
        }

        if return_route:
            result["return_departure"] = return_departure
            result["return_arrival"] = return_arrival
            result["return_stops"] = return_stops

        return result

    except Exception as e:
        return {"error": str(e), "raw": str(flight)[:200]}


def main():
    args = parse_args()

    api_key = args.api_key or os.environ.get("TEQUILA_API_KEY", "")
    if not api_key:
        print(json.dumps({
            "error": "No Tequila API key. Set TEQUILA_API_KEY env var or pass --api-key.",
            "setup_url": "https://tequila.kiwi.com/portal/login/register",
            "all_flights_sorted_by_price": [],
        }, ensure_ascii=False))
        sys.exit(1)

    is_round_trip = bool(args.return_from and args.return_to)
    flight_type = "round" if is_round_trip else "oneway"

    params: dict = {
        "fly_from": args.origin,
        "fly_to": args.destination,
        "date_from": to_tequila_date(args.date_from),
        "date_to": to_tequila_date(args.date_to),
        "adults": args.adults,
        "children": args.children,
        "infants": args.infants,
        "flight_type": flight_type,
        "curr": args.currency,
        "limit": args.limit,
        "sort": "price",
        "one_for_city": 0,
        "one_per_date": 0,
        "partner": "picky",
    }

    if is_round_trip:
        params["return_from"] = to_tequila_date(args.return_from)
        params["return_to"] = to_tequila_date(args.return_to)

    if args.max_stops is not None and args.max_stops >= 0:
        params["max_stopovers"] = args.max_stops

    headers = {"apikey": api_key}

    print(f"Searching Tequila: {args.origin} → {args.destination} ({flight_type})", file=sys.stderr)
    print(f"Dates: {args.date_from} to {args.date_to}", file=sys.stderr)
    if is_round_trip:
        print(f"Return: {args.return_from} to {args.return_to}", file=sys.stderr)
    print("---", file=sys.stderr)

    error_msg = None
    flights = []

    try:
        resp = requests.get(BASE_URL, params=params, headers=headers, timeout=20)
        resp.raise_for_status()
        data = resp.json()

        raw_flights = data.get("data", [])
        flights = [flight_to_dict(f) for f in raw_flights]
        flights = [f for f in flights if "error" not in f]
        flights.sort(key=lambda x: x.get("price_numeric", 9999))
        flights = flights[: args.limit]

        if flights:
            cheapest = flights[0].get("price_numeric")
            print(f"Found {len(flights)} flights, cheapest: {cheapest} {args.currency}", file=sys.stderr)
        else:
            print("No flights found.", file=sys.stderr)

    except requests.HTTPError as e:
        error_msg = f"HTTP {e.response.status_code}: {e.response.text[:200]}"
        print(f"Error: {error_msg}", file=sys.stderr)
    except Exception as e:
        error_msg = str(e)
        print(f"Error: {error_msg}", file=sys.stderr)

    output = {
        "source": "kiwi_tequila",
        "query": {
            "origin": args.origin,
            "destination": args.destination,
            "date_from": args.date_from,
            "date_to": args.date_to,
            "trip_type": flight_type,
            "currency": args.currency,
            "adults": args.adults,
            "children": args.children,
            "infants": args.infants,
        },
        "search_summary": {
            "total_flights_found": len(flights),
            "error": error_msg,
        },
        "all_flights_sorted_by_price": flights,
    }

    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
