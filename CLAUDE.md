# CLAUDE.md — Recherche de billets d'avion pas chers

## Contexte & objectif

Projet de recherche automatisée de billets d'avion via Google Flights (`fast-flights`).
**Objectif principal : trouver les vols les moins chers sur une période flexible.**

Utilisateur basé en Europe (Amsterdam, AMS). Devise par défaut : **EUR**.
Langue des rapports : **français**.

**Mémoire persistante des prix :** `C:/Users/Ubert/openclaw-workspace/PRIX-VOLS.md` (vault Obsidian).
Après chaque recherche réussie, logger les résultats dans ce fichier.

---

## Règle absolue — Firecrawl obligatoire

**Avant de donner n'importe quelle réponse sur des prix de vols, des compagnies, des bagages ou des conditions tarifaires : toujours scraper le web avec Firecrawl.**

Les prix d'avion changent toutes les heures. Les données d'entraînement du modèle sont obsolètes. Une réponse sans scraping en temps réel = une réponse inexacte.

### Sources à scraper — par besoin

| Besoin | Sources prioritaires (scraper dans cet ordre) |
|--------|-----------------------------------------------|
| Prix actuels sur une route | Google Flights, Skyscanner, Kayak |
| **Deals flash / erreurs tarifaires** | **Secret Flying, Scott's Cheap Flights, Airfarewatchdog** |
| **Promos compagnies en cours** | **Site officiel compagnie + `firecrawl-search "airline name sale {mois}"` ** |
| Politique bagages | Site officiel de la compagnie |
| Tarifs business / première | Site officiel + comparateur |
| **Tactiques booking actuelles** | **FlyerTalk forums, The Points Guy, View from the Wing** |
| **Aéroports alternatifs prix** | Google Flights multi-airport, Skyscanner "nearby airports" |

### Comment utiliser Firecrawl ici

```
/firecrawl-search "cheap flights AMS to BKK September 2026"
/firecrawl-search "secret flying error fare Europe Asia 2026"
/firecrawl-search "scott's cheap flights Amsterdam deals"
/firecrawl-scrape https://www.secretflying.com/posts/
/firecrawl-search "flyertalk booking tricks reduce airfare 2026"
/firecrawl-search "KLM baggage policy economy 2026"
```

- Utiliser `firecrawl-search` pour trouver les meilleures sources actuelles
- Utiliser `firecrawl-scrape` pour extraire le contenu d'une page précise
- Croiser **au minimum 2 sources** avant de donner un prix
- Toujours indiquer la source et l'heure de scraping dans le rapport

### Si Firecrawl échoue ou retourne une page vide

Essayer dans l'ordre :
1. `firecrawl-search` avec une requête différente
2. Scraper Skyscanner ou Kayak à la place de Google Flights
3. En dernier recours : lancer `scripts/search_flights.py` + signaler que le scraping web a échoué

**Ne jamais donner un prix de tête ou "environ X€" sans source scrapée.**

---

## Scripts disponibles

| Script | Rôle |
|--------|------|
| `scripts/search_flights.py` | Scrape Google Flights, retourne JSON trié par prix |
| `scripts/combine_flights.py` | Combine aller + retour pour trouver les meilleures combinaisons |
| `scripts/monitor_prices.py` | Surveille une route et envoie une alerte email si prix < seuil |
| `scripts/multi_airport.py` | Compare les prix depuis tous les aéroports dans un rayon donné |

Skill complet : `SKILL.md` (logique détaillée, gestion des erreurs, format rapport)

---

## Workflow standard

### Étape 0 — Recherche tactiques (optionnel, activer si budget serré ou route chère)

Avant la recherche de prix, scraper les forums/blogs pour des astuces actuellement valides :

```
/firecrawl-search "cheapest way to fly {ORIGIN} to {DEST} 2026 tips"
/firecrawl-search "flyertalk {ORIGIN} {DEST} positioning flight trick"
/firecrawl-search "hidden city ticketing {DEST} 2026"
/firecrawl-search "{compagnie} stopover program free layover"
```

Documenter les 3 meilleures astuces trouvées → les inclure dans la section "Hacks détectés" du rapport.

### Étape 1 — Parser la demande

Extraire :
- **Origine / Destination** → codes IATA (voir section aéroports ci-dessous)
- **Plage de dates** (aller et retour si applicable)
- **Type de voyage** : `one-way` | `round-trip` | `flexible-roundtrip`
  - Si l'utilisateur dit "environ X jours" / "entre X et Y jours" → `flexible-roundtrip`
  - Si retour fixe → `round-trip` avec `--return-offset`
- **Direct/escale** : `--nonstop` si demandé
- **Classe** : economy (défaut), business, first
- **Nombre de passagers** : adultes (défaut: 1)
- **Budget max** : si mentionné → activer la comparaison multi-aéroports automatiquement

