import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createPlatformHandler} from './platform.mjs';
const api=await createPlatformHandler();const root=resolve('dist');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
createServer((req,res)=>api(req,res,async()=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);let file=resolve(root,'.'+pathname);if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403);return res.end('Forbidden');}if(pathname==='/'||(await stat(file)).isDirectory())file=resolve(root,'index.html');const content=await readFile(file);res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(content);}catch{res.writeHead(404);res.end('Not found. Run npm run build before npm start.');}})).listen(Number(process.env.PORT)||3002,'127.0.0.1',()=>console.log(`Sim2Skill http://127.0.0.1:${process.env.PORT||3002}`));
