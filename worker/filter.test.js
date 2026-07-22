import { describe, it, expect } from 'vitest';
import { filtrarPorModalidade } from './filter.js';

const vagaRemota = { titulo: 'Dev Backend Remoto', descricao: '100% home office' };
const vagaHibrida = { titulo: 'Dev Frontend', descricao: 'regime híbrido, 2x por semana no escritório' };
const vagaPresencial = { titulo: 'Analista', local: 'São Paulo, SP', descricao: 'trabalho presencial' };
const vagaAmbigua = { titulo: 'Dev Fullstack', descricao: 'projetos desafiadores em equipe ágil' };

describe('filtrarPorModalidade', () => {
  it('"qualquer" não filtra nada', () => {
    const vagas = [vagaRemota, vagaHibrida, vagaPresencial, vagaAmbigua];
    expect(filtrarPorModalidade(vagas, 'qualquer')).toEqual(vagas);
    expect(filtrarPorModalidade(vagas, undefined)).toEqual(vagas);
  });

  it('"remoto" mantém vaga remota e ambígua, filtra híbrida/presencial', () => {
    const resultado = filtrarPorModalidade(
      [vagaRemota, vagaHibrida, vagaPresencial, vagaAmbigua],
      'remoto'
    );
    expect(resultado).toContain(vagaRemota);
    expect(resultado).toContain(vagaAmbigua);
    expect(resultado).not.toContain(vagaHibrida);
    expect(resultado).not.toContain(vagaPresencial);
  });

  it('"presencial" mantém presencial e ambígua, filtra remota/híbrida', () => {
    const resultado = filtrarPorModalidade(
      [vagaRemota, vagaHibrida, vagaPresencial, vagaAmbigua],
      'presencial'
    );
    expect(resultado).toContain(vagaPresencial);
    expect(resultado).toContain(vagaAmbigua);
    expect(resultado).not.toContain(vagaRemota);
  });

  it('vaga sem nenhuma menção de modalidade sempre passa (fail-open)', () => {
    expect(filtrarPorModalidade([vagaAmbigua], 'remoto')).toEqual([vagaAmbigua]);
    expect(filtrarPorModalidade([vagaAmbigua], 'hibrido')).toEqual([vagaAmbigua]);
    expect(filtrarPorModalidade([vagaAmbigua], 'presencial')).toEqual([vagaAmbigua]);
  });
});