Si destination ou dates manquantes → demander avant de lancer.

### Étape 1b — Comparaison multi-aéroports (activer si budget < 600€ ou si l'utilisateur le demande)

Pour Amsterdam, vérifier aussi : **EIN** (Eindhoven), **RTM** (Rotterdam), **BRU** (Bruxelles), **LGW/STN** (Londres low-cost).

```bash
# Lancer en parallèle pour chaque aéroport alternatif pertinent
python scripts/search_flights.py --origin EIN --destination {DEST} ...
python scripts/search_flights.py --origin RTM --destination {DEST} ...
python scripts/search_flights.py --origin BRU --destination {DEST} ...
```

Ajouter le coût de trajet estimé vers l'aéroport alternatif :
- EIN : ~25€ train/bus + 45 min
- RTM : ~15€ train + 60 min
- BRU : ~30-35€ Thalys + 2h
- LGW/STN : ~100€ ferry+bus ou ~150€ avion → seulement si économie > 200€

Comparer **prix vol + trajet** pour chaque option. Signaler si un aéroport alternatif bat AMS de plus de 80€.

### Étape 2 — Lancer la recherche principale

**Vol simple ou aller-retour fixe :**
```bash
python scripts/search_flights.py \
  --origin AMS --destination BKK \
  --start-date 2026-09-01 --end-date 2026-09-30 \
  --trip-type one-way \
  --seat economy --adults 1 \
  --currency EUR \
  --sample-mode 2 \
  --delay 3 \
  --output /tmp/flights_out.json
```

**Aller-retour flexible (meilleur pour trouver le moins cher) :**
```bash
# Lancer les deux en parallèle (run_in_background pour l'un)
python scripts/search_flights.py \
  --origin AMS --destination BKK \
  --start-date 2026-09-01 --end-date 2026-09-30 \
  --trip-type one-way --sample-mode 1 --delay 3 \
  --currency EUR --output /tmp/out.json

python scripts/search_flights.py \
  --origin BKK --destination AMS \
  --start-date 2026-09-08 --end-date 2026-11-27 \
  --trip-type one-way --sample-mode 2 --delay 3 \
  --currency EUR --output /tmp/ret.json

# Puis combiner
python scripts/combine_flights.py \
  --outbound-json /tmp/out.json \
  --return-json /tmp/ret.json \
  --min-days 7 --max-days 90 \
  --filter-complete \
  --baggage-cost 0 \
  --output /tmp/combos.json
```

**Règles `--sample-mode` :**
- Plage < 14 jours → `--sample-mode 1` (tous les jours)
- Plage 14–60 jours → `--sample-mode 2` ou `3`
- Plage > 3 mois → `--sample-mode 7` (un jour sur 7)
- Flexible-roundtrip → **toujours `--sample-mode 1`** sur les deux passes

### Étape 3 — Gérer les erreurs de consent Google

**Problème connu** : Google affiche parfois un écran de consentement GDPR qui bloque le scraping. Symptôme : toutes les dates retournent une erreur "consent" ou similaire.

