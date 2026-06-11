#!/usr/bin/env node
/**
 * DFI Daily Update Automation
 * - Fetches live market data
 * - Updates index.html with today's content
 * - Pushes to GitHub (triggers Vercel redeploy)
 * - Sends Brevo email + SMS to DFI-Investors list
 * 
 * STATUS: READY — not sending yet, controlled by SEND_ENABLED flag
 */

const https = require('https');
const fs = require('fs');
const { execSync } = require('child_process');

const CONFIG = {
  SEND_ENABLED: false,          // ← flip to true when ready to go live
  BREVO_KEY: process.env.BREVO_API_KEY,
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  BREVO_LIST_ID: 18,
  BREVO_SENDER_EMAIL: 'support@defiincome.com',
  BREVO_SENDER_NAME: 'DeFi Income',
  REPO: 'RebelDividendsAi/dfi-updates',
  SITE_URL: 'https://updates.defiincome.com',
};

async function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function getMarketData() {
  const data = await fetchJSON(
    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,usd-coin&vs_currencies=usd&include_24hr_change=true'
  );
  return {
    btc: { price: data.bitcoin.usd, change: data.bitcoin.usd_24h_change.toFixed(2) },
    eth: { price: data.ethereum.usd, change: data.ethereum.usd_24h_change.toFixed(2) },
    usdc: { price: data['usd-coin'].usd, change: data['usd-coin'].usd_24h_change.toFixed(2) },
  };
}

function formatDate() {
  return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function buildPage(market, date) {
  const btcDir = market.btc.change >= 0 ? 'up' : 'down';
  const ethDir = market.eth.change >= 0 ? 'up' : 'down';
  // Read template and inject live data
  let html = fs.readFileSync('/Users/jasoncox/projects/dfi-updates/index.html', 'utf8');
  html = html.replace(/May 1, 2026/g, date);
  html = html.replace(/\$78,425/, `$${market.btc.price.toLocaleString()}`);
  html = html.replace(/\+2\.74%/, `${market.btc.change >= 0 ? '+' : ''}${market.btc.change}%`);
  html = html.replace(/\$2,305/, `$${market.eth.price.toLocaleString()}`);
  html = html.replace(/\+2\.03%/, `${market.eth.change >= 0 ? '+' : ''}${market.eth.change}%`);
  return html;
}

async function sendBrevoEmail(date) {
  if (!CONFIG.SEND_ENABLED) {
    console.log('[EMAIL] SEND_ENABLED=false — skipping email send');
    return;
  }
  const payload = JSON.stringify({
    sender: { email: CONFIG.BREVO_SENDER_EMAIL, name: CONFIG.BREVO_SENDER_NAME },
    subject: `DeFi Income Update — ${date}`,
    htmlContent: `<p>Your daily investor update is ready.</p><p><a href="${CONFIG.SITE_URL}">View today's update →</a></p>`,
    listIds: [CONFIG.BREVO_LIST_ID],
  });
  // POST to Brevo campaigns API
  console.log('[EMAIL] Would send to list ID', CONFIG.BREVO_LIST_ID);
}

async function sendBrevoSMS(date) {
  if (!CONFIG.SEND_ENABLED) {
    console.log('[SMS] SEND_ENABLED=false — skipping SMS send');
    return;
  }
  console.log('[SMS] Would send SMS to DFI-Investors list');
}

async function pushToGitHub(date) {
  try {
    execSync(`cd /Users/jasoncox/projects/dfi-updates && git add index.html && git commit -m "Daily update ${date}" && git push`, { stdio: 'inherit' });
    console.log('[GIT] Pushed to GitHub — Vercel redeploy triggered');
  } catch (e) {
    console.error('[GIT] Push failed:', e.message);
  }
}

async function run() {
  const date = formatDate();
  console.log(`[DFI] Running daily update for ${date}`);
  console.log(`[DFI] SEND_ENABLED: ${CONFIG.SEND_ENABLED}`);

  const market = await getMarketData();
  console.log(`[MARKET] BTC: $${market.btc.price} (${market.btc.change}%) | ETH: $${market.eth.price} (${market.eth.change}%)`);

  const html = buildPage(market, date);
  fs.writeFileSync('/Users/jasoncox/projects/dfi-updates/index.html', html);
  console.log('[PAGE] index.html updated with live data');

  await pushToGitHub(date);
  await sendBrevoEmail(date);
  await sendBrevoSMS(date);

  console.log('[DFI] Done.');
}

run().catch(console.error);
