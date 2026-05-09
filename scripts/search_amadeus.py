#!/usr/bin/env python3
"""Search flights via Amadeus Flight Offers API v2. Outputs structured JSON."""

import argparse
import json
import os
import sys
from datetime import datetime

_vendor = os.path.join(os.path.dirname(__file__), 'vendor')
if os.path.isdir(_vendor):
    sys.path.insert(0, _vendor)

import requests


TOKEN_URL = "https://test.api.amadeus.com/v1/security/oauth2/token"
SEARCH_URL = "https://test.api.amadeus.com/v2/shopping/flight-offers"


def parse_args():
    p = argparse.ArgumentParser(description="Search flights via Amadeus API")
    p.add_argument("--origin", required=True, help="Origin IATA code (e.g. AMS)")
    p.add_argument("--destination", required=True, help="Destination IATA code (e.g. BKK)")
    p.add_argument("--date", required=True, help="Departure date YYYY-MM-DD")
    p.add_argument("--return-date", default=None, help="Return date YYYY-MM-DD (round-trip)")
    p.add_argument("--adults", type=int, default=1)
    p.add_argument("--children", type=int, default=0)
    p.add_argument("--infants", type=int, default=0)
    p.add_argument("--max-stops", type=int, default=None, help="Max stops (0=nonstop only)")
    p.add_argument("--cabin", default="ECONOMY",
                   choices=["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"])
    p.add_argument("--currency", default="EUR")
    p.add_argument("--limit", type=int, default=20)
    p.add_argument("--client-id", default=None,
                   help="Amadeus client ID (or set AMADEUS_CLIENT_ID env var)")
    p.add_argument("--client-secret", default=None,
                   help="Amadeus client secret (or set AMADEUS_CLIENT_SECRET env var)")
    return p.parse_args()


def get_token(client_id: str, client_secret: str) -> str:
    resp = requests.post(
        TOKEN_URL,
        data={
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
        },
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def cabin_map(seat: str) -> str:
    return {
        "economy": "ECONOMY",
        "business": "BUSINESS",
        "first": "FIRST",
        "ECONOMY": "ECONOMY",
        "BUSINESS": "BUSINESS",
        "FIRST": "FIRST",
        "PREMIUM_ECONOMY": "PREMIUM_ECONOMY",
    }.get(seat, "ECONOMY")


def duration_to_mins(iso: str) -> int:
    """PT12H30M → 750 minutes."""
    try:
        import re
        h = int(re.search(r"(\d+)H", iso).group(1)) if "H" in iso else 0
        m = int(re.search(r"(\d+)M", iso).group(1)) if "M" in iso else 0
        return h * 60 + m
    except Exception:
        return 0


def offer_to_dict(offer: dict, currency: str) -> dict:
    try:
        itineraries = offer.get("itineraries", [])
        outbound = itineraries[0] if itineraries else {}
        inbound = itineraries[1] if len(itineraries) > 1 else None

        out_segs = outbound.get("segments", [])
        origin = out_segs[0]["departure"]["iataCode"] if out_segs else "?"
        destination = out_segs[-1]["arrival"]["iataCode"] if out_segs else "?"
        departure = out_segs[0]["departure"].get("at", "")[:16] if out_segs else ""
        arrival = out_segs[-1]["arrival"].get("at", "")[:16] if out_segs else ""
        stops = max(0, len(out_segs) - 1)
        duration_mins = duration_to_mins(outbound.get("duration", ""))

        carriers = list({seg["carrierCode"] for seg in out_segs if "carrierCode" in seg})
        airline = " + ".join(carriers)

        price_info = offer.get("price", {})
        price = float(price_info.get("grandTotal", price_info.get("total", 0)))

        result: dict = {
            "type": "round-trip" if inbound else "one-way",
            "source": "amadeus",
            "airline": airline,
            "origin": origin,
            "destination": destination,
            "departure": departure,
            "arrival": arrival,
            "stops": stops,
            "duration_mins": duration_mins,
            "price": f"{price:.2f}",
            "price_numeric": price,
            "currency": currency,
            "search_date": departure[:10] if departure else "",
            "seats_available": offer.get("numberOfBookableSeats"),
            "offer_id": offer.get("id", ""),
        }

        if inbound:
            in_segs = inbound.get("segments", [])
            result["return_departure"] = in_segs[0]["departure"].get("at", "")[:16] if in_segs else ""
            result["return_arrival"] = in_segs[-1]["arrival"].get("at", "")[:16] if in_segs else ""
            result["return_stops"] = max(0, len(in_segs) - 1)
            result["return_duration_mins"] = duration_to_mins(inbound.get("duration", ""))

        return result

    except Exception as e:
        return {"error": str(e)}


def main():
    args = parse_args()

    client_id = args.client_id or os.environ.get("AMADEUS_CLIENT_ID", "")
    client_secret = args.client_secret or os.environ.get("AMADEUS_CLIENT_SECRET", "")

    if not client_id or not client_secret:
        print(json.dumps({
            "error": "No Amadeus credentials. Set AMADEUS_CLIENT_ID + AMADEUS_CLIENT_SECRET env vars.",
            "setup_url": "https://developers.amadeus.com/register",
            "all_flights_sorted_by_price": [],
        }, ensure_ascii=False))
        sys.exit(1)

    print(f"Searching Amadeus: {args.origin} → {args.destination}", file=sys.stderr)
    print(f"Date: {args.date}{' → ' + args.return_date if args.return_date else ''}", file=sys.stderr)
    print("---", file=sys.stderr)

    error_msg = None
    flights = []

    try:
        token = get_token(client_id, client_secret)

        params: dict = {
            "originLocationCode": args.origin,
            "destinationLocationCode": args.destination,
            "departureDate": args.date,
            "adults": args.adults,
            "currencyCode": args.currency,
            "max": min(args.limit, 50),
        }

        if args.return_date:
            params["returnDate"] = args.return_date
        if args.children:
            params["children"] = args.children
        if args.infants:
            params["infants"] = args.infants
        if args.max_stops is not None and args.max_stops >= 0:
            params["nonStop"] = "true" if args.max_stops == 0 else "false"
            if args.max_stops > 0:
                params["maxNumberOfConnections"] = args.max_stops
        if args.cabin:
            params["travelClass"] = cabin_map(args.cabin)

        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(SEARCH_URL, params=params, headers=headers, timeout=20)
        resp.raise_for_status()
        data = resp.json()

        raw_offers = data.get("data", [])
        flights = [offer_to_dict(o, args.currency) for o in raw_offers]
        flights = [f for f in flights if "error" not in f]
        flights.sort(key=lambda x: x.get("price_numeric", 9999))
        flights = flights[: args.limit]

        if flights:
            print(f"Found {len(flights)} offers, cheapest: {flights[0]['price_numeric']} {args.currency}",
                  file=sys.stderr)
        else:
            print("No offers found.", file=sys.stderr)

    except requests.HTTPError as e:
        error_msg = f"HTTP {e.response.status_code}: {e.response.text[:300]}"
        print(f"Error: {error_msg}", file=sys.stderr)
    except Exception as e:
        error_msg = str(e)
        print(f"Error: {error_msg}", file=sys.stderr)

    output = {
        "source": "amadeus",
        "query": {
            "origin": args.origin,
            "destination": args.destination,
            "date": args.date,
            "return_date": args.return_date,
            "adults": args.adults,
            "children": args.children,
            "infants": args.infants,
            "currency": args.currency,
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
