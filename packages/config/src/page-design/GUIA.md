# Guia de design da página de exemplo

Você vai escrever a landing page de exemplo de um negócio local brasileiro. A página é um modelo que o Gabriel mostra ao dono do negócio, para ele ver como poderia ficar o site.

## O que você recebe nesta pasta

- `brief.json`: dados do negócio, fluxo (`sem_site` ou `melhorar_site`), motivo (só no fluxo `melhorar_site`), avaliações, cores do site atual quando houver, logo, fotos e a lista do material.
- `material/`: textos extraídos dos links e arquivos que o Gabriel juntou sobre o negócio.
- `index.html`, quando já existir: a versão anterior da página. Parta dela.

## O que entregar

Um único arquivo `index.html` nesta pasta:

- HTML completo, com `<!doctype html>`, `<html lang="pt-BR">`, `<meta charset="utf-8">` e `<meta name="viewport" content="width=device-width, initial-scale=1">`.
- CSS próprio, dentro de `<style>`. Pode usar fontes do Google Fonts.
- Sem JavaScript: nenhum `<script>`, nenhum atributo `on...` e nenhum link `javascript:`.
- Nada carregado de fora, além das URLs de imagem do `brief.json` e do Google Fonts.
- Textos em português do Brasil, com frases curtas, claras e sem exagero.

## Seções

Nesta ordem, e só quando houver dado para elas. Seção sem dado some.

1. **Topo:** o nome do negócio, o que ele faz em uma frase e um botão de WhatsApp (`https://wa.me/<telefone só com dígitos>`).
2. **Espaço do vídeo:** um elemento `<div data-slot="video"></div>` logo abaixo do topo, vazio. O servidor coloca o vídeo ali. Não ponha nada dentro dele.
3. **Serviços:** só os citados nos dados, com as mesmas palavras.
4. **Sobre:** um parágrafo curto, só com o que está nos dados.
5. **Fotos.**
6. **Avaliações:** texto e estrelas. Sem nome de autor.
7. **Localização:** endereço e cidade.
8. **Contato:** o telefone escrito por extenso e o botão de WhatsApp de novo.

## Fatos

- Use só o que está em `brief.json` e em `material/`.
- Nunca invente preço, certificação, prêmio, garantia, anos de experiência, número de clientes ou serviços.
- Não use "melhor", "líder", "especialista", "premiado" ou parecidos, a menos que a palavra apareça nos dados.
- O nome do negócio e o telefone precisam aparecer como texto visível na página.

## Fotos

- Use só as URLs de `fotos` e `logo` do `brief.json`, exatamente como estão.
- Com menos de 3 fotos, use formas, cores e tipografia no lugar das fotos. Nada de fotos de banco.
- Toda imagem tem `alt` em português e não pode estourar a largura da tela (`max-width: 100%`).

## Celular primeiro

- Legível a partir de 360 px de largura, sem rolagem horizontal em 390 px nem em 1280 px.
- Botões e links clicáveis com pelo menos 44 px de altura.
- Texto do corpo com pelo menos 16 px.

## Marca

- Use a cor do site atual (`site_atual.cor`) ou do logo, quando houver.
- Senão, escolha uma paleta coerente com o tipo de negócio, com bom contraste.
- Cada página deve ter um desenho próprio, pensado para aquele negócio.

## Aviso fixo

No rodapé, sempre: "Modelo preparado por [nome comercial]. Ainda não publicado." O nome comercial vem no pedido.
