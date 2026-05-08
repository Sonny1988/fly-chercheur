export type TripClass = 'economy' | 'business' | 'first';
export type TripType = 'one-way' | 'round-trip';
export type SearchMode = 'flights' | 'points' | 'hotel';

export type Feature =
  | 'date-scanner'
  | 'hidden-finder'
  | 'route-optimizer'
  | 'deals-detector'
  | 'fee-breakdown'
  | 'negotiation-email'
  | 'flexibility-analysis'
  | 'hidden-city'
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
  AMS: 'Amsterdam',
  CDG: 'Paris',
  LHR: 'Londres',
  BRU: 'Bruxelles',
  FRA: 'Francfort',
  ZRH: 'Zurich',
  BCN: 'Barcelone',
  MAD: 'Madrid',
  FCO: 'Rome',
  VIE: 'Vienne',
  IST: 'Istanbul',
  DXB: 'Dubaï',
  BKK: 'Bangkok',
  SIN: 'Singapour',
  NRT: 'Tokyo',
  HND: 'Tokyo',
  HKG: 'Hong Kong',
  ICN: 'Séoul',
  JFK: 'New York',
  LAX: 'Los Angeles',
  MIA: 'Miami',
  GRU: 'São Paulo',
  SYD: 'Sydney',
  DPS: 'Bali',
  KUL: 'Kuala Lumpur',
  CMN: 'Casablanca',
  LIS: 'Lisbonne',
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
    id: 'fee-breakdown',
    label: 'Fee Breakdown',
    icon: '💸',
    description: 'Tous les frais cachés',
    color: 'from-red-500/20 to-red-600/20 border-red-500/30',
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
