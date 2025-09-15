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
app.use(express.json());

const subs = new Map();

app.get('/', (_,res)=>res.send('ok'));

app.post('/api/save-subscription', (req,res)=>{
  const {deviceId, role, subscription} = req.body || {};
  if (!deviceId || !subscription) return res.status(400).json({ok:false});
  subs.set(deviceId, {role: role || 'self', subscription});
  res.json({ok:true});
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
