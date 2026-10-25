# Neon Arcade

Três jogos fan-made feitos só com HTML, CSS e JavaScript puro.
Sem build, sem dependências, sem servidor: tudo roda no GitHub Pages.

**Jogar:** https://yurineves92.github.io/games/

| Jogo | Pasta | Resumo |
|---|---|---|
| **Snake** | `snake/` | O clássico da cobrinha com visual neon. Maçãs, estrela bônus que some, 3 velocidades e bordas sólidas ou atravessáveis. |
| **Fruit Ninja** | `fruit-ninja/` | Fatie as frutas no ar com o dedo ou o mouse. Combos, bombas e três modos: Clássico, Arcade (60 s) e Zen (90 s, sem bombas). |
| **Flappy Bird** | `flappy-bird/` | Um toque, uma batida de asas. Canos infinitos, cenário de dia ou de noite, três cores de pássaro e medalhas. |

Os recordes ficam salvos no navegador (`localStorage`).

## Controles

**Snake**
- Setas ou `WASD` para virar
- Celular: deslize o dedo sobre o jogo ou use o joystick na tela (o botão 🎮 mostra/esconde)
- Controle de videogame: direcional ou analógico, `Start` pausa

**Fruit Ninja**
- Arraste o dedo, ou o mouse com o botão pressionado, para cortar
- Controle de videogame: analógico move a lâmina, segure `A`/`RT` para cortar

**Flappy Bird**
- `Espaço`, `↑`, `W`, clique ou toque para voar
- Controle de videogame: `A` voa

Em todos: `P`/`Esc` pausa, `M` liga/desliga o som.

## Rodar localmente

```bash
python -m http.server 8000
```

Depois abra http://localhost:8000.

## Estrutura

```
index.html                 menu principal
shared/style.css           estilo neon compartilhado
shared/common.js           sons sintetizados (Web Audio), ajuste do canvas, joystick, controle, armazenamento
snake/                     Snake (grade, interpolação suave, demo automática no menu)
fruit-ninja/               Fruit Ninja (frutas desenhadas no canvas, física, combos)
flappy-bird/               Flappy Bird (física em passo fixo, cenário em parallax)
```

Fan games não oficiais, sem fins lucrativos. Fruit Ninja é marca da Halfbrick; Flappy Bird pertence aos seus respectivos donos.
