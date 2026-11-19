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
