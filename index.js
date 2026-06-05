const express = require('express');
const https = require('https');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const META_DATASET_ID   = process.env.META_DATASET_ID   || '1190155498539686';
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || 'EAANDzuarwZCkBRhU3Tlz86S8IFpaza1Bf3LXc2VV6Yzf1OjCjtq1e1TRSdOtz2Fv6H2M6n0csPra1NGozbbNbzDaDRkBUYguJIY6Ec9BuzGzpCvlrlylGIaNf9rScaBVTjqoGbvx7ZCeE9Im5IO5xnamNTWNxvyZA01t5SBX8JlRXAZCO6NaKPjt5vWb5wZDZD';
const PORT              = process.env.PORT || 3000;

const pedidosDisparados = new Set();

function hashSHA256(value) {
  if (!value) return undefined;
  const clean = String(value).trim().toLowerCase();
  if (!clean) return undefined;
  return crypto.createHash('sha256').update(clean).digest('hex');
}

function parsePhone(phone) {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  return '55' + digits;
}

function parseDateToUnix(dateStr) {
  if (!dateStr) return Math.floor(Date.now() / 1000);
  const d = new Date(dateStr.replace(' ', 'T') + 'Z');
  return isNaN(d) ? Math.floor(Date.now() / 1000) : Math.floor(d.getTime() / 1000);
}

function buildPayload(pedido) {
  const cliente = pedido.cliente || {};
  const pagamentos = pedido.pagamentos || [];
  const valor = pedido.total || pagamentos.reduce((s, p) => s + (p.valor || 0), 0);
  const nome  = (cliente.nome || '').trim().split(/\s+/);
  const phone = parsePhone(cliente.whatsapp_e164 || cliente.whatsapp || cliente.telefone);

  const match_keys = [];

  if (phone)         match_keys.push({ key: 'PHONE',      value: hashSHA256(phone) });
  if (cliente.email) match_keys.push({ key: 'EMAIL',      value: hashSHA256(cliente.email) });
  if (nome[0])       match_keys.push({ key: 'FN',         value: hashSHA256(nome[0]) });
  if (nome.length>1) match_keys.push({ key: 'LN',         value: hashSHA256(nome.slice(1).join(' ')) });
  if (cliente.cep)   match_keys.push({ key: 'ZIP',        value: hashSHA256(cliente.cep.replace(/\D/g,'')) });
  if (cliente.cidade)match_keys.push({ key: 'CT',         value: hashSHA256(cliente.cidade) });
  if (cliente.estado)match_keys.push({ key: 'ST',         value: hashSHA256(cliente.estado.toLowerCase()) });
                     match_keys.push({ key: 'COUNTRY',    value: hashSHA256('br') });

  return {
    upload_tag: `facilzap_${pedido.id}`,
    data: [{
      match_keys,
      event_name:  'Purchase',
      event_time:  parseDateToUnix(pedido.data),
      value:       parseFloat(valor) || 0,
      currency:    'BRL',
      order_id:    String(pedido.id || pedido.codigo || ''),
    }],
  };
}

function sendToMeta(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname: 'graph.facebook.com',
      path:     `/v19.0/${META_DATASET_ID}/events?access_token=${META_ACCESS_TOKEN}`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

app.post('/webhook', async (req, res) => {
  try {
    const { evento, dados } = req.body;
    const pedidoId = String(dados?.id || '');

    console.log(`[${new Date().toISOString()}] Evento: ${evento} | Pedido: ${pedidoId}`);

    const EVENTOS_ACEITOS = ['pedido_criado', 'pedido_pagamento_atualizado'];
    if (!EVENTOS_ACEITOS.includes(evento)) {
      return res.status(200).json({ ok: true, msg: `Ignorado: ${evento}` });
    }

    if (evento === 'pedido_criado' && !dados.status_pago) {
      return res.status(200).json({ ok: true, msg: 'Pedido criado sem pagamento, aguardando' });
    }

    if (pedidoId && pedidosDisparados.has(pedidoId)) {
      return res.status(200).json({ ok: true, msg: 'Já disparado, ignorado' });
    }

    const payload = buildPayload(dados);
    console.log('  → Enviando offline event:', JSON.stringify({ order_id: payload.data[0].order_id, value: payload.data[0].value }));

    const result = await sendToMeta(payload);
    console.log(`  ← Meta [${result.status}]:`, result.body);

    if (pedidoId) {
      pedidosDisparados.add(pedidoId);
      setTimeout(() => pedidosDisparados.delete(pedidoId), 24 * 60 * 60 * 1000);
    }

    return res.status(200).json({ ok: true, meta_status: result.status, meta_body: result.body });
  } catch (err) {
    console.error('Erro:', err.message);
    return res.status(200).json({ ok: false, error: err.message });
  }
});

app.get('/', (req, res) => res.json({
  status:  'ok',
  service: 'FacilZap → Meta Offline Conversions API',
  dataset: META_DATASET_ID,
}));

app.listen(PORT, () => console.log(`✓ Servidor na porta ${PORT}`));
