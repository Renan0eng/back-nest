type JwtSecrets = {
  legacy: string;
  access: string;
  refresh: string;
};

const REQUIRED_JWT_VARIABLES = [
  'JWT_SECRET',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
] as const;

function readSecret(name: (typeof REQUIRED_JWT_VARIABLES)[number]): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  if (value.length < 32) throw new Error(`${name} deve ter ao menos 32 caracteres.`);
  return value;
}

/** Chaves isoladas evitam que o vazamento de uma permita forjar todos os tokens. */
export function getJwtSecrets(): JwtSecrets {
  const secrets: JwtSecrets = {
    legacy: readSecret('JWT_SECRET'),
    access: readSecret('JWT_ACCESS_SECRET'),
    refresh: readSecret('JWT_REFRESH_SECRET'),
  };
  if (new Set(Object.values(secrets)).size !== 3) {
    throw new Error('JWT_SECRET, JWT_ACCESS_SECRET e JWT_REFRESH_SECRET devem usar valores diferentes.');
  }
  return secrets;
}
