// As frases que o v17 vai fazer o Lucas dizer: a trava de saida deixa passar?
//
// ⚠️ O risco e o HORARIO. "das 8h as 16h30" e numero, e esta trava ja calou o
// Lucas num atendimento bom. Nao adianta eu escrever a regra no prompt e o
// `saida.ts` barrar a frase: o cliente fica sem resposta e a conversa morre.
// Entao as frases novas sao rodadas contra a conferencia DE VERDADE, antes de
// o prompt subir.
import { createJiti } from "jiti";
import path from "node:path";
// O `@/` do projeto nao existe fora do Next: o jiti precisa do mesmo apelido
// que o tsconfig dá, senao `saida.ts` nao acha o proprio config.
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.resolve('C:/Users/paulo/trilho/src') },
});
const { conferirSaida } = await jiti.import('C:/Users/paulo/trilho/src/lib/ia/saida.ts');

// Nenhum numero consultado: o pior caso. Se passar assim, passa sempre.
const vazio = {
  valores: new Set(), areas: new Set(), quantidades: new Set(),
  entregas: new Set(), anos: new Set(), agenda: null,
};

const FRASES = [
  ['Portillo, horario da obra', 'Você pode visitar a obra do Portillo em qualquer dia, das 8h às 16h30.'],
  ['Portillo, horario por extenso', 'A obra pode ser visitada das 08h00 às 16h30, com acesso pelo elevador durante a semana.'],
  ['Portillo, sem decorado', 'No Portillo não existe apartamento decorado. O que temos é o stand, em frente à obra, e a própria obra para visitar.'],
  ['Duetto como regua', 'O Duetto é outro empreendimento nosso, já entregue, e serve para você ver de perto o padrão de acabamento da Constren.'],
  ['Riviera, sem nada ainda', 'O Riviera ainda não tem stand nem obra para mostrar. Dá para marcar uma apresentação do projeto na construtora.'],
  ['escritorio como alternativa', 'Se preferir não ir até a obra, posso te receber no escritório. Qual dia fica melhor?'],
  ['sabado com expediente', 'No sábado o acesso pelo elevador depende de haver expediente na obra.'],
  ['convite com horario', 'Qual dia e horário ficam bons para você, de segunda a sexta, entre 8h e 17h?'],
];

let reprovou = 0;
for (const [nome, frase] of FRASES) {
  const r = conferirSaida([frase], vazio);
  const ok = r.ok !== false && !r.motivo;
  if (!ok) reprovou++;
  console.log(`  ${ok ? '✓' : '✗'} ${nome.padEnd(30)} ${ok ? '' : `BARRADA: ${r.motivo} — ${r.detalhe ?? ''}`}`);
}

// Controle negativo: uma frase que TEM de ser barrada. Verde em tudo nao prova
// nada se a trava estiver desligada.
const inventado = conferirSaida(['A varanda tem 8,5 m² e o apartamento sai por R$ 915.900.'], vazio);
const barrouCerto = inventado.ok === false || !!inventado.motivo;
console.log(`\n  ${barrouCerto ? '✓' : '✗'} controle negativo (numero inventado) ${barrouCerto ? 'foi barrado, como tem de ser' : 'PASSOU: a trava nao esta medindo nada'}`);
if (!barrouCerto) reprovou++;

console.log(`\n${reprovou ? `✗ ${reprovou} problema(s)` : '✓ todas as frases do v17 passam, e a trava continua barrando o que deve'}`);
