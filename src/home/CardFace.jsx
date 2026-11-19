import { reduced } from '../lab/store.js';

// Drawn previews for each lab card (284 × 160). Live labs show their circuit running;
// roadmap labs show a quiet line drawing of their apparatus.
const W = '#DCE7EB', Y = '#F2B705', DIM = 'rgba(220,231,235,.5)';
const A = (props) => (reduced ? null : <animate repeatCount="indefinite" {...props} />);

function Loop({ led, children }) {
  return (
    <g fill="none" stroke={W} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round">
      <path d={led ? 'M48 74 V40 H110 M174 40 H236 V62 M236 98 V122 H158 M126 122 H48 V92' : 'M48 74 V40 H110 M174 40 H236 V122 H158 M126 122 H48 V92'} />
      {children}
    </g>
  );
}
const Battery = () => (<g stroke={W} strokeLinecap="round"><line x1="34" y1="76" x2="62" y2="76" strokeWidth="2.5" /><line x1="41" y1="90" x2="55" y2="90" strokeWidth="5" /></g>);
const Resistor = ({ c = ['#7A4A21', '#1A1A1A', '#7A4A21'] }) => (
  <g><rect x="112" y="32" width="60" height="17" rx="7" fill="#DDBF92" stroke="#0F2630" strokeWidth="1" />
    {c.map((col, i) => <rect key={i} x={121 + i * 9} y="33" width="5" height="15" fill={col} />)}<rect x="158" y="33" width="5" height="15" fill="#C9A227" /></g>
);
const Ammeter = () => (<g><circle cx="142" cy="122" r="15" fill="#0E2A3B" stroke={W} strokeWidth="2.5" /><text x="142" y="127" textAnchor="middle" fill={W} fontSize="14" fontWeight="600" fontFamily="Geist, system-ui">A</text></g>);
const Flow = ({ d }) => (
  <path d={d} fill="none" stroke={Y} strokeWidth="5" strokeLinecap="round" strokeDasharray="1 15">
    <A attributeName="stroke-dashoffset" from="0" to="-32" dur="0.9s" />
  </path>
);

