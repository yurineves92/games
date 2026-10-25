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

Cada jogo tem códigos (listados na seção Dicas & Macetes de cada edição). Para usar, digite o código na caixa **CÓDIGO SECRETO** do menu do jogo ou direto no teclado. O código `KONAMI` também vale pela sequência ↑ ↑ ↓ ↓ ← → ← → B A. Com código ligado, o recorde não é salvo e o placar não vai para o ranking.

## Hall da Fama (ranking global com Firebase)

O ranking usa o Firestore no plano gratuito (Spark). Enquanto ele não estiver configurado, os jogos funcionam normalmente com o recorde salvo no navegador.

1. Entre em https://console.firebase.google.com e clique em **Adicionar projeto** (pode desligar o Google Analytics).
2. No menu **Criação → Firestore Database**, clique em **Criar banco de dados**. Escolha um local (por exemplo `southamerica-east1`, São Paulo) e o **modo de produção**.
3. Na aba **Regras** do Firestore, apague tudo, cole o conteúdo do arquivo [`firestore.rules`](firestore.rules) e clique em **Publicar**.
4. Em **Configurações do projeto (engrenagem) → Geral → Seus apps**, clique no ícone **Web `</>`**, dê um apelido (ex.: `super-neon`) e registre o app. Não precisa do Firebase Hosting.
5. Copie os valores `apiKey`, `authDomain`, `projectId` e `appId` que aparecem e cole em [`shared/firebase-config.js`](shared/firebase-config.js).
6. Faça commit e push. Pronto: no fim de cada partida aparece o placar TOP 10 e a caixa para gravar as iniciais.

A `apiKey` do Firebase para web não é segredo: ela só identifica o projeto, e quem protege os dados são as regras do `firestore.rules`. Elas permitem ler o ranking e criar placares novos (3 letras/números e uma pontuação inteira), mas não deixam editar nem apagar nada.

Os placares ficam em `ranking/{jogo-modo}/scores`. O plano gratuito permite 50 mil leituras e 20 mil gravações por dia, o que sobra para um site como este.

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
shared/ranking.js          Hall da Fama (Firestore)
shared/firebase-config.js  configuração do Firebase (cole aqui a sua)
shared/style.css           visual neon das telas de jogo
firestore.rules            regras de segurança do ranking
```

## Rodar localmente

```bash
python -m http.server 8000
```

Depois abra http://localhost:8000.

Fan games não oficiais, sem fins lucrativos. Fruit Ninja (Halfbrick), Flappy Bird e os clássicos que inspiraram os jogos são marcas de seus respectivos donos.
