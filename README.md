# A Samurai's Tale

A cinematic 2D pixel-art samurai action-platformer featuring procedurally planned isolated arenas, multi-phase minibosses, deflect/parry mechanics, and 24 FPS silent-filmesque cutscenes.

---

## Controls

| Action | Primary Key | Alternate Key |
|---|---|---|
| **Move** | `A` / `D` | `←` / `→` |
| **Jump / Double Jump** | `Space` / `W` | `↑` (Hold `S` + `Space` to drop through platforms) |
| **Attack** | `J` | `X` |
| **Dash-Slash** | `K` | `Shift` / `C` |
| **Parry** | `L` | `Z` (Stuns foes and empowers the next hit for 1.1x damage) |
| **Retry Current Seed** | `R` | — |
| **New Run** | `N` | — |
| **Mute / Unmute Audio** | `M` | — |

---

## Features

- **Your Journey:** Journey through isolated themed rooms including Bamboo Groves with restorative Hot Springs, mist-veiled Waterfall Caves, Head Butcher's Kitchen, Temple Sanctuaries, and the Moonlit Autumn Precipice.
- **Dynamic Miniboss Encounters:**
  - *High Priest Genkai:* Phase I martial fists transition to spiritual blasts and airborne kicks.
  - *Master Retainer Kenshin:* Single katana mastery awakening into dual-wielding strikes.
  - *Head Butcher Goro:* Heavy cleaver slams and parriable flying butcher knives.
  - *Clan Head Takeda:* Heavy Kanabo mace, Odachi greatsword, and an enraged invulnerable Phase III charge where he must be lured off the cliff.
- **Cinematic Cutscenes:** Authentic 24 FPS classic Japanese cinema aesthetic complete with sepia grain, vignette, letterboxing, and dramatic narrative beats.
- **Secrets & Consequences:** Discover hidden interactions with lasting consequences in the final confrontation.

---

## Development & Building

### Requirements
- [Node.js](https://nodejs.org/) (v18+)
- [npm](https://www.npmjs.com/)

### Quick Start
```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Production Build
```bash
# Typecheck and bundle static assets into dist/
npm run build

# Preview production build locally
npm run preview
```
