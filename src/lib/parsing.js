// Parsing de textarea/input em array — usado no onboarding pra converter os campos
// de texto livre (uma opção por linha, ou separadas por vírgula) nos arrays salvos no banco.
export const linhas = (texto) =>
  texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

export const csv = (texto) =>
  texto
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);
