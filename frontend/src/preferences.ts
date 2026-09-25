// Preferências do usuário guardadas só no navegador (localStorage) — não
// justificam uma tabela nem uma rota no backend. Todo acesso é protegido com
// try/catch: localStorage lança em modo privado/bloqueado, e a tela tem que
// funcionar do mesmo jeito (só sem lembrar a escolha).

const DEFAULT_REGION_KEY = "canalproart:defaultRegion";
const FALLBACK_REGION = "BR";

export function isValidRegionCode(value: string): boolean {
  return /^[A-Z]{2}$/.test(value);
}

export function getDefaultRegion(): string {
  try {
    const stored = window.localStorage.getItem(DEFAULT_REGION_KEY);
    return stored && isValidRegionCode(stored) ? stored : FALLBACK_REGION;
  } catch {
    return FALLBACK_REGION;
  }
}

export function setDefaultRegion(regionCode: string): void {
  try {
    window.localStorage.setItem(DEFAULT_REGION_KEY, regionCode);
  } catch {
    // sem localStorage: a preferência simplesmente não persiste
  }
}
