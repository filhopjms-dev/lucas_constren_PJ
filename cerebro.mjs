// O CÉREBRO DO LUCAS TAVARES.
//
// Recebe o contexto da conversa e as ferramentas, e devolve UMA decisão:
// responder, transferir ou calar. Não manda mensagem, não escreve no banco e não
// liga nada: isso é do arcabouço do Trilho, que confere antes de deixar sair.
//
// ⚠️ ESTE ARQUIVO E O PROMPT NUNCA ENTRAM NO REPOSITÓRIO DO TRILHO. O prompt é
// propriedade do Paulo. Lá dentro fica só um carteiro, que manda o contexto para
// cá e recebe a decisão de volta.
//
// A assinatura é a do contrato do Jânio (src/lib/ia/contrato.ts), de propósito:
// o dia em que isto virar serviço, o que muda é o transporte, não o miolo.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const AQUI = path.dirname(fileURLToPath(import.meta.url));

// O QUE ESTÁ NO AR mora em `dados/`, e é o que a tela edita. As versões
// numeradas que o Paulo guarda na pasta de cima são o arquivo morto, do mesmo
// jeito que o Paulo André tem os .txt guardados e o que vale é o que está
// colado na tela. Ter as duas coisas no mesmo lugar já fez o agente rodar com
// uma versão que ninguém tinha escolhido.
export const PASTA = path.join(AQUI, "dados");
export const PASTA_DA_BASE = path.join(PASTA, "base");
export const ARQUIVO_DO_PROMPT = path.join(PASTA, "prompt.txt");

// ---------------------------------------------------------------- os números

// Sonnet por causa do relógio: o Trilho dá 25 s para pensar, dentro de uma função
// de 60 s na Vercel, e ainda vai somar o salto até o nosso servidor. O Paulo
// André roda Opus sem prazo apertado; aqui a pressa é requisito.
export const MODELO = process.env.LUCAS_MODELO || "claude-sonnet-5-5";

// ⚠️ ESTE TETO CONTA O PENSAMENTO, NÃO SÓ A RESPOSTA.
//
// No Sonnet 5.5 o pensamento vem ligado por padrão e é cobrado como saída, então
// ele divide este orçamento com o texto. Com 900, um turno mais difícil gastava
// tudo pensando e devolvia texto VAZIO: o cliente confirmava dia e hora da visita
// e recebia silêncio. Medido: o turno que falhou gastou exatamente 900; o mesmo
// turno, repetido, coube em 747 e funcionou. Defeito intermitente, dos piores.
//
// Subir o teto não faz o modelo pensar mais: o pensamento é adaptativo e usa o
// que precisa. O teto só deixa de cortar no meio. A brevidade da resposta quem
// garante é o prompt, e a trava de 1.000 caracteres logo abaixo.
const MAXIMO_DE_TOKENS = 2400;

// O freio do laço. Cada volta é uma ida à API, e o relógio é de 25 s.
const MAXIMO_DE_VOLTAS = 6;

// O que a trava de saída do Trilho aceita numa mensagem. Passar disso é resposta
// barrada, então é melhor descobrir aqui.
const MAXIMO_DE_CARACTERES = 1000;

// QUANTAS FERRAMENTAS CABEM NUMA VOLTA, e por que o número é o dele.
//
// O carteiro do Trilho recusa mais de oito numa volta só. A regra é dele e é
// certa: cada ferramenta é uma consulta ao banco de produção da Constren, e sem
// teto quem decidia quantas consultas aquele banco leva por mensagem do cliente
// era este serviço aqui, de fora.
//
// O teto está repetido deste lado para o robô não pedir o que vai ser recusado.
// Se a recusa acontecer lá, o motivo chega ao carteiro e não a nós, e quem lê o
// registro da rodada vê uma conversa transferida sem saber por quê. Batendo
// aqui, a transferência sai com o motivo escrito por extenso.
const MAXIMO_DE_FERRAMENTAS_POR_VOLTA = 8;

// ---------------------------------------------------------------- o prompt

// Lido do disco a cada partida do processo, não a cada conversa: são dezenas de
// milhares de caracteres e eles não mudam no meio do expediente.
export function documentosDaBase() {
  if (!fs.existsSync(PASTA_DA_BASE)) return [];
  return fs.readdirSync(PASTA_DA_BASE).filter((f) => f.toLowerCase().endsWith(".txt")).sort();
}

