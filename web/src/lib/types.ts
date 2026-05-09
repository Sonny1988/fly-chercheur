export type TripClass = 'economy' | 'business' | 'first';
export type TripType = 'one-way' | 'round-trip';
export type SearchMode = 'flights' | 'points' | 'hotel';

export type Feature =
  | 'live-prices'
  | 'hunter'
  | 'hub-arbitrage'
  | 'date-scanner'
  | 'hidden-finder'
  | 'route-optimizer'
  | 'deals-detector'
  | 'negotiation-email'
  | 'flexibility-analysis'
  | 'hidden-city'
  | 'consolidator'
  | 'award-flights'
  | 'points-optimizer'
  | 'transfer-map'
  | 'hotel-finder'
  | 'hotel-points';

export interface SearchParams {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string;
  tripType: TripType;
  class: TripClass;
  adults: number;
  children?: number;
  infantsOnLap?: number;
  maxStops?: number; // -1=any, 0=direct, 1=max 1, 2=max 2
  origins?: string[]; // multi-airport departure
  budget?: number;
}

export interface PointsBalance {
  flyingBlue: number;
  krisflyer: number;
  aeroplan: number;
  avios: number;
  chaseUR: number;
  amexMR: number;
  lifeMiles: number;
}

export interface FlightAlert {
  id: string;
  origin: string;
  destination: string;
  class: TripClass;
  maxPrice: number;
  email: string;
  createdAt: string;
  lastResult?: string;
}

