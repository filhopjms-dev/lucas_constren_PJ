// PROVA DO LIVRO DE CONSUMO. Não chama a Anthropic: monta a resposta como ela
// chega e confere o que foi gravado.
//
// O que mais importa aqui não é "gravou": é que o arquivo NÃO contenha o
// telefone do cliente nem texto nenhum. Essa asserção é a razão de o teste
// existir, e ela está escrita de forma a FALHAR se alguém um dia trocar o
// resumo pelo número achando que facilita a consulta.
import fs from "node:fs";
import crypto from "node:crypto";
import { anotar, ARQUIVO } from "./livro-de-consumo.mjs";

const antes = fs.existsSync(ARQUIVO) ? fs.readFileSync(ARQUIVO, "utf8") : null;
const falhas = [];
const confere = (nome, condicao, detalhe = "") => {
  if (condicao) console.log(`  ok    ${nome}`);
  else { console.log(`  FALHA ${nome}  ${detalhe}`); falhas.push(nome); }
};

const TELEFONE = "(79) 99113-8313";
const DIGITOS = "79991138313";
const SEGREDO = "Você é o Lucas Tavares, corretor da Constren";

const respostaFalsa = {
  model: "claude-sonnet-5-5",
  stop_reason: "tool_use",
  usage: { input_tokens: 1000, output_tokens: 200, cache_creation_input_tokens: 5000, cache_read_input_tokens: 20000 },
  content: [{ type: "text", text: SEGREDO }],
};

const contextoFalso = { contato: { nome: "Fulano", telefone: TELEFONE }, turnos: [{ role: "user", content: SEGREDO }] };

try {
  fs.rmSync(ARQUIVO, { force: true });

  anotar({ resposta: respostaFalsa, origem: "carteiro", volta: 1, contexto: contextoFalso, comecouEm: Date.now() - 3400 });

  const bruto = fs.readFileSync(ARQUIVO, "utf8");
  const l = JSON.parse(bruto.trim().split("\n").pop());

  console.log("\n  O QUE FOI GRAVADO\n");
  confere("origem separa atendimento de ensaio", l.origem === "carteiro", `veio ${l.origem}`);
  confere("volta registrada", l.volta === 1, `veio ${l.volta}`);
  confere("tokens de entrada", l.entrada === 1000, `veio ${l.entrada}`);
  confere("tokens de saida", l.saida === 200, `veio ${l.saida}`);
  confere("escrita de cache", l.cache_escrito === 5000, `veio ${l.cache_escrito}`);
  confere("leitura de cache", l.cache_lido === 20000, `veio ${l.cache_lido}`);
  confere("motivo da parada", l.parada === "tool_use", `veio ${l.parada}`);
  confere("duracao medida", l.seg >= 3.3 && l.seg <= 3.6, `veio ${l.seg}`);
  confere("quando em ISO", /^\d{4}-\d{2}-\d{2}T/.test(l.quando), `veio ${l.quando}`);

  console.log("\n  O QUE NÃO PODE ESTAR LÁ  (a razão deste teste existir)\n");
  // ⚠️ CONTROLE NEGATIVO. Se estas três passassem com o arquivo vazio, elas não
  // provariam nada -- por isso a de cima confere que o resumo ESTÁ presente.
  // Uma asserção de ausência só vale acompanhada de uma de presença.
  const resumo = crypto.createHash("sha256").update(DIGITOS).digest("hex").slice(0, 12);
  confere("a marca da conversa está presente", bruto.includes(resumo), "sem ela, as ausências abaixo não provam nada");
  confere("o telefone NÃO está no arquivo", !bruto.includes(DIGITOS) && !bruto.includes("99113"), "VAZOU TELEFONE DE CLIENTE");
  confere("o texto do prompt NÃO está no arquivo", !bruto.includes("Lucas Tavares"), "VAZOU TEXTO DO PROMPT");
  confere("o nome do cliente NÃO está no arquivo", !bruto.includes("Fulano"), "VAZOU DADO DO CLIENTE");
  // ⚠️ Confere o valor GRAVADO (l.conversa), nunca o `resumo` calculado aqui em
  // cima: a primeira versão desta linha olhava a variável do próprio teste e
  // passava verde mesmo com o telefone cru no arquivo.
  confere("a marca gravada não é o telefone", l.conversa?.length === 12 && !/^\d+$/.test(l.conversa), `veio ${l.conversa}`);

  console.log("\n  NÃO PODE DERRUBAR O ATENDIMENTO\n");
  let explodiu = false;
  try {
    anotar({ resposta: null, origem: "carteiro", volta: 2, contexto: null, comecouEm: null });
    anotar({ resposta: { usage: {} }, origem: "ensaio", volta: 1, contexto: { contato: {} }, comecouEm: null });
  } catch { explodiu = true; }
  confere("resposta nula e contexto nulo não lançam", !explodiu);
  const todas = fs.readFileSync(ARQUIVO, "utf8").trim().split("\n");
  confere("as três linhas foram escritas", todas.length === 3, `vieram ${todas.length}`);
  confere("conversa sem telefone vira nulo", JSON.parse(todas[1]).conversa === null);

  console.log("\n  A CONTA\n");
  // Conferida na mão, em dólar por milhão: entrada 2,00 / saída 10,00 /
  // escrita de cache 2,50 / leitura de cache 0,20.
  const esperado = (1000 * 2 + 200 * 10 + 5000 * 2.5 + 20000 * 0.2) / 1_000_000;
  const { execSync } = await import("node:child_process");
  const saida = execSync("node consumo.mjs 1", { cwd: import.meta.dirname, encoding: "utf8" });
  confere("o relatório roda", saida.includes("ONDE O DINHEIRO ESTÁ"));
  confere(`o custo bate com a conta à mão (${esperado.toFixed(4)})`, saida.includes(esperado.toFixed(4)), "o relatório não mostrou esse valor");
  confere("separa atendimento de ensaio no total", /ATENDIMENTO DE VERDADE: 1 rodada/.test(saida), "contou rodada errada");
} finally {
  if (antes === null) fs.rmSync(ARQUIVO, { force: true });
  else fs.writeFileSync(ARQUIVO, antes, "utf8");
}

console.log(falhas.length ? `\n  ${falhas.length} FALHA(S): ${falhas.join(", ")}\n` : "\n  NADA FALHOU\n");
process.exit(falhas.length ? 1 : 0);
