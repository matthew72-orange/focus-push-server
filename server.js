const express = require('express');
const webpush = require('web-push');
const cors = require('cors');

webpush.setVapidDetails(
  'mailto:you@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const app = express();
app.use(cors());

// 簡易APIキー保護（環境変数 API_KEY が設定されているときだけ有効）
app.use((req,res,next)=>{
  const required = !!process.env.API_KEY;
  if (required && req.path.startsWith('/api/')) {
    if (req.get('x-api-key') !== process.env.API_KEY) {
      return res.status(401).json({ok:false});
    }
  }
  next();
});

app.use(express.json());

// 端末ごとの購読情報を保存（学習用にメモリでOK）
/**
 * subs: Map<deviceId, { role: 'self'|'family', familyCode?: string|null, subscription: PushSubscription }>
 */
const subs = new Map();


app.get('/', (_,res)=>res.send('ok'));

app.post('/api/save-subscription', (req,res)=>{
  const { deviceId, role, familyCode, subscription } = req.body || {};
  if (!deviceId || !subscription) return res.status(400).json({ok:false, error:'bad request'});
  subs.set(deviceId, { role: role || 'self', familyCode: familyCode || null, subscription });
  res.json({ok:true});
});

app.post('/api/focus-result', async (req,res)=>{
  const { deviceId, familyCode, title, body, url } = req.body || {};
  if (!deviceId || !title) return res.status(400).json({ok:false, error:'bad request'});

  // 送信対象を収集
  const targets = [];
  for (const [id, v] of subs.entries()){
    // 本人（deviceId一致 & role=self）
    if (id === deviceId && v.role === 'self') targets.push(v.subscription);
    // 家族（familyCode一致 & role=family）
    if (familyCode && v.familyCode && v.familyCode === familyCode && v.role === 'family') {
      targets.push(v.subscription);
    }
  }

  const payload = JSON.stringify({ title, body, url });
  try{
    await Promise.all(targets.map(s => webpush.sendNotification(s, payload).catch(e=>{
      // 410/404 は購読無効なので捨て候補（簡易）
      if (e?.statusCode === 410 || e?.statusCode === 404) {
        // 実運用は subs からも削除するロジックを追加
      } else {
        throw e;
      }
    })));
    res.json({ok:true, sent: targets.length});
  }catch(e){
    console.error(e.body || e);
    res.status(500).json({ok:false});
  }
});


app.post('/api/test-push', async (req,res)=>{
  const {deviceId, title, body} = req.body || {};
  const rec = subs.get(deviceId);
  if (!rec) return res.status(404).json({ok:false, error:'not found'});
  try{
    await webpush.sendNotification(rec.subscription, JSON.stringify({title, body}));
    res.json({ok:true});
  }catch(e){
    console.error(e.body || e);
    res.status(500).json({ok:false});
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log('push server on :' + PORT));