export const AIRPORT_CITIES: Record<string, string> = {
  // ── Pays-Bas ──────────────────────────────────────────────────────────────
  AMS: 'Amsterdam',
  EIN: 'Eindhoven',
  RTM: 'Rotterdam',
  // ── Belgique ──────────────────────────────────────────────────────────────
  BRU: 'Bruxelles',
  CRL: 'Bruxelles Charleroi',
  LGG: 'Liège',
  // ── France ────────────────────────────────────────────────────────────────
  CDG: 'Paris Charles de Gaulle',
  ORY: 'Paris Orly',
  LYS: 'Lyon',
  NCE: 'Nice',
  MRS: 'Marseille',
  BOD: 'Bordeaux',
  TLS: 'Toulouse',
  NTE: 'Nantes',
  BIQ: 'Biarritz',
  // ── Allemagne ─────────────────────────────────────────────────────────────
  FRA: 'Francfort',
  MUC: 'Munich',
  DUS: 'Düsseldorf',
  HAM: 'Hambourg',
  BER: 'Berlin',
  CGN: 'Cologne',
  STR: 'Stuttgart',
  NUE: 'Nuremberg',
  LEJ: 'Leipzig',
  // ── Royaume-Uni ───────────────────────────────────────────────────────────
  LHR: 'Londres Heathrow',
  LGW: 'Londres Gatwick',
  STN: 'Londres Stansted',
  LTN: 'Londres Luton',
  LCY: 'Londres City',
  MAN: 'Manchester',
  BHX: 'Birmingham',
  EDI: 'Édimbourg',
  GLA: 'Glasgow',
  BRS: 'Bristol',
  NCL: 'Newcastle',
  LBA: 'Leeds Bradford',
  BHD: 'Belfast',
  // ── Suisse ────────────────────────────────────────────────────────────────
  ZRH: 'Zurich',
  GVA: 'Genève',
  BSL: 'Bâle',
  // ── Autriche ──────────────────────────────────────────────────────────────
  VIE: 'Vienne',
  // ── Espagne ───────────────────────────────────────────────────────────────
  MAD: 'Madrid',
  BCN: 'Barcelone',
  AGP: 'Malaga',
  VLC: 'Valence',
  SVQ: 'Séville',
  ALC: 'Alicante',
  PMI: 'Palma de Majorque',
  IBZ: 'Ibiza',
  TFS: 'Tenerife Sud',
  TFN: 'Tenerife Nord',
  LPA: 'Gran Canaria',
  ACE: 'Lanzarote',
  FUE: 'Fuerteventura',
  BIO: 'Bilbao',
  SDR: 'Santander',
  GRX: 'Grenade',
  // ── Portugal ──────────────────────────────────────────────────────────────
  LIS: 'Lisbonne',
  OPO: 'Porto',
  FAO: 'Faro',
  FNC: 'Madère',
  // ── Italie ────────────────────────────────────────────────────────────────
  FCO: 'Rome Fiumicino',
  CIA: 'Rome Ciampino',
  MXP: 'Milan Malpensa',
  LIN: 'Milan Linate',
  BGY: 'Milan Bergame',
  VCE: 'Venise Marco Polo',
  TSF: 'Venise Trévise',
  NAP: 'Naples',
  CAT: 'Catane',
  PMO: 'Palerme',
  BLQ: 'Bologne',
  BRI: 'Bari',
  TRS: 'Trieste',
  // ── Grèce ─────────────────────────────────────────────────────────────────
  ATH: 'Athènes',
  HER: 'Héraklion',
  RHO: 'Rhodes',
  SKG: 'Thessalonique',
  CFU: 'Corfou',
  CHQ: 'La Canée',
  KGS: 'Kos',
  ZTH: 'Zakynthos',
  JMK: 'Mykonos',
  JTR: 'Santorin',
  // ── Croatie ───────────────────────────────────────────────────────────────
  ZAG: 'Zagreb',
  SPU: 'Split',
  DBV: 'Dubrovnik',
  ZAD: 'Zadar',
  // ── Turquie ───────────────────────────────────────────────────────────────
  IST: 'Istanbul',
  SAW: 'Istanbul Sabiha',
  AYT: 'Antalya',
  ADB: 'Izmir',
  DLM: 'Dalaman',
  BJV: 'Bodrum',
  // ── Scandinavie ───────────────────────────────────────────────────────────
  CPH: 'Copenhague',
  ARN: 'Stockholm',
  GOT: 'Göteborg',
  OSL: 'Oslo',
  HEL: 'Helsinki',
  // ── Pologne ───────────────────────────────────────────────────────────────
  WAW: 'Varsovie',
  KRK: 'Cracovie',
  WRO: 'Wrocław',
  GDN: 'Gdańsk',
  KTW: 'Katowice',
  // ── Europe de l'Est ───────────────────────────────────────────────────────
  PRG: 'Prague',
  BUD: 'Budapest',
  OTP: 'Bucarest',
  CLJ: 'Cluj-Napoca',
  SOF: 'Sofia',
  VAR: 'Varna',
  BOJ: 'Burgas',
  BEG: 'Belgrade',
  RIX: 'Riga',
  VNO: 'Vilnius',
  TLL: 'Tallinn',
  KBP: 'Kiev',
  // ── Irlande ───────────────────────────────────────────────────────────────
  DUB: 'Dublin',
  // ── Maroc ─────────────────────────────────────────────────────────────────
  CMN: 'Casablanca',
  RAK: 'Marrakech',
  AGA: 'Agadir',
  TNG: 'Tanger',
  // ── Moyen-Orient ──────────────────────────────────────────────────────────
  DXB: 'Dubaï',
  AUH: 'Abu Dhabi',
  DOH: 'Doha',
  AMM: 'Amman',
  KWI: 'Koweït',
  // ── Asie ──────────────────────────────────────────────────────────────────
  BKK: 'Bangkok Suvarnabhumi',
  DMK: 'Bangkok Don Mueang',
  SIN: 'Singapour',
  KUL: 'Kuala Lumpur',
  CGK: 'Jakarta',
  DPS: 'Bali',
  NRT: 'Tokyo Narita',
  HND: 'Tokyo Haneda',
  UKB: 'Kobe',
  HKG: 'Hong Kong',
  ICN: 'Séoul',
  PEK: 'Pékin',
  PVG: 'Shanghai',
  DEL: 'New Delhi',
  BOM: 'Mumbai',
  CMB: 'Colombo',
  // ── Amériques ─────────────────────────────────────────────────────────────
  JFK: 'New York JFK',
  EWR: 'New York Newark',
  LAX: 'Los Angeles',
  MIA: 'Miami',
  ORD: 'Chicago',
  YUL: 'Montréal',
  YYZ: 'Toronto',
  GRU: 'São Paulo',
  // ── Océanie ───────────────────────────────────────────────────────────────
  SYD: 'Sydney',
  MEL: 'Melbourne',
};

