// AS FERRAMENTAS DO TRILHO, SIMULADAS AQUI, COM DADO DE VERDADE.
//
// As definições NÃO são cópia: são lidas do código do Trilho, para o modelo ver
// exatamente a mesma descrição que vai ver em produção. Descrição de ferramenta
// é metade do prompt, e uma cópia envelhecida daria um ensaio que não ensaia.
//
// As respostas vêm de `capturas/ensaio-ferramentas.json`, capturado em 29/09/2026
// pelo ensaio do Trilho, em produção, com o espelho de vendas real. Junto delas
// vêm os `conhecidos`, que é contra o que a conferência da saída confere.
//
// As ferramentas que ESCREVEM devolvem aqui a mesma frase que devolvem lá, e não
// gravam nada: aqui não há banco.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const TRILHO = process.env.LUCAS_TRILHO || "C:/Users/paulo/trilho";

const jiti = createJiti(import.meta.url, { alias: { "@/": path.join(TRILHO, "src") + "/" } });

// `criarFerramentas` não toca no banco ao ser construída, então o `null` basta
// para chegar até as definições.
const { criarFerramentas } = await jiti.import(path.join(TRILHO, "src/lib/ia/ferramentas.ts"));
export const DEFINICOES = criarFerramentas(null, { preCadastroId: null, ensaio: true }).definicoes;

export const { conferirSaida } = await jiti.import(path.join(TRILHO, "src/lib/ia/saida.ts"));

const capturas = JSON.parse(fs.readFileSync(path.join(AQUI, "capturas", "ensaio-ferramentas.json"), "utf8"));

const semAcento = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function acharCaptura(nome, entrada) {
  const emp = semAcento(entrada?.empreendimento);
  return capturas.find((c) => {
    if (c.ferramenta !== nome) return false;
    if (nome === "consultar_empreendimentos") return true;
    if (!emp) return false;
    const dela = semAcento(c.entrada?.empreendimento);
    if (!dela.includes(emp) && !emp.includes(dela)) return false;
    if (nome === "consultar_condicoes") return String(c.entrada?.numero) === String(entrada?.numero ?? "");
    return true;
  });
}

// O ACERVO DE MENTIRA, para exercitar a enviar_material sem tocar no Drive.
//
// Os nomes TÊM ANO de propósito, porque é assim no acervo de verdade ("Book
// Portillo 2026.pdf"), e é daí que vem a armadilha: a conferência de saída barra
// ano que não saiu de ferramenta de espelho. Se o Lucas citar o nome do arquivo
// por educação, a resposta inteira é barrada e a conversa vai para a equipe por
// causa de um arquivo que estava certo. O ensaio existe para pegar isso aqui.
//
// Três empreendimentos, três caminhos: um com escolha, um direto, e um que
// recusa. O que recusa é o mais importante de todos -- é onde o robô não pode
// prometer.
const ACERVO = {
  portillo: ["Book Portillo 2026.pdf", "Tabela de precos Portillo 2026.pdf"],
  riviera: ["Book Riviera 2026.pdf"],
  duetto: null, // a pasta do book não foi liberada para a conta de serviço
};

// A mesma frase que o material.ts monta para toda recusa. Termina sempre igual,
// e é esse fim que o prompt manda obedecer.
const eEntao = (oQueHouve) =>
  `${oQueHouve} NÃO prometa mandar o material: diga que a equipe envia e transfira, ou siga a conversa sem tocar no assunto.`;

const listar = (nomes) => nomes.map((n) => `"${n}"`).join(", ");

