#!/usr/bin/env python3
"""Search Ryanair flights using ryanair-py. Outputs structured JSON."""

import argparse
import json
import sys
from datetime import datetime, timedelta


def parse_args():
    p = argparse.ArgumentParser(description="Search Ryanair via ryanair-py")
    p.add_argument("--origin", required=True, help="Origin IATA (e.g. EIN, STN, BRU)")
    p.add_argument("--destination", default=None, help="Destination IATA (optional — omit for all routes)")
    p.add_argument("--date-from", required=True, help="Start date YYYY-MM-DD")
    p.add_argument("--date-to", required=True, help="End date YYYY-MM-DD")
    p.add_argument("--return-date-from", default=None, help="Return start date (round-trip)")
    p.add_argument("--return-date-to", default=None, help="Return end date (round-trip)")
    p.add_argument("--max-price", type=int, default=None, help="Max price filter")
    p.add_argument("--currency", default="EUR", help="Currency (default: EUR)")
    p.add_argument("--limit", type=int, default=30, help="Max results (default: 30)")
    return p.parse_args()


def flight_to_dict(f) -> dict:
    """Convert a ryanair-py Flight or Trip object to a plain dict."""
    try:
        # Trip (round-trip) object
        if hasattr(f, "outbound") and hasattr(f, "inbound"):
            ob = f.outbound
            ib = f.inbound
            return {
                "type": "round-trip",
                "airline": "Ryanair",
                "origin": getattr(ob, "origin", "?"),
                "destination": getattr(ob, "destination", "?"),
                "destination_full": getattr(ob, "destinationFull", getattr(ob, "destination", "?")),
                "outbound_departure": str(getattr(ob, "departureTime", "")),
                "inbound_departure": str(getattr(ib, "departureTime", "")),
                "price": str(f.totalPrice),
                "price_numeric": float(f.totalPrice),
                "currency": f.currency,
                "stops": 0,
                "search_date": str(getattr(ob, "departureTime", ""))[:10],
            }
        else:
            # One-way Flight object (ryanair-py 3.x)
            return {
                "type": "one-way",
                "airline": "Ryanair",
                "flight_number": getattr(f, "flightNumber", None),
                "origin": f.origin,
                "origin_full": getattr(f, "originFull", f.origin),
                "destination": f.destination,
                "destination_full": getattr(f, "destinationFull", f.destination),
                "departure": str(f.departureTime),
                "price": str(f.price),
                "price_numeric": float(f.price),
                "currency": f.currency,
                "stops": 0,
                "search_date": f.departureTime.strftime("%Y-%m-%d") if hasattr(f.departureTime, "strftime") else str(f.departureTime)[:10],
            }
    except Exception as e:
        return {"error": str(e), "raw": str(f)}


def main():
    args = parse_args()

    from ryanair import Ryanair

    api = Ryanair(currency=args.currency)

    date_from = datetime.strptime(args.date_from, "%Y-%m-%d")
    date_to = datetime.strptime(args.date_to, "%Y-%m-%d")

    is_round_trip = bool(args.return_date_from and args.return_date_to)

    print(f"Searching Ryanair: {args.origin} → {args.destination or 'ALL'}", file=sys.stderr)
    print(f"Dates: {args.date_from} to {args.date_to}", file=sys.stderr)
    if is_round_trip:
        print(f"Return: {args.return_date_from} to {args.return_date_to}", file=sys.stderr)
    print("---", file=sys.stderr)

    flights_raw = []
    error_msg = None

    try:
        if is_round_trip:
            return_from = datetime.strptime(args.return_date_from, "%Y-%m-%d")
            return_to = datetime.strptime(args.return_date_to, "%Y-%m-%d")
            flights_raw = api.get_cheapest_return_flights(
                source_airport=args.origin,
                date_from=date_from,
                date_to=date_to,
                return_date_from=return_from,
                return_date_to=return_to,
                destination_airport=args.destination,
                max_price=args.max_price,
            )
        else:
            flights_raw = api.get_cheapest_flights(
                airport=args.origin,
                date_from=date_from,
                date_to=date_to,
                destination_airport=args.destination,
                max_price=args.max_price,
            )
    except Exception as e:
        error_msg = str(e)
        print(f"Error: {e}", file=sys.stderr)

    flights = [flight_to_dict(f) for f in (flights_raw or [])]
    flights.sort(key=lambda x: x.get("price_numeric", 9999))
    flights = flights[: args.limit]

    if flights:
        cheapest = flights[0].get("price_numeric")
        print(f"Found {len(flights)} flights, cheapest: {cheapest} {args.currency}", file=sys.stderr)
    else:
        print("No flights found.", file=sys.stderr)

    output = {
        "source": "ryanair",
        "query": {
            "origin": args.origin,
            "destination": args.destination,
            "date_from": args.date_from,
            "date_to": args.date_to,
            "trip_type": "round-trip" if is_round_trip else "one-way",
            "currency": args.currency,
        },
        "search_summary": {
            "total_flights_found": len(flights),
            "error": error_msg,
        },
        "all_flights_sorted_by_price": flights,
    }

    sys.stdout.buffer.write(json.dumps(output, ensure_ascii=False, indent=2).encode("utf-8"))
    sys.stdout.buffer.write(b"\n")


if __name__ == "__main__":
    main()