const FLIGHT_FEATURES: {
  id: Feature;
  label: string;
  icon: string;
  description: string;
  color: string;
  mode: SearchMode;
}[] = [
  {
    id: 'live-prices',
    label: 'Prix Live 🔴',
    icon: '🔴',
    description: 'Vrais prix Google Flights en temps réel',
    color: 'from-red-500/20 to-red-600/20 border-red-500/30',
    mode: 'flights',
  },
  {
    id: 'hunter',
    label: '🎯 Hunter',
    icon: '🎯',
    description: 'Chasse exhaustive : tous aéroports × dates × escales',
    color: 'from-orange-500/20 to-red-600/20 border-orange-500/30',
    mode: 'flights',
  },
  {
    id: 'hub-arbitrage',
    label: '✈️ Hub Arbitrage',
    icon: '✈️',
    description: 'Positionnement + Business depuis hubs IST/DOH/DXB — -60% vs direct',
    color: 'from-emerald-500/20 to-teal-600/20 border-emerald-500/30',
    mode: 'flights',
  },
  {
    id: 'date-scanner',
    label: 'Date Scanner',
    icon: '📅',
    description: 'Dates les + économiques ±7j',
    color: 'from-blue-500/20 to-blue-600/20 border-blue-500/30',
    mode: 'flights',
  },
  {
    id: 'hidden-finder',
    label: 'Hidden Finder',
    icon: '🔍',
    description: 'Toutes compagnies + LCC',
    color: 'from-purple-500/20 to-purple-600/20 border-purple-500/30',
    mode: 'flights',
  },
  {
    id: 'route-optimizer',
    label: 'Route Optimizer',
    icon: '🗺️',
    description: 'Routes alternatives moins chères',
    color: 'from-green-500/20 to-green-600/20 border-green-500/30',
    mode: 'flights',
  },
  {
    id: 'deals-detector',
    label: 'Deals Detector',
    icon: '💰',
    description: 'Promos actives vérifiées',
    color: 'from-yellow-500/20 to-yellow-600/20 border-yellow-500/30',
    mode: 'flights',
  },
  {
    id: 'negotiation-email',
    label: 'Négociation',
    icon: '📧',
    description: 'Email price match persuasif',
    color: 'from-orange-500/20 to-orange-600/20 border-orange-500/30',
    mode: 'flights',
  },
  {
    id: 'flexibility-analysis',
    label: 'Flexibilité',
    icon: '🔄',
    description: 'Annulation & risques financiers',
    color: 'from-teal-500/20 to-teal-600/20 border-teal-500/30',
    mode: 'flights',
  },
  {
    id: 'hidden-city',
    label: 'Hidden City',
    icon: '🏙️',
    description: 'Skiplagging — économies vs risques',
    color: 'from-pink-500/20 to-pink-600/20 border-pink-500/30',
    mode: 'flights',
  },
  {
    id: 'consolidator',
    label: 'Business Discount',
    icon: '💼',
    description: 'Tarifs consolidateurs Business & 1ère classe',
    color: 'from-indigo-500/20 to-indigo-600/20 border-indigo-500/30',
    mode: 'flights',
  },
  // Points & Miles
  {
    id: 'award-flights',
    label: 'Award Flights',
    icon: '🏆',
    description: 'Vols en Business via miles',
    color: 'from-amber-500/20 to-amber-600/20 border-amber-500/30',
    mode: 'points',
  },
  {
    id: 'points-optimizer',
    label: 'Points Optimizer',
    icon: '⚡',
    description: 'Meilleure valeur de tes points',
    color: 'from-violet-500/20 to-violet-600/20 border-violet-500/30',
    mode: 'points',
  },
  {
    id: 'transfer-map',
    label: 'Transfer Map',
    icon: '🔀',
    description: 'Partenaires transfert + bonus actifs',
    color: 'from-cyan-500/20 to-cyan-600/20 border-cyan-500/30',
    mode: 'points',
  },
  // Hotels
  {
    id: 'hotel-finder',
    label: 'Hotel Finder',
    icon: '🏨',
    description: 'Meilleurs hôtels + prix cash',
    color: 'from-emerald-500/20 to-emerald-600/20 border-emerald-500/30',
    mode: 'hotel',
  },
  {
    id: 'hotel-points',
    label: 'Hotel Points',
    icon: '🌟',
    description: 'Cash vs points par programme',
    color: 'from-rose-500/20 to-rose-600/20 border-rose-500/30',
    mode: 'hotel',
  },
];

export const FEATURES = FLIGHT_FEATURES;
export const FEATURES_BY_MODE = (mode: SearchMode) =>
  FLIGHT_FEATURES.filter((f) => f.mode === mode);