**Stratégie de récupération (dans l'ordre) :**
1. Réessayer avec `--delay 5` (ralentir les requêtes)
2. Réessayer avec `--sample-mode 7` (moins de requêtes)
3. Retirer `--nonstop` si c'était activé
4. Si toujours bloqué → passer en Firecrawl sur Skyscanner + fournir liens manuels

### Étape 4 — Analyser et produire le rapport

Lire le JSON de résultat et produire un rapport **en français** complet (voir format ci-dessous).

---

## Stratégies avancées pour trouver le moins cher

### Dates flexibles
Toujours proposer une analyse sur ±3 jours autour du meilleur prix trouvé.

### Compagnies low-cost sur les grandes routes
- AMS→Europe : easyJet, Transavia, Ryanair, Vueling
- AMS→Asie : Thai Airways (TG), KLM (KL), Singapore Airlines (SQ), Cathay (CX)
- AMS→USA : KLM (KL), Delta (DL), United (UA), Norwegian (DY)
- AMS→Afrique/Moyen-Orient : Royal Air Maroc (AT), Emirates (EK), Turkish (TK)

**Jours les moins chers (général) :** Mardi, mercredi, samedi pour les long-courriers.

**Bagages low-cost :** Si compagnie low-cost détectée, ajouter ~40€ aller-retour pour un bagage en soute (adapter `--baggage-cost 40`).

### Programmes stopover gratuits (escale longue = mini-voyage bonus)
Scraper ces programmes avant de conclure sur une route :

| Compagnie | Programme | Destinations | Durée max |
|-----------|-----------|--------------|-----------|
| Icelandair | Stopover Iceland | Reykjavik | 7 nuits gratuit |
| Turkish Airlines | Stopover Istanbul | Istanbul | 3 nuits + hôtel |
| Singapore Airlines | Stopover Singapore | Singapore | plusieurs nuits |
| Emirates | Dubai Stopover | Dubai | flexible |
| Qatar Airways | Doha Stopover | Doha | flexible |
| Finnair | Helsinki Stopover | Helsinki | flexible |

→ Si la route passe par un hub stopover, **toujours mentionner l'option stopover dans le rapport**.
→ Scraper le programme actuel : `/firecrawl-search "{compagnie} stopover program 2026 free hotel"`

### Hidden-city ticketing (usage avancé — signaler les risques)
Si le prix AMS→DEST direct est très élevé, vérifier si AMS→DEST→ville_beyond est moins cher :
- Outil : `https://skiplagged.com/` → scraper avec Firecrawl
- **Toujours signaler le risque** : bagages en soute impossibles, compte fidélité peut être suspendu
- Ne recommander que pour les billets sans bagage en soute + voyageurs informés

### Alertes prix — outils gratuits à recommander
Si l'utilisateur veut surveiller un prix avant de réserver :
1. **Google Flights** : activer l'alerte prix sur la page de résultats (bouton "Suivre les prix")
2. **Skyscanner** : "Recevoir des alertes" sur la route
3. **Kayak** : "Prix Alert"
4. **Script local** : voir `scripts/monitor_prices.py` (vérifie toutes les 6h, email si < seuil)

---

## Codes IATA — Aéroports européens (priorité)

| Ville | Code | Note |
|-------|------|------|
| Amsterdam | AMS | Hub principal |
| **Eindhoven** | **EIN** | **Low-cost, 90 min d'AMS** |
| **Rotterdam** | **RTM** | **Low-cost, 70 min d'AMS** |
| Paris CDG | CDG | |
| Paris Orly | ORY | |
| Bruxelles | BRU | 2h d'AMS, souvent moins cher |
| Londres Heathrow | LHR | |
| Londres Gatwick | LGW | Low-cost |
| Londres Stansted | STN | Low-cost (Ryanair hub) |
| Francfort | FRA | |
| Munich | MUC | |
| Zurich | ZRH | |
| Barcelone | BCN | |
| Madrid | MAD | |
| Rome Fiumicino | FCO | |
| Lisbonne | LIS | |
| Vienne | VIE | |
| Genève | GVA | |
| Dublin | DUB | |
| Istanbul | IST | |
| Antalya | AYT | |

Pour les codes Asie, Afrique et Amériques → voir `references/airport-codes.md`.

**Ambiguïtés courantes :**
- "Paris" → CDG (défaut), préciser si Orly voulu
- "Londres" → LHR (défaut), LGW/STN pour low-cost
- "Bangkok" → BKK (Suvarnabhumi), DMK pour low-cost thaï
- "Tokyo" → NRT (défaut), HND pour vols domestiques/courts

---

## Format du rapport (français)

```
## ✈️ {Origine} → {Destination} — Comparatif billets

**Paramètres de recherche**
- Route : {Ville départ} ({IATA}) → {Ville arrivée} ({IATA})
- Période : {date début} au {date fin}
- Type : {Aller simple / Aller-retour / Aller-retour flexible}
- Classe : Économique / Affaires
- Direct uniquement : Oui / Non
- Sources scrapées : {liste sources + heure}
- Recherche effectuée le : {date heure}

---

### 💰 Top 10 — Vols les moins chers

| # | Date | Compagnie | Départ | Arrivée | Durée | Escales | Prix | Lien |
|---|------|-----------|--------|---------|-------|---------|------|------|
| 1 | ... | ... | ... | ... | ... | Direct | ... | [Réserver](...) |

---

### 📅 Heatmap calendrier — Prix par jour

```
         Lun  Mar  Mer  Jeu  Ven  Sam  Dim
Sem 1    ---  350€ 320€ ---  410€ 295€ ---
Sem 2    380€ 299€ 305€ ---  420€ 310€ ---
Sem 3    ---  285€ 290€ ---  395€ 280€ ---
         [💚 < 320€]  [🟡 320-400€]  [🔴 > 400€]
```

---

### 📅 Récapitulatif mensuel

| Mois | Prix min | Prix max | Meilleur jour | Fenêtre optimale |
|------|----------|----------|---------------|-----------------|

---

### 🏢 Comparaison multi-aéroports

| Aéroport départ | Prix vol | Coût trajet | **Total** | Économie vs AMS |
|-----------------|----------|-------------|-----------|-----------------|
| AMS (Amsterdam) | ...€ | 0€ | ...€ | référence |
| EIN (Eindhoven) | ...€ | 25€ | ...€ | +/- X€ |
| BRU (Bruxelles) | ...€ | 33€ | ...€ | +/- X€ |

---

### 🛑 Hacks détectés (recherche web en temps réel)

1. **{Hack 1}** — Source : {url} — Économie estimée : {X€}
2. **{Hack 2}** — Source : {url}
3. **{Hack 3}** — Source : {url}

> ⚠️ Vérifier chaque hack avant application — les conditions changent.

---

### 🗺️ Option stopover détectée

Si applicable : "{compagnie} propose un stopover gratuit à {ville} sur cette route.
Programme : {nom programme} — jusqu'à {X} nuits incluses.
Lien : {url programme}"

---

### 💡 Recommandation

- **Meilleur deal absolu** : {date}, {compagnie}, {prix total avec bagages}
- **Meilleur rapport qualité/flexibilité** : {option}
- **Jour le moins cher** : {jour}
- **Conseil réservation** : {texte — anticiper X semaines, éviter Y période}
- **Alerte prix suggérée** : [Activer sur Google Flights]({url}) — seuil recommandé {X€}

---

### 🔗 Liens de réservation directe

- [Google Flights](...) — {prix trouvé}€
- [Skyscanner](...) 
- [Kayak](...)
- [Site compagnie](...) — vérifier promo directe
- [Skiplagged](...) — si hidden-city applicable (⚠️ sans bagage soute)
```

Pour les **aller-retour flexibles**, ajouter :
- Section "Meilleures combinaisons par durée de séjour"
- Section "Recommandation par jours de congé disponibles"
- Heatmap 2D : aller (x) × retour (y) avec prix combiné en cellule

---

## Script de monitoring des prix

Si l'utilisateur veut être alerté quand un prix descend sous un seuil, générer ce script :

```python
# scripts/monitor_prices.py
# Usage : python monitor_prices.py --origin AMS --dest BKK --threshold 450 --email user@email.com
import schedule, time, smtplib, json, subprocess
from datetime import datetime

def check_price(origin, dest, threshold, email):
    result = subprocess.run(
        ["python", "scripts/search_flights.py",
         "--origin", origin, "--destination", dest,
         "--start-date", "...", "--end-date", "...",
         "--sample-mode", "3", "--output", "/tmp/monitor_check.json"],
        capture_output=True
    )
    with open("/tmp/monitor_check.json") as f:
        flights = json.load(f)
    best = min(flights, key=lambda x: x.get("price", 9999))
    if best["price"] < threshold:
        send_alert(email, origin, dest, best)
        # Logger dans PRIX-VOLS.md
        log_to_obsidian(origin, dest, best)

def send_alert(email, origin, dest, flight):
    # Configurer SMTP (Gmail ou autre) ici
    pass

schedule.every(6).hours.do(check_price, ...)
while True:
    schedule.run_pending()
    time.sleep(60)
```

→ Adapter les dates et SMTP selon la demande de l'utilisateur.
→ Résultats toujours loggés dans `C:/Users/Ubert/openclaw-workspace/PRIX-VOLS.md`.

---

## Liens de secours (si scraping bloqué)

Si `fast-flights` échoue complètement, fournir ces liens manuels construits dynamiquement :

- Google Flights : `https://www.google.com/travel/flights?q=flights+from+{ORIGIN}+to+{DEST}&curr=EUR`
- Skyscanner : `https://www.skyscanner.net/transport/flights/{origin_lower}/{dest_lower}/`
- Kayak : `https://www.kayak.fr/flights/{ORIGIN}-{DEST}`
- Secret Flying : `https://www.secretflying.com/posts/`
- Scott's Cheap Flights : `https://app.going.com/`
- Matrix ITA (pro) : `https://matrix.itasoftware.com/`
- Skiplagged : `https://skiplagged.com/{origin_lower}/{dest_lower}/`

---

## Règles importantes

- **Devise** : EUR par défaut (jamais TWD sauf si explicitement demandé)
- **Langue** : rapports toujours en français
- **Bagages low-cost** : signaler si compagnie low-cost et estimer le coût bagage séparément
- **Données incomplètes** : filtrer les vols sans compagnie/heure (`--filter-complete`)
- **Ne jamais inventer de prix** : si le scraping échoue, le dire clairement et fournir les liens manuels
- **Prévenir sur la fraîcheur** : les prix varient toutes les heures — préciser l'heure de la recherche
- **Multi-aéroports** : toujours vérifier EIN/RTM/BRU si budget < 600€ ou si différence potentielle > 80€
- **Stopover** : mentionner systématiquement si la route passe par un hub avec programme stopover
- **Hacks forum** : sourcer chaque astuce avec l'URL réelle — ne jamais inventer une tactique

---

## Installation rapide

```bash
pip install fast-flights schedule
```

Le skill est installé dans `~/.claude/skills/flight-report/`.
