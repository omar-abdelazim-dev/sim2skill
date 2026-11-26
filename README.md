# Sim2Skill (React)

Home: a bright, sans-serif design (Geist) with a hero, quick stats and three accessible experiment cards. Nour, the lab instructor, is a pop-up chat in the bottom-right corner of every page outside the labs (the labs have their own Nour). The **Browse labs** page filters by subject (**All labs / Physics / Chemistry**), with search and sorting. Sign-in is a plain two-column page.

## Run it
```
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm test           # circuit formulas, builder, guide, and platform integration checks
```
Open the built site through a server (`npm run preview`), not by double-clicking dist/index.html.

## Where things are
| Path | What it is |
| --- | --- |
| `src/App.jsx` | Nav, routing (#home, #lab, #dashboard), role-aware navigation and lab entry |
| `src/home/Home.jsx` | Homepage introduction, stats and experiment cards |
| `src/home/NourWidget.jsx` | Nour's pop-up chat in the page corner (`openNour()` opens it from anywhere) |
| `src/home/home.css` | Responsive homepage styles |
| `src/home/guide.js` | Offline lab routing and roadmap answers |
| `src/home/Ring.jsx` | The ring of lab cards: geometry, spin, drag, wheel, hover tilt |
| `src/home/CardFace.jsx` | Drawn previews for each lab card |
| `src/home/Chat.jsx` | Chat with Nour: Claude when available, keyword answers otherwise |
| `src/chem/chemScene3d.js` | The three.js chemistry room: titration rig and kinetics baths, Orbit and Walk views |
| `src/platform/Quiz.jsx` | Quiz editor for creators and the quiz player for students |
| `src/theme.css` | The bright theme layer (loaded last); colour tokens live in `src/styles.css` |
| `src/labs.js` | The lab list (7 live, 7 coming soon) |
| `src/lab/core.js` | Simulator, mistake detector, hint ladder |
| `src/lab/store.js` | Lab state and actions shared by React and the 3D scene |
| `src/lab/scene3d.js` | The three.js lab room |
| `src/lab/LabView.jsx`, `Dashboard.jsx` | Lab panels and the instructor dashboard |

## The chat's AI
You can chat with Nour from the pop-up in the page corner and inside every lab (the box under her messages). Both
chats go through `src/nour.js`, which tries three sources in order:

1. **Claude inside claude.ai**: the artifact's `sample` capability.
2. **The local server with Google Gemini**: `POST /api/nour` in `server/platform.mjs`, used when
   `GEMINI_API_KEY` is set. The key stays on the server, and the browser never sees it.
3. **Offline answers**: keyword matching on the home page, and in labs, answers built from the live bench
   state (goal, readings, the detected mistake, and the hint ladder).

In a lab, Nour's prompt carries the simulator's real state (`labContext()` in `src/lab/store.js`), so she
talks about the student's actual circuit and is told never to invent readings. The prompts live in
`shared/nourPrompt.js`.

To turn on Gemini answers, copy `.env.example` to `.env` in the project folder and paste your key from
Google AI Studio after `GEMINI_API_KEY=`. `.env` is git-ignored, so the key is never committed. Restart
`npx vite --host` after changing it. A key set in the shell (`$env:GEMINI_API_KEY="..."`) also works and
takes priority. The default model is `gemini-3.5-flash-lite`; set `GEMINI_MODEL` to use another.

If Gemini fails or is busy, Nour falls back to the offline answers. The server limits each IP to 60 Nour requests per 10 minutes.

## Platform (v2)

Requires **Node 22.13 or newer** (the server uses Node's built-in `node:sqlite`). Run `npm install && npm run dev`, or `npm run build && npm start` and open `http://127.0.0.1:3002/`. `PORT` changes the production port and `DATA_DIR` the data folder. Settings go in a git-ignored `.env` (copy `.env.example`): `GEMINI_API_KEY`, `GEMINI_MODEL`, `DEMO_MODE`, `PAYMENT_PROVIDER`, `ADMIN_EMAILS`, `COOKIE_SECURE`, `MOCK_WEBHOOK_SECRET`.

If your network inspects HTTPS (Node errors like `UNABLE_TO_VERIFY_LEAF_SIGNATURE`), start with `NODE_OPTIONS=--use-system-ca` so Node trusts the Windows certificate store.

### Accounts and creating labs

There are no student or tutor roles any more: **every account can practise and create labs** in the **Lab studio**. Administrators are set with `ADMIN_EMAILS` and only moderate. New accounts get a 14-day Pro trial.

1. **Lab studio → Create a lab**: pick a simulation, set its parameters, write the teaching content and choose **Public** or **Private**.
2. **Private** labs get an 8-character access code (or your own 6–64 character password). It is shown once; the studio can make a new one, remove everyone's access, and list who has access.
3. **Submit** publishes a new immutable version. Practice records point at the version the student used. **Unpublish** returns the lab to drafts for editing.
   A fresh database includes a demo private lab: open `#details/demo-private` and enter **DEMO2026**.
4. **Quiz (optional):** add up to 20 multiple-choice questions in the builder's **Quiz** tab (circuits) or the **Quiz** panel (chemistry). Students take it from the lab details page or with **Take the quiz** inside the lab. The answer key never reaches students: answers are graded on the server (`POST /api/labs/:id/quiz`), each question then shows the creator's explanation, and the best score appears in **My practice**. Built-in labs come with a starter quiz.
5. **Pictures:** upload a lab thumbnail from the studio card or the lab details page, and a profile picture from **Edit profile**. Images are resized in the browser, checked by their real file type on the server (PNG, JPEG or WebP, under 900 KB) and stored in SQLite (`media` table).
6. Anyone signed in can **report** a lab. Admins review reports at `#admin` and can take a lab down (the creator is notified) or restore it.

### Following and notifications

Open any creator's profile and press **Follow**: no approval needed. When they publish a **public** lab for the first time, followers get a notification in the bell (polled every 30 seconds). Private labs notify nobody. You can mute a creator's notifications or block a user.

### Plans and payments

Plans, prices and limits are data in `shared/plans.js`: Free ($0: 2 public labs, titration only, 10 Nour questions a day), Pro ($10/month, $30/semester, $80/year: unlimited and private labs, all chemistry engines, 100 Nour questions a day) and Organization ($30 per seat per year for 25–199 seats, $20 for 200–999, custom above; 30-day pilot with 25 seats). Egypt and MENA students see 40% of list price.

No real money is taken yet and no card data ever reaches the server. `PAYMENT_PROVIDER=manual` (default) lets admins grant Pro or create activation codes; `PAYMENT_PROVIDER=mock` adds a test checkout that goes through the same signed, idempotent webhook a real gateway would use. Disabled stubs in `server/billing/providers.mjs` document where Paymob or a merchant of record would plug in. `DEMO_MODE=1` unlocks everything for judges.

Organizations: start a pilot from **Plans**, then invite members by email (pending invites are accepted when that email signs up) or share a join code. The organization page shows seats, members, usage, and an invoice request form.

### Chemistry labs

Two university-level chemistry engines are live, both behind the same engine interface as circuits (`shared/engines/index.js`: validate, goal, publish check, evaluate, invariants, hints, Nour context):

- **Acid–base titration** (`shared/engines/titration.js`): strong and weak acids and bases, buffers, and polyprotic acids. pH is computed from the full charge balance with a safeguarded Newton–Raphson. Students rinse (or forget to rinse) the burette, choose an indicator, titrate in steps or drops on a 2D bench with a live pH curve, record the endpoint, and report the original concentration. The detector catches:
  - an indicator whose range misses the equivalence point
  - overshooting or stopping early
  - an unrinsed burette
  - mL/L mix-ups
  - a forgotten dilution
  - the wrong mole ratio
- **Reaction kinetics** (`shared/engines/kinetics.js`): integrated rate laws (orders 0, 1 and 2) and the Arrhenius equation. Students run the reaction at several temperatures, compare [A], ln[A] and 1/[A] plots, and report the order and Ea. The detector catches:
  - the wrong order
  - log10 used instead of ln
  - J and kJ mixed up
  - °C used instead of K

Reagents and reactions come only from the curated `shared/data/reagents.json` (textbook constants at 25 °C, with sources). Authors cannot type free-text chemicals, which is the safety control.

The unknown (a concentration, or Ea and k) never reaches the browser. Students' benches call `POST /api/labs/:id/sim`, and grading runs on the server. Creating a chemistry lab: **Lab studio → Create a lab → Chemistry**. It has a live preview, shows which indicators are suitable, and runs a reference-solution check before publishing. Equilibrium, electrochemistry and spectroscopy are registered as planned engines.

### Nour's AI (LangChain.js + RAG)

Every model call goes through LangChain.js on the server (`server/llm/`), with tracing off. The browser never sees the key and the LangChain packages are not bundled into the client.

- **Models:** chat is `ChatGoogleGenerativeAI` (`GEMINI_MODEL`, default `gemini-3.5-flash-lite`). Embeddings are `gemini-embedding-001` at 768 dimensions, with document and query task types. Embeddings sit behind a content-hash cache in SQLite (`embed_cache`), so the same text is never embedded twice. Errors map to 429 ("busy"), 502, or 503 when no key is set, and the browser then falls back to offline answers.
- **Chain** (`chains.mjs`): load the lab from the database by `labId` (the browser only sends `kind`, `labId`, bench `state` and `messages`) → retrieve → format sources → prompt → Gemini → parse (drops thought parts, extracts `[[open:LAB_ID]]`). It returns `{ text, open, sources }`. Retrieved text sits in a delimited block that the model is told is data, not instructions. Hidden answers (an unknown concentration, Ea) are never put in the prompt.
- **RAG:** a lab's description, outcomes, instructions, goal and built-in FAQ are chunked with `RecursiveCharacterTextSplitter` and indexed when a version is published. Unpublishing or a takedown removes the chunks. The retriever (`retriever.mjs`, a `BaseRetriever`) merges FTS5 keyword search and cosine similarity with reciprocal rank fusion. The access rule (public, owner, or granted) is applied **inside both SQL queries**, so a private chunk is never reachable by others. Without a key it uses keyword search only.
- **Evaluation:** `npm run rag:eval` reports recall@5 offline (keyword search only). `LIVE_EVAL=1` with a key uses real embeddings and also measures how often answers cite a retrieved source.

### Storage and security

Data lives in SQLite at `.data/platform.db` (git-ignored) with versioned migrations in `server/migrations/`. On first start, an old `.data/platform.json` is imported (password hashes unchanged) and renamed `platform.json.migrated`. Sessions persist across restarts; only a SHA-256 of each session token is stored. Passwords and access codes use scrypt with `timingSafeEqual`. Sign-in, access codes, reports, checkout and Nour are rate limited per user (or per IP when signed out); wrong access codes lock that lab for 15 minutes after 5 tries. Every route that returns or uses a lab applies the same visibility rule on the server (`VISIBLE_SQL` in `server/lib.mjs`). See `docs/architecture.md` for the schema.

## Circuit builder and expanded electronics

**Resistor values.** Labs offer real standard resistors by default. Two variable parts are also available, and each slot keeps its own value (`bench.values.R` / `bench.values.D`):
- **Adjustable resistor** (10 Ω–100 kΩ): a logarithmic slider plus a box to type an exact value. Available in every resistor slot, including R2 in series, parallel and divider labs.
- **Custom resistor** (1 Ω–1 MΩ): creator-only, off in built-in labs. Turn it on in **Stock the component shelf**. Students type values like `470`, `4.7k`, `4k7` or `1M`. The lab's **Custom resistor values** setting can use the exact value or round it to the nearest E12 or E24 part (500 Ω becomes 470 Ω in E12, and the student is told why). The server only accepts standard values when rounding is on, and the publish check solves for variable parts under the same rule.

The tutor studio includes **Circuit & components**, **Teaching content**, and **Test your lab** tabs. In the sandbox, click a slot and a component or drag a part onto a compatible slot. Change the test supply, flip polarized parts, adjust variable resistance, run a measurement, reset the test, or choose **Use as starting circuit**. Save your draft to persist it. Testing a solution does not silently change the saved starter. Saving validates the configuration; publication additionally rejects configurations for which the solver cannot find a safe solution using the permitted parts and supply controls.

A quick authored-lab demo:

1. Create a voltage-divider lab. Set the fixed supply to **9 V**, target to **6 V**, and tolerance to **5%**.
2. Allow **1 kΩ** for R1 and **2 kΩ** for R2. Leave the starting slots empty or place R1 to scaffold the exercise.
3. In the sandbox, place both parts and run: output is **6 V**, current is **3 mA**.
4. Add the title, description, outcomes, and instructions; check solvability, save, and submit.
5. Open the published lab as a student. Its own room has the configured supply, palette, starter, and six-volt goal. It does not share other experiment benches.

Available parts: a wire, fourteen fixed resistor values from **47 Ω to 100 kΩ**, an **adjustable 100 Ω–10 kΩ resistor**, red/green/blue LEDs, a silicon diode, and seven capacitor values from **1 µF to 1000 µF**. The supply, switch, ammeter, output-voltage readings, and RC scope are included instruments. The adjustable resistor is available in R1; R2 uses fixed resistors.

Models: ideal DC resistance networks; 2.0/2.2/3.2 V fixed forward drops for red/green/blue LEDs; a 0.7 V silicon diode with ideal reverse blocking; unloaded voltage dividers; exponential RC charging with τ = RC. Resistors use a 0.25 W safety ceiling in authored labs. LED ratings remain 2–20 mA, with simulated failure above 30 mA. Silicon-diode overloads are diagnosed without persistent damage modeling. Component thermal transients, diode reverse breakdown, arbitrary networks, and AC behavior are not modeled. RC plots scale their voltage and time axes to the chosen supply and five time constants.

Separate-room lifecycle: selecting a lab loads a fresh starting circuit and that lab’s component palette; the 3D scene creates one station, and returning to another lab mounts a new scene. GPU resources are disposed on exit. **Orbit**, **Walk**, and **Schematic** views remain available. If WebGL initialization fails, the lab switches to the interactive schematic. Updated visual/3D browser QA remains unverified because the browser access host is unavailable; use schematic view if your device cannot render WebGL.

Existing `.data/platform.json` files are migrated additively with the new built-in labs. Accounts, authored content, and practice records are retained. Older tutor drafts can be opened in the builder to add a circuit configuration.