export function criarFerramentasDeTeste() {
  const conhecidos = { valores: new Set(), areas: new Set(), quantidades: new Set(), entregas: new Set(), anos: new Set() };
  const chamadas = [];
  let uso = null;
  // UM ARQUIVO POR RODADA, igual ao Trilho: o segundo pedido é recusado sem
  // consultar nada, dizendo qual já vai sair.
  let materialNaFila = null;

  const anotarConhecidos = (c) => {
    for (const v of c?.valores ?? []) conhecidos.valores.add(v);
    for (const a of c?.areas ?? []) conhecidos.areas.add(a);
    for (const q of c?.quantidades ?? []) conhecidos.quantidades.add(q);
    for (const e of c?.entregas ?? []) { conhecidos.entregas.add(e); const ano = Number(String(e).slice(-4)); if (ano) conhecidos.anos.add(ano); }
  };

  async function executar(nome, entrada) {
    let resposta;
    if (nome === "gravar_dados_do_cliente") {
      const feito = ["nome", "email", "empreendimento"].filter((k) => entrada?.[k]);
      resposta = feito.length
        ? `Gravei ${feito.join(", ")}. Não comente com o cliente que registrou nada. [ENSAIO: nada foi gravado de verdade]`
        : "Não veio nada para gravar. Informe nome, e-mail ou empreendimento.";
    } else if (nome === "agendar_visita") {
      resposta = entrada?.quando
        ? "Agendei. Diga ao cliente que a equipe confirma o horário. [ENSAIO: nada foi gravado de verdade]"
        : "Para agendar preciso do título e da data e hora combinadas.";
    } else if (nome === "mover_para_visita") {
      resposta = "Movi o lead para Visita. Não comente isso com o cliente. [ENSAIO: nada foi gravado de verdade]";
    } else if (nome === "marcar_temperatura") {
      const t = String(entrada?.temperatura ?? "").trim();
      resposta = ["quente", "morno", "frio"].includes(t)
        ? `Marquei o lead como ${t}. Não comente isso com o cliente. [ENSAIO: nada foi gravado de verdade]`
        : "Diga a temperatura: quente, morno ou frio.";
    } else if (nome === "enviar_material") {
      if (materialNaFila) {
        resposta = `Nesta mesma resposta você já vai mandar "${materialNaFila}", e ele sai depois da sua mensagem. Mande um arquivo por vez: se o cliente precisar de outro, ofereça na próxima mensagem dele.`;
      } else {
        const chave = Object.keys(ACERVO).find((k) => {
          const e = semAcento(entrada?.empreendimento);
          return e && (k.includes(e) || e.includes(k));
        });
        if (!chave) {
          resposta = "Não achei empreendimento com esse nome. Os empreendimentos à venda são: Portillo, Duetto, Riviera.";
        } else if (!ACERVO[chave]) {
          resposta = eEntao(`O acervo do ${chave} não tem pasta de book de vendas.`);
        } else {
          const arquivos = ACERVO[chave];
          const pedido = typeof entrada?.arquivo === "string" ? entrada.arquivo.trim() : "";
          if (arquivos.length > 1 && !pedido) {
            resposta = `O book do empreendimento tem mais de um arquivo: ${listar(arquivos)}. Chame enviar_material de novo dizendo qual, no campo arquivo. Se não souber qual serve, pergunte ao cliente o que ele quer ver.`;
          } else {
            const casam = pedido ? arquivos.filter((a) => semAcento(a).includes(semAcento(pedido))) : arquivos;
            if (!casam.length) resposta = `Não há arquivo com esse nome no book. Os que existem são: ${listar(arquivos)}.`;
            else if (casam.length > 1) resposta = `Mais de um arquivo do book combina com "${pedido}": ${listar(casam)}. Diga o nome inteiro.`;
            else {
              materialNaFila = casam[0];
              resposta = `Certo, "${casam[0]}" vai ser mandado ao cliente logo depois da sua resposta. Avise que está mandando, com naturalidade, sem repetir o nome do arquivo e sem descrever o conteúdo dele: você não o leu.`;
            }
          }
        }
      }
    } else {
      const c = acharCaptura(nome, entrada);
      if (c) { resposta = c.resposta; anotarConhecidos(c.conhecidos); }
      else if (nome === "consultar_unidades") resposta = "Não há unidade disponível com esses critérios. Não ofereça outra por conta própria: pergunte se o cliente aceita outro critério, ou transfira para a equipe.";
      else if (nome === "consultar_condicoes") resposta = "Não achei essa unidade entre as disponíveis. Não invente entrada nem parcelas: diga que a equipe envia a simulação e transfira.";
      else resposta = `A ferramenta "${nome}" não existe.`;
    }
    chamadas.push({ nome, entrada, resposta });
    return resposta;
  }

  return {
    definicoes: DEFINICOES,
    conhecidos,
    chamadas,
    executar,
    anotarUso(u) {
      uso = {
        modelo: u.modelo || uso?.modelo || "",
        tokensEntrada: (uso?.tokensEntrada ?? 0) + (u.input_tokens ?? 0),
        tokensSaida: (uso?.tokensSaida ?? 0) + (u.output_tokens ?? 0),
        tokensDeCacheLidos: (uso?.tokensDeCacheLidos ?? 0) + (u.cache_read_input_tokens ?? 0),
        tokensDeCacheGravados: (uso?.tokensDeCacheGravados ?? 0) + (u.cache_creation_input_tokens ?? 0),
      };
    },
    usoAcumulado: () => uso,
  };
}
