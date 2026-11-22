# Sim2Skill (React)

Home: a 3D ring of lab cards in a rounded frame, with a chat with Nour (the AI lab instructor) in the centre.
Pick a lab in the chat, on the ring, or in the sentence at the top: the ring spins to that card, the card
zooms to full screen, and you land in the 3D lab bench.

## Run it
```
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm test           # 1,548 checks of the simulator against the formulas
```
Open the built site through a server (`npm run preview`), not by double-clicking dist/index.html.

## Where things are
| Path | What it is |
| --- | --- |
| `src/App.jsx` | Nav, routing (#home, #lab, #dashboard), card-to-lab zoom transition |
| `src/home/Home.jsx` | Loader, sentence + stats, the frame and its scene layers, sentence preview card |
| `src/home/Ring.jsx` | The ring of lab cards: geometry, spin, drag, wheel, hover tilt |
| `src/home/CardFace.jsx` | Drawn previews for each lab card |
| `src/home/Chat.jsx` | Chat with Nour: Claude when available, keyword answers otherwise |
| `src/labs.js` | The lab list (3 live, 9 coming soon) |
| `src/lab/core.js` | Simulator, mistake detector, hint ladder |
| `src/lab/store.js` | Lab state and actions shared by React and the 3D scene |
| `src/lab/scene3d.js` | The three.js lab room |
| `src/lab/LabView.jsx`, `Dashboard.jsx` | Lab panels and the instructor dashboard |

## The chat's AI
Inside claude.ai the page asks Claude through the artifact's `sample` capability and can call an
`open_lab` tool to walk the student into a lab. Outside claude.ai (for example `npm run dev`), there is no
Claude connection, so Nour answers with keyword matching. To use your own backend later, replace the
`caps.sample(...)` call in `src/home/Chat.jsx` with a call to your API.

## Nour reads circuit pictures (free bench)
Attach a photo of any circuit in Nour's chat (the + button, or paste an image). Nour explains it, shows the schematic
in the chat, and "Open on the bench" builds it in 3D: click a part to read its voltage and current, click a switch to flip it.
Ordinary questions go through the same chat.

```
# 1. backend (needs a Gemini API key from https://aistudio.google.com/apikey)
cd server
pip install fastapi "uvicorn[standard]" python-multipart google-genai
echo GEMINI_API_KEY=your_key> .env
python -m uvicorn nour_server:app --port 8000

# 2. the site, in another terminal (the dev server forwards /api to port 8000)
npm install
npm run dev
```
| Path | What it is |
| --- | --- |
| `server/nour_server.py` | `/api/nour`: chat plus optional image, returns reply and netlist. Rate limit, optional access code (`NOUR_ACCESS_CODE`), CORS list (`NOUR_ALLOWED_ORIGINS`) |
| `src/lab/netlist.js` | Netlist checks, DC solver (modified nodal analysis), auto-layout, schematic SVG |
| `src/lab/customStore.js`, `CustomLab.jsx`, `sceneCustom.js` | The free bench: state, panels, 3D scene built from any netlist |
| `tests/test_netlist.mjs` | 28 solver and layout checks (`node tests/test_netlist.mjs`) |

The three guided labs are unchanged. The API key lives only on the server. When the site is hosted somewhere other than
the backend, set `VITE_NOUR_API` to the backend URL at build time and add the site's address to `NOUR_ALLOWED_ORIGINS`.
