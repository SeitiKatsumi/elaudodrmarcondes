# Laudos Dr. Marcondes

Aplicacao web com API REST para recebimento de imagens PNG/JPEG de cartografia vascular, geracao automatica de laudo textual estruturado, painel administrativo, historico em SQLite e Docker pronto para deploy via CapRover.

> MVP: a geracao do laudo usa analise visual heuristica da imagem estatica e templates medicos estruturados. O texto sempre deve ser revisado e validado por profissional medico habilitado antes de uso clinico.

Repositorio GitHub: https://github.com/SeitiKatsumi/elaudodrmarcondes

## Recursos

- `POST /api/laudo` com upload `multipart/form-data`.
- Endpoints por integracao: `POST /api/integrations/{integration_id}/laudo`.
- Autenticacao administrativa por senha.
- Autenticacao REST por API Key via `Authorization: Bearer` ou `x-api-key`.
- Dashboard com metricas, exames recentes, erros e historico.
- Geracao manual de laudos pela interface.
- Criacao, ativacao e desativacao de integracoes com API Key.
- Tela de configuracoes para inserir a API Key da OpenAI/ChatGPT, ativar/desativar o motor e selecionar o modelo.
- Persistencia SQLite para integracoes, chamadas, exames, laudos e erros.
- Dockerfile e docker-compose para deploy.

## Variaveis de ambiente

Copie `.env.example` para `.env`:

```bash
cp .env.example .env
```

Configure:

```env
PORT=3007
APP_URL=https://laudosdrmarcondes.dna11.com.br
ADMIN_PASSWORD=definir_senha_aqui
SESSION_SECRET=troque_este_segredo_em_producao
API_KEY=troque_esta_chave_master
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.5
OPENAI_ENABLED=false
DATABASE_PATH=./data/laudos.sqlite
UPLOAD_DIR=./uploads
MAX_UPLOAD_MB=12
```

`API_KEY` e a chave master inicial para o endpoint `/api/laudo`. Novas integracoes geram suas proprias chaves pela interface administrativa.

`OPENAI_API_KEY`, `OPENAI_MODEL` e `OPENAI_ENABLED` podem ser configurados pelo `.env` ou pela tela **Configuracoes** no painel administrativo. Quando a OpenAI estiver ativada, a aplicacao usa a Responses API com entrada de imagem em base64 para gerar o laudo. Se a chamada falhar, o sistema usa automaticamente o gerador heuristico local como fallback.

## Rodar localmente

```bash
npm install
npm start
```

Acesse:

```text
http://localhost:3007
```

## Configurar OpenAI/ChatGPT no painel

1. Entre no painel administrativo.
2. Abra **Configuracoes**.
3. Ative **Geracao com OpenAI**.
4. Informe a API Key da OpenAI.
5. Selecione o modelo desejado ou informe um modelo personalizado.
6. Salve.

O sistema usa a OpenAI Responses API com imagem enviada como data URL em base64. O laudo deve retornar em JSON estruturado. Caso a chamada falhe, o sistema registra o aviso e usa o gerador local como fallback.

## API principal

Endpoint:

```http
POST /api/laudo
```

Campos aceitos:

- `image`: um ou mais arquivos PNG/JPEG obrigatorios. Para multiplas imagens, repita o campo `image` no `multipart/form-data`.
- `nome_paciente` ou `patient_name`.
- `idade` ou `age`.
- `sexo` ou `sex`.
- `tipo_exame` ou `exam_type`.
- `observacoes_clinicas` ou `clinical_notes`.
- `identificador_externo` ou `external_id`.
- `medico_solicitante` ou `requester_name`.

Exemplo:

```bash
curl -X POST "http://localhost:3007/api/laudo" \
  -H "Authorization: Bearer SUA_API_KEY" \
  -F "image=@exame.jpg" \
  -F "image=@imagem-complementar.png" \
  -F "nome_paciente=Maria Exemplo" \
  -F "idade=58" \
  -F "sexo=F" \
  -F "tipo_exame=Cartografia Vascular" \
  -F "observacoes_clinicas=Queixa de dor em membro inferior"
```

Resposta:

```json
{
  "success": true,
  "exam_id": "123456",
  "status": "completed",
  "laudo": {
    "titulo": "Laudo de Cartografia Vascular",
    "descricao_geral": "Texto completo da analise...",
    "achados_principais": ["Achado 1", "Achado 2"],
    "analise_tecnica": "Descricao tecnica detalhada...",
    "conclusao": "Conclusao clinica baseada na imagem enviada.",
    "observacoes": "Este laudo foi gerado automaticamente e deve ser validado por profissional habilitado."
  }
}
```

Erro:

```json
{
  "success": false,
  "error": "Descricao clara do erro ocorrido."
}
```

## Integracoes

No painel, acesse **APIs de Integracao**, informe um nome e gere uma API Key. A chave e exibida apenas uma vez.

Endpoint por integracao:

```http
POST /api/integrations/{integration_id}/laudo
```

Exemplo:

```bash
curl -X POST "https://laudosdrmarcondes.dna11.com.br/api/integrations/ID_DA_INTEGRACAO/laudo" \
  -H "x-api-key: API_KEY_DA_INTEGRACAO" \
  -F "image=@exame.png" \
  -F "nome_paciente=Paciente Externo" \
  -F "identificador_externo=EXAME-987"
```

## Docker

Build:

```bash
docker build -t laudos-dr-marcondes .
```

Rodar:

```bash
docker run --env-file .env -p 3007:3007 -v ./data:/app/data -v ./uploads:/app/uploads laudos-dr-marcondes
```

Com compose:

```bash
docker compose up -d --build
```

## Deploy via CapRover

1. Suba o repositorio para o GitHub.
2. No CapRover, crie um novo app.
3. Configure o dominio `laudosdrmarcondes.dna11.com.br` e habilite HTTPS.
4. Defina as variaveis de ambiente do `.env.example`.
5. Configure volume persistente para:
   - `/app/data`
   - `/app/uploads`
6. Faça deploy pelo GitHub ou via CLI do CapRover.

O arquivo `captain-definition` aponta para o `Dockerfile`, portanto o CapRover consegue construir a imagem diretamente do repositorio.

No Dockerfile a aplicacao escuta `PORT=80` por padrao, que e o caminho mais simples para o proxy do CapRover. Para desenvolvimento local, use `PORT=3007` no `.env` ou no `docker-compose.yml`.

## Seguranca

- Troque `ADMIN_PASSWORD`, `SESSION_SECRET` e `API_KEY` antes do deploy.
- Prefira configurar a API Key da OpenAI por variavel de ambiente ou secret do CapRover. A tela de configuracoes salva a chave no SQLite para facilitar o MVP.
- Use HTTPS em producao.
- Guarde as API Keys de integracao com seguranca.
- Desative integracoes que nao devem mais receber chamadas.
- A persistencia usa SQLite em `/app/data/laudos.sqlite`. Para alto volume, evolua a camada `src/db.js` para PostgreSQL mantendo o mesmo modelo de entidades.

## Estrutura

```text
src/
  auth.js
  config.js
  db.js
  reportGenerator.js
  server.js
public/
  app.js
  index.html
  styles.css
Dockerfile
docker-compose.yml
.env.example
```