function Art({ art }) {
  switch (art) {
    case 'ohm': return (<>
      <Loop /><Battery /><Resistor /><Ammeter />
      <Flow d="M48 74 V40 H236 V122 H48 V92" />
      <text x="236" y="26" textAnchor="end" fill={Y} fontSize="15" fontFamily="'Geist Mono', monospace">10.0 mA</text>
    </>);
    case 'led': return (<>
      <Loop led /><Battery /><Resistor c={['#E8731A', '#2B63C9', '#7A4A21']} /><Ammeter />
      <circle cx="236" cy="80" r="22" fill="#FF4B3A" opacity=".35"><A attributeName="opacity" values=".15;.5;.15" dur="2.4s" /></circle>
      <polygon points="222,66 250,66 236,90" fill="#FF4B3A" stroke="#B3261C" strokeWidth="2" strokeLinejoin="round" />
      <line x1="222" y1="94" x2="250" y2="94" stroke={W} strokeWidth="2.5" />
      <Flow d="M48 74 V40 H236 V62 M236 98 V122 H48 V92" />
      <text x="236" y="26" textAnchor="end" fill={Y} fontSize="15" fontFamily="'Geist Mono', monospace">14.9 mA</text>
    </>);
    case 'rc': {
      const pts = Array.from({ length: 41 }, (_, i) => { const t = i / 40 * 5; return `${36 + t / 5 * 212},${132 - (1 - Math.exp(-t)) * 92}`; }).join(' ');
      return (<>
        <g stroke="rgba(220,231,235,.14)">{[0, 1, 2, 3, 4, 5].map(i => <line key={i} x1={36 + i * 42.4} y1="34" x2={36 + i * 42.4} y2="132" />)}{[0, 1, 2, 3, 4].map(i => <line key={'h' + i} x1="36" y1={34 + i * 24.5} x2="248" y2={34 + i * 24.5} />)}</g>
        <line x1="36" y1={132 - 0.632 * 92} x2="248" y2={132 - 0.632 * 92} stroke={DIM} strokeDasharray="5 4" />
        <polyline points={pts} fill="none" stroke={Y} strokeWidth="3" strokeLinejoin="round" pathLength="100" strokeDasharray="100" strokeDashoffset={reduced ? 0 : 100}>
          <A attributeName="stroke-dashoffset" values="100;0;0;100" keyTimes="0;.55;.85;1" dur="4s" />
        </polyline>
        <text x="248" y="26" textAnchor="end" fill={Y} fontSize="15" fontFamily="'Geist Mono', monospace">τ = 1 s</text>
      </>);
    }
    case 'pendulum': return (<g stroke={W} strokeWidth="2.5" fill="none" strokeLinecap="round">
      <line x1="96" y1="30" x2="188" y2="30" />
      <g><line x1="142" y1="30" x2="142" y2="112" /><circle cx="142" cy="122" r="11" fill={DIM} />
        {!reduced && <animateTransform attributeName="transform" type="rotate" values="-24 142 30;24 142 30;-24 142 30" dur="2.6s" repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1" />}</g>
      <path d="M112 124 A70 70 0 0 0 172 124" stroke={DIM} strokeDasharray="3 5" />
    </g>);
    case 'series': return (<g stroke={W} strokeWidth="2.5" fill="none" strokeLinejoin="round">
      <path d="M44 80 H90 M90 50 V110 M90 50 H120 M164 50 H194 M90 110 H120 M164 110 H194 M194 50 V110 M194 80 H240" />
      <rect x="120" y="42" width="44" height="16" rx="6" fill="#DDBF92" stroke="none" /><rect x="120" y="102" width="44" height="16" rx="6" fill="#DDBF92" stroke="none" />
    </g>);
    case 'flask': return (<g stroke={W} strokeWidth="2.5" fill="none" strokeLinejoin="round">
      <path d="M128 28 V64 L100 128 H184 L156 64 V28" /><line x1="120" y1="28" x2="164" y2="28" />
      <path d="M108 110 L101 126 H183 L176 110 Z" fill="#E879A8" stroke="none" opacity=".75"><A attributeName="opacity" values=".35;.8;.35" dur="3.4s" /></path>
      <line x1="142" y1="6" x2="142" y2="22" stroke={DIM} />
    </g>);
    case 'lens': return (<g fill="none" strokeLinecap="round">
      <path d="M142 34 Q160 80 142 126 Q124 80 142 34 Z" stroke={W} strokeWidth="2.5" fill="rgba(158,216,228,.18)" />
      {[50, 80, 110].map(y => <path key={y} d={`M40 ${y} H142 L228 80`} stroke={Y} strokeWidth="1.8" opacity=".85" />)}
      <circle cx="228" cy="80" r="4" fill={Y} />
    </g>);
    case 'divider': return (<g stroke={W} strokeWidth="2.5" fill="none" strokeLinejoin="round">
      <path d="M142 24 V44 M142 72 V88 M142 116 V136 M142 80 H210" />
      <rect x="133" y="44" width="18" height="28" rx="6" fill="#DDBF92" stroke="none" /><rect x="133" y="88" width="18" height="28" rx="6" fill="#DDBF92" stroke="none" />
      <circle cx="214" cy="80" r="4" fill={W} /><text x="222" y="84" fill={Y} fontSize="14" stroke="none" fontFamily="'Geist Mono', monospace">½ V</text>
    </g>);
    case 'flame': return (<g fill="none" stroke={W} strokeWidth="2.5" strokeLinejoin="round">
      <path d="M126 134 H158 M134 134 V96 H150 V134" />
      <path d="M142 92 C126 76 134 56 142 40 C150 56 158 76 142 92 Z" fill="#3E7BFA" stroke="none" opacity=".85">
        {!reduced && <animateTransform attributeName="transform" type="scale" values="1 1;1 1.08;1 .96;1 1" dur="1.2s" repeatCount="indefinite" additive="sum" />}
      </path>
      <path d="M142 86 C135 76 138 64 142 56 C146 64 149 76 142 86 Z" fill="#9ED8E4" stroke="none" />
    </g>);
    case 'spring': return (<g fill="none" stroke={W} strokeWidth="2.5" strokeLinejoin="round">
      <line x1="104" y1="22" x2="180" y2="22" />
      <g><path d="M142 22 V34 L128 42 L156 52 L128 62 L156 72 L128 82 L142 88 V96" /><rect x="124" y="96" width="36" height="28" rx="5" fill={DIM} />
        {!reduced && <animateTransform attributeName="transform" type="translate" values="0 0;0 10;0 0" dur="1.8s" repeatCount="indefinite" />}</g>
    </g>);
    case 'beakers': return (<g fill="none" stroke={W} strokeWidth="2.5">
      {[70, 142, 214].map((x, i) => <g key={x}><path d={`M${x - 24} 54 V128 H${x + 24} V54`} /><rect x={x - 22} y={128 - 20 - i * 18} width="44" height={20 + i * 18} fill="#9ED8E4" opacity={0.25 + i * 0.2} stroke="none" /></g>)}
    </g>);
    case 'projectile': return (<g fill="none">
      <path d="M40 128 Q142 -10 244 128" stroke={DIM} strokeWidth="2" strokeDasharray="4 6" />
      <line x1="30" y1="130" x2="254" y2="130" stroke={W} strokeWidth="2.5" />
      <circle r="7" fill={Y}>{reduced ? null : <animateMotion dur="2.6s" repeatCount="indefinite" path="M40 128 Q142 -10 244 128" />}</circle>
    </g>);
    default: return null;
  }
}

export default function CardFace({ lab }) {
  return (
    <svg className="face-art" viewBox="0 0 284 160" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="cf-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#123241" /><stop offset="1" stopColor="#081822" /></linearGradient>
        <pattern id="cf-grid" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0V16" fill="none" stroke="rgba(220,231,235,.06)" /></pattern>
      </defs>
      <rect width="284" height="160" fill="url(#cf-bg)" /><rect width="284" height="160" fill="url(#cf-grid)" />
      <g opacity={lab.live ? 1 : 0.62}><Art art={lab.art} /></g>
    </svg>
  );
}