function montarSistemaFixo() {
  const prompt = fs.readFileSync(ARQUIVO_DO_PROMPT, "utf8").trim();
  const base = documentosDaBase()
    .map((f) => `### ${f.replace(/\.txt$/i, "")}\n\n${fs.readFileSync(path.join(PASTA_DA_BASE, f), "utf8").trim()}`)
    .join("\n\n");
  return base ? `${prompt}\n\n#Base de Conhecimento\n\n${base}` : prompt;
}

// O pedaço que NÃO muda entre uma conversa e outra fica separado do que muda,
// porque só ele pode ser guardado em cache pela API. Juntar a hora atual aqui
// invalidaria o cache a cada mensagem, e o prompt inteiro voltaria a ser cobrado
// como entrada nova.
let sistemaFixo = null;
export function invalidarPrompt() { sistemaFixo = null; }
const obterSistemaFixo = () => (sistemaFixo ??= montarSistemaFixo());

// O que muda a cada mensagem. Curto de propósito.
function sistemaDaVez(contexto) {
  const linhas = [`Agora é ${contexto.agora.porExtenso}, no horário de Aracaju.`];

  const c = contexto.contato ?? {};
  if (c.faltaNome) linhas.push("Ainda não sabemos o nome do cliente. Pergunte em algum momento natural da conversa, nunca como formulário e nunca na primeira frase.");
  else if (c.nome) linhas.push(`O cliente se chama ${c.nome}.`);

  const l = contexto.lead;
  if (l) {
    const d = [];
    if (l.empreendimento) d.push(`o cadastro dele aponta interesse no ${l.empreendimento}`);
    if (l.etapa) d.push(`a etapa dele no funil é "${l.etapa}"`);
    if (l.corretor) d.push(`o corretor responsável é ${l.corretor}`);
    if (d.length) linhas.push(`Sobre este cliente: ${d.join(", ")}. Isso é informação interna: não recite nada disso para ele.`);
  } else {
    linhas.push("Esta conversa ainda não tem cadastro no funil, então as ferramentas que gravam não têm onde registrar.");
  }

  return linhas.join("\n");
}

// ------------------------------------------------------- as duas decisões

// TRANSFERIR E CALAR SÃO FERRAMENTAS, E NÃO UMA MARCA NO TEXTO.
//
// No CRM da Arcos o encerramento é "não gere nada", e o prompt precisa de um
// parágrafo inteiro proibindo o modelo de escrever "(sem resposta)", "(silêncio)"
// e variações, porque ele escrevia. Pedir ausência a um modelo de texto é pedir o
// que ele não sabe fazer. Uma ferramenta ele sabe chamar.
//
// ⚠️ A MENSAGEM AO CLIENTE É OBRIGATÓRIA NA TRANSFERÊNCIA, e o contrato do Trilho
// a deixa opcional de propósito, para quem quiser. Aqui não: quando o modelo
// chama a ferramenta, o laço termina ali e ele nunca mais escreve texto. Opcional,
// ele simplesmente não preenchia, e a conversa terminava no pior momento possível:
// o cliente acabava de confirmar dia e hora da visita e ficava sem uma palavra.
// Quem é transferido está esperando alguma coisa; ficar calado é abandoná-lo.
const DECIDIR = [
  {
    name: "transferir_para_equipe",
    description:
      "Passa o atendimento para uma pessoa da equipe e cala o robô nesta conversa. Use nos casos que o prompt manda transferir.",
    input_schema: {
      type: "object",
      properties: {
        motivo: { type: "string", description: "Para a EQUIPE ler, não para o cliente. Diga o que ela precisa saber para continuar sem perguntar tudo de novo." },
        mensagem_ao_cliente: { type: "string", description: "O que o CLIENTE vai ler. No seu tom, curto, e sem prometer prazo de retorno. Se você acabou de combinar alguma coisa com ele, confirme o que ficou combinado aqui." },
      },
      required: ["motivo", "mensagem_ao_cliente"],
      additionalProperties: false,
    },
  },
  {
    name: "encerrar_sem_responder",
    description:
      "Não responde nada. Use quando a mensagem do cliente não pede resposta: ele se despediu, agradeceu, mandou um 'ok', ou mandou figurinha sem haver oferta ativa. Um corretor humano lê e não responde, e a última palavra não precisa ser sua.",
    input_schema: {
      type: "object",
      properties: { motivo: { type: "string", description: "Por que não cabe resposta." } },
      required: ["motivo"],
      additionalProperties: false,
    },
  },
];

