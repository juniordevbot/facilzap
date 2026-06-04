# FacilZap → Meta Conversions API

Servidor que recebe webhooks do FacilZap e envia eventos de Purchase para a Meta (Facebook) Conversions API automaticamente.

## Como subir no Railway (gratuito)

1. Crie conta em https://railway.app
2. Clique em **New Project → Deploy from GitHub repo** (ou **Deploy from local** com o CLI)
3. Suba essa pasta
4. Em **Variables**, adicione:
   - `META_PIXEL_ID` → ID do seu Pixel do Meta
   - `META_ACCESS_TOKEN` → Token de acesso da Conversions API (pegue em Events Manager → Settings → Conversions API)
5. O Railway vai gerar uma URL tipo `https://seu-projeto.up.railway.app`

## Como configurar no FacilZap

1. Acesse **Integrações → Webhooks**
2. URL do Webhook: `https://seu-projeto.up.railway.app/webhook`
3. Ative os eventos: **pedido_criado** (e opcionalmente **pedido_atualizado**)
4. Salve

## Lógica do servidor

- Recebe `pedido_criado` → dispara **Purchase** imediatamente
- Recebe `pedido_atualizado` → dispara **Purchase** somente se `status_pago = true`
- Dados hasheados em SHA-256 conforme exigido pelo Meta: telefone, email, nome, cidade, estado, CEP, país
- Valor em BRL, `action_source: physical_store`
