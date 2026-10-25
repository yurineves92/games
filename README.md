# Super Neon

A revista de games estilo anos 90 que vem com jogo: cada edição tem capa, análises com notas, códigos secretos, detonado, cartas dos leitores, classificados e um **CD-ROM** com jogos completos que rodam no navegador.

Tudo é HTML, CSS e JavaScript puro, sem build e sem dependências, publicado no GitHub Pages.

**Ler e jogar:** https://yurineves92.github.io/games/

## Edições

| Nº | Capa | Jogos no CD-ROM |
|---|---|---|
| 1 | Quadrix | Quadrix, Snake, Fruit Ninja, Flappy Bird |
| 2 | Invasores | Invasores, Paredão, Pong |
| 3 | Come-Come | Come-Come, Travessia, Campo Minado |
| 4 (especial) | Turbo Neon | Turbo Neon, Super Pixel |

## Códigos secretos

Cada jogo tem códigos (listados na seção Dicas & Macetes de cada edição). Para usar, digite o código na caixa **CÓDIGO SECRETO** do menu do jogo. O código `KONAMI` também vale pela sequência ↑ ↑ ↓ ↓ ← → ← → B A no teclado, com o menu aberto. Com código ligado, o recorde não é salvo e o placar não vai para o ranking.

## Hall da Fama (ranking global com Firebase)

O ranking usa o Firestore no plano gratuito (Spark). Enquanto ele não estiver configurado, os jogos funcionam normalmente com o recorde salvo no navegador.

A configuração do Firebase **não fica no repositório**. Ela é guardada nos *secrets* do GitHub, e o workflow [`pages.yml`](.github/workflows/pages.yml) escreve o `shared/firebase-config.js` só na hora de publicar.

### 1. Criar o projeto e o banco
1. Em https://console.firebase.google.com, clique em **Criar um projeto**. Pode desligar o Google Analytics.
2. Abra **Criação → Firestore Database → Criar banco de dados**, escolha o local `southamerica-east1` (São Paulo) e o **modo de produção**.
3. Na aba **Regras** do Firestore, cole o conteúdo de [`firestore.rules`](firestore.rules) e clique em **Publicar**.
4. Em **⚙ Configurações do projeto → Geral → Seus apps**, clique em **Web `</>`** e registre o app (sem Firebase Hosting). Deixe aberta a tela com o `firebaseConfig`.

### 2. Guardar a configuração nos secrets do GitHub
No repositório, abra **Settings → Secrets and variables → Actions → New repository secret** e crie os quatro secrets abaixo, copiando os valores do `firebaseConfig` sem as aspas:

| Secret | Valor do `firebaseConfig` |
|---|---|
| `FIREBASE_API_KEY` | `apiKey` |
| `FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `FIREBASE_PROJECT_ID` | `projectId` |
| `FIREBASE_APP_ID` | `appId` |
| `FIREBASE_DATABASE_URL` | URL do Realtime Database (contador de leitores online) |

Depois, em **Actions → Publicar no GitHub Pages → Run workflow**, rode a publicação de novo, ou só faça um push.

### 3. Trancar a chave no seu domínio (recomendado)
Num site estático, o navegador precisa receber a configuração para falar com o Firebase. Por isso ela nunca é 100% secreta no site publicado, só fica fora do código. Para que ninguém use a chave em outro site:

1. Abra https://console.cloud.google.com/apis/credentials (no projeto do Firebase).
2. Clique na chave **Browser key (auto created by Firebase)**.
3. Em **Restrições de aplicativo**, escolha **Sites** e adicione `https://yurineves92.github.io/*`. Para testar localmente, adicione também `http://localhost:*/*`.
4. Salve.

As regras do [`firestore.rules`](firestore.rules) completam a proteção: elas permitem ler o ranking e criar placares novos (3 letras/números e uma pontuação inteira), mas não deixam editar nem apagar nada.

### 4. Contador de leitores online (Realtime Database)
A banca e as edições mostram quantas pessoas estão no site agora, e cada jogo mostra quantas estão jogando. Isso usa o **Realtime Database** do mesmo projeto:

1. No console do Firebase, abra **Criação → Realtime Database → Criar banco de dados** e escolha o **modo bloqueado**.
2. Na aba **Regras**, cole o conteúdo de [`database.rules.json`](database.rules.json) e publique. As regras deixam cada visitante criar e apagar só a própria marca de presença.
3. Crie o secret `FIREBASE_DATABASE_URL` com a URL do banco (algo como `https://SEU-PROJETO-default-rtdb.firebaseio.com`).

O plano gratuito aceita até 100 conexões simultâneas. Acima disso, o contador para de subir, mas o site continua funcionando.

Os placares ficam em `ranking/{jogo-modo}/scores`. O plano gratuito permite 50 mil leituras e 20 mil gravações por dia.

## Estrutura

```
index.html                 banca: as 4 capas e o Hall da Fama
edicoes/NN/index.html      a revista (capa, análises, dicas, detonado, cartas, classificados, CD-ROM)
edicoes/NN/arte.svg        arte da capa
edicoes/NN/prints/         capturas de tela usadas nas análises
revista/revista.css        visual de revista dos anos 90
revista/edicoes.js         dados das capas e catálogo de jogos
revista/revista.js         capas, CD-ROM estilo Windows 95, Hall da Fama, navegação
jogos/<jogo>/              cada jogo (index.html + .js)
shared/common.js           sons sintetizados, canvas, joystick na tela, controle, códigos secretos
shared/ranking.js          Hall da Fama (Firestore) e carregador do SDK do Firebase
shared/presenca.js         leitores online e "jogando agora" (Realtime Database)
shared/firebase-config.js  configuração do Firebase (gerada no deploy a partir dos secrets)
shared/style.css           visual neon das telas de jogo
firestore.rules            regras de segurança do ranking
database.rules.json        regras do contador de leitores online
.github/workflows/pages.yml publicação no GitHub Pages
```

## Rodar localmente

```bash
python -m http.server 8000
```

Depois abra http://localhost:8000.

Fan games não oficiais, sem fins lucrativos. Fruit Ninja (Halfbrick), Flappy Bird e os clássicos que inspiraram os jogos são marcas de seus respectivos donos.