// ---------------------------------------------------------------- pensar

const cliente = new Anthropic();

const textoDe = (r) => r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();

const sistemaPara = (contexto) => [
  { type: "text", text: obterSistemaFixo(), cache_control: { type: "ephemeral" } },
  { type: "text", text: sistemaDaVez(contexto) },
];

const usoDa = (r) => ({ modelo: MODELO, ...r.usage });

// O QUE A RESPOSTA DA API QUER DIZER, num lugar só.
//
// Devolve `decisao` quando o turno acabou, ou `chamadas` quando o modelo quer
// ferramenta. Está separado do laço porque quem roda o laço muda: em
// desenvolvimento é o `pensar` aqui embaixo; em produção é o carteiro do Trilho,
// uma volta por requisição. A leitura tem de ser a mesma nos dois.
function interpretar(r) {
  if (r.stop_reason !== "tool_use") {
    const texto = textoDe(r);

    // BATER NO TETO NÃO É DECIDIR CALAR, E CONFUNDIR OS DOIS CUSTA CARO.
    //
    // Calar é uma decisão do robô, tomada quando a mensagem não pede resposta.
    // Bater no teto é o orçamento acabando no meio, e o que sobra é metade de
    // uma frase ou nada. Tratar isso como silêncio deixou um cliente que tinha
    // acabado de confirmar dia e hora de visita sem uma palavra. Aqui a conversa
    // vai para a equipe, que é o desfecho certo para um turno que não terminou.
    if (r.stop_reason === "max_tokens") {
      return {
        decisao: {
          tipo: "transferir",
          motivo: "o robô estourou o orçamento de resposta no meio do turno, então o que ele escreveu não vale",
          mensagemAoCliente: "Vou chamar alguém da equipe para te responder isso.",
        },
      };
    }

    if (!texto) return { decisao: { tipo: "calar", motivo: `o modelo não escreveu nada (parou por ${r.stop_reason})` } };
    if (texto.length > MAXIMO_DE_CARACTERES) {
      // Cortar calado entregaria meia frase ao cliente, e a trava de saída do
      // Trilho barraria a resposta de qualquer jeito.
      return { decisao: { tipo: "transferir", motivo: `o robô escreveu uma resposta longa demais (${texto.length} caracteres) para o WhatsApp`, mensagemAoCliente: "Vou chamar alguém da equipe para te explicar isso direito." } };
    }
    // UMA mensagem, sempre. O arcabouço aceita até três, mas a regra do Lucas,
    // herdada do Paulo André, é uma resposta, uma mensagem, uma ideia.
    return { decisao: { tipo: "responder", mensagens: [texto] } };
  }

  const chamadas = [];
  for (const bloco of r.content) {
    if (bloco.type !== "tool_use") continue;
    if (bloco.name === "transferir_para_equipe") {
      const m = typeof bloco.input?.mensagem_ao_cliente === "string" ? bloco.input.mensagem_ao_cliente.trim() : "";
      return {
        decisao: {
          tipo: "transferir",
          motivo: String(bloco.input?.motivo ?? "sem motivo declarado"),
          ...(m ? { mensagemAoCliente: m } : {}),
        },
      };
    }
    if (bloco.name === "encerrar_sem_responder") {
      return { decisao: { tipo: "calar", motivo: String(bloco.input?.motivo ?? "a mensagem não pedia resposta") } };
    }
    chamadas.push({ id: bloco.id, nome: bloco.name, entrada: bloco.input ?? {} });
  }
  // Parou por ferramenta e não pediu nenhuma que exista: não há o que executar,
  // e insistir seria laço.
  if (!chamadas.length) return { decisao: { tipo: "transferir", motivo: "o robô pediu uma ferramenta que não existe" , mensagemAoCliente: "Vou chamar alguém da equipe para te ajudar com isso." } };
  if (chamadas.length > MAXIMO_DE_FERRAMENTAS_POR_VOLTA) {
    return {
      decisao: {
        tipo: "transferir",
        motivo: `o robô pediu ${chamadas.length} ferramentas numa volta só, e o limite é ${MAXIMO_DE_FERRAMENTAS_POR_VOLTA}`,
        mensagemAoCliente: "Vou chamar alguém da equipe para te ajudar com isso.",
      },
    };
  }
  return { chamadas, conteudo: r.content };
}

