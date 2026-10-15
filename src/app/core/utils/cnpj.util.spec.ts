import { CNPJ_INPUT_PATTERN, formatCnpj, normalizeCnpj } from './cnpj.util';

describe('institution CNPJ format (INV-003)', () => {
  it.each([
    ['12345678000195', '12345678000195', '12.345.678/0001-95'],
    ['12.345.678/0001-95', '12345678000195', '12.345.678/0001-95'],
    ['00000000E08G12', '00000000E08G12', '00.000.000/E08G-12'],
    ['00.000.000/e08g-12', '00000000E08G12', '00.000.000/E08G-12'],
    ['ab.cde.fgh/ijkl-00', 'ABCDEFGHIJKL00', 'AB.CDE.FGH/IJKL-00'],
    // Format validation deliberately does not impose check digits on old data.
    ['00000000000000', '00000000000000', '00.000.000/0000-00'],
  ])('accepts %s without losing text or leading zeros', (input, canonical, formatted) => {
    expect(CNPJ_INPUT_PATTERN.test(input)).toBe(true);
    expect(normalizeCnpj(input)).toBe(canonical);
    expect(formatCnpj(input)).toBe(formatted);
  });

  it.each([
    '', '00000000E08G1', '00000000E08G123', '00000000E08G1A',
    '00.000000/E08G-12', '00000000/E08G12', '00-000-000/E08G.12',
    '00000000_E08G12', ' 00000000E08G12', '00000000E08G12 ',
    '00000000E08G12\n', 'Á0000000E08G12', 'inválido/histórico',
  ])('rejects %j without silently repairing historical text', input => {
    expect(CNPJ_INPUT_PATTERN.test(input)).toBe(false);
    expect(normalizeCnpj(input)).toBe(input);
    expect(formatCnpj(input)).toBe(input);
  });
});
