// O documento 06 cita as metragens como ETIQUETA ("o 96 tem a maior varanda").
// Se a trava barrar a metragem dita sem consulta, o documento novo vira fonte
// de silencio em vez de resposta. Entao as frases que ele vai produzir sao
// rodadas contra a conferencia DE VERDADE, antes de subir.
import { createJiti } from "jiti";
import path from "node:path";
const jiti = createJiti(import.meta.url, { alias: { "@": path.resolve("C:/Users/paulo/trilho/src") } });
const { conferirSaida } = await jiti.import("C:/Users/paulo/trilho/src/lib/ia/saida.ts");

const semConsulta = { valores: new Set(), areas: new Set(), quantidades: new Set(), entregas: new Set(), anos: new Set(), agenda: null };
const comConsulta = { ...semConsulta, areas: new Set([68, 83, 96, 99]) };

const FRASES = [
  'Todas as plantas do Portillo tem varanda, em qualquer metragem.',
  'Sim, tem varanda. A varanda fica junto do estar e jantar.',
  'O apartamento de 96 m2 tem a maior varanda do predio.',
  'A planta de 99 m2 e a unica com lavabo.',
  'Na versao sala ampliada um dos quartos vira extensao da sala.',
  'O 99 na versao sala ampliada tem closet na suite principal.',
  'A medida exata da varanda esta na planta. Posso te mandar o book com tudo cotado.',
];

const rodar = (rotulo, conhecidos) => {
  console.log(`\n### ${rotulo}`);
  let ruins = 0;
  for (const f of FRASES) {
    const r = conferirSaida([f], conhecidos);
    const ok = !(r.ok === false || r.motivo);
    if (!ok) ruins++;
    console.log(`  ${ok ? '✓' : '✗'} ${f.slice(0, 68)}`);
    if (!ok) console.log(`       ${r.detalhe ?? r.motivo}`);
  }
  return ruins;
};

const semRuins = rodar('SEM ter consultado nesta rodada (o pior caso)', semConsulta);
const comRuins = rodar('DEPOIS de consultar as unidades', comConsulta);

console.log(`\n${comRuins ? `✗ ${comRuins} barrada(s) mesmo com consulta: o documento precisa mudar.` : '✓ com consulta, todas passam.'}`);
if (semRuins) console.log(`⚠️ ${semRuins} barrada(s) sem consulta: o prompt precisa exigir a consulta antes de citar a metragem.`);
