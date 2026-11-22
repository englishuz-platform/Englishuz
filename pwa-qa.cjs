const fs=require('fs');const path=require('path');const root=__dirname;
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
const sw=fs.readFileSync(path.join(root,'service-worker.js'),'utf8');
const checks=[
['Manifest standalone',manifest.display==='standalone'],
['Manifest relative scope',manifest.scope==='./'&&manifest.start_url.startsWith('./')],
['Manifest SVG app icon',manifest.icons.some(x=>x.src.includes('englishuz-icon.svg'))],
['HTML manifest link',html.includes('rel="manifest" href="./manifest.webmanifest"')],
['Install prompt handler',html.includes('beforeinstallprompt')],
['Install button created',html.includes('pwa-install-button')],
['Service worker registered',html.includes("serviceWorker.register('./service-worker.js'")],
['Offline app shell cached',sw.includes('APP_SHELL')&&sw.includes('./index.html')],
['Firebase/Google requests not intercepted',sw.includes('url.origin !== self.location.origin')],
['App icon exists',fs.existsSync(path.join(root,'assets/englishuz-icon.svg'))]
];
for(const [name,ok] of checks) console.log((ok?'PASS ':'FAIL ')+name);
const failed=checks.filter(x=>!x[1]);console.log('\n'+(checks.length-failed.length)+'/'+checks.length+' PWA checks passed');
if(failed.length)process.exit(1);