// O LAÇO INTEIRO AQUI DENTRO. Serve ao ensaio da máquina de desenvolvimento, que
// tem as ferramentas à mão. Em produção quem roda o laço é o carteiro, porque as
// ferramentas leem o banco da Constren e só existem lá.
export async function pensar(contexto, ferramentas, sinal) {
  const sistema = sistemaPara(contexto);
  const ferramentasDaApi = [...ferramentas.definicoes, ...DECIDIR];
  const mensagens = [...contexto.turnos];

  for (let volta = 0; volta < MAXIMO_DE_VOLTAS; volta++) {
    const r = await cliente.messages.create(
      { model: MODELO, max_tokens: MAXIMO_DE_TOKENS, system: sistema, tools: ferramentasDaApi, messages: mensagens },
      { signal: sinal },
    );
    // O gasto entra no teto do mês a CADA chamada, e não só no fim: se a volta
    // seguinte estourar o prazo ou a API cair, o que já foi gasto continua gasto.
    ferramentas.anotarUso(usoDa(r));

    const lido = interpretar(r);
    if (lido.decisao) return lido.decisao;

    mensagens.push({ role: "assistant", content: lido.conteudo });
    const resultados = [];
    for (const c of lido.chamadas) {
      resultados.push({ type: "tool_result", tool_use_id: c.id, content: await ferramentas.executar(c.nome, c.entrada) });
    }
    mensagens.push({ role: "user", content: resultados });
  }

  return { tipo: "transferir", motivo: `o robô não chegou a uma resposta em ${MAXIMO_DE_VOLTAS} voltas`, mensagemAoCliente: "Vou chamar alguém da equipe para te responder isso." };
}

// UMA VOLTA SÓ, para o carteiro do Trilho.
//
// O Trilho manda o contexto na primeira chamada e, nas seguintes, devolve o
// ESTADO que veio daqui mais os resultados das ferramentas que ele executou. O
// estado é opaco do lado de lá: ele guarda e devolve, sem ler. É aqui que mora a
// conversa montada do nosso jeito.
//
// ⚠️ O PROMPT NUNCA ENTRA NO ESTADO. Ele é remontado do disco a cada chamada e
// vive só nesta máquina. O que viaja é a conversa e o que as ferramentas
// responderam, que o Trilho já tem.
export async function pensarUmPasso({ contexto, definicoes, estado, resultados }, sinal) {
  const anterior = estado && typeof estado === "object" ? estado : null;
  const voltas = (anterior?.voltas ?? 0) + 1;
  if (voltas > MAXIMO_DE_VOLTAS) {
    return { decisao: { tipo: "transferir", motivo: `o robô não chegou a uma resposta em ${MAXIMO_DE_VOLTAS} voltas`, mensagemAoCliente: "Vou chamar alguém da equipe para te responder isso." } };
  }

  const ctx = anterior?.contexto ?? contexto;
  if (!ctx?.turnos) throw new Error("faltou o contexto na primeira chamada");

  const mensagens = anterior ? [...anterior.mensagens] : [...ctx.turnos];
  if (anterior && Array.isArray(resultados)) {
    mensagens.push({
      role: "user",
      content: resultados.map((r) => ({ type: "tool_result", tool_use_id: r.id, content: String(r.texto ?? "") })),
    });
  }

  const r = await cliente.messages.create(
    {
      model: MODELO,
      max_tokens: MAXIMO_DE_TOKENS,
      system: sistemaPara(ctx),
      tools: [...(definicoes ?? anterior?.definicoes ?? []), ...DECIDIR],
      messages: mensagens,
    },
    { signal: sinal },
  );

  const uso = usoDa(r);
  const lido = interpretar(r);
  if (lido.decisao) return { decisao: lido.decisao, uso };

  return {
    ferramentas: lido.chamadas,
    // O contexto e as definições ficam guardados aqui para o Trilho não precisar
    // repetir os dois a cada volta: ele devolve o estado e pronto.
    estado: {
      voltas,
      contexto: ctx,
      definicoes: definicoes ?? anterior?.definicoes ?? [],
      mensagens: [...mensagens, { role: "assistant", content: lido.conteudo }],
    },
    uso,
  };
}

export const CEREBRO_INSTALADO = true;
